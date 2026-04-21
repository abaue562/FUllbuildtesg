-- DOOR SIGNALS — every meaningful thing the customer said at the door.
-- Powers callback scheduling, FAQ mining, objection libraries, and per-door
-- memory ("last time you said come back in 3 months — I'm back").

-- 1. Structured callback requests parsed from conversation.
create table if not exists door_callbacks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  door_id uuid not null references doors(id) on delete cascade,
  knock_id uuid references knocks(id) on delete set null,
  requested_at timestamptz not null default now(),
  callback_at timestamptz,           -- absolute time the customer asked for
  relative_phrase text,              -- "in 3 months", "next tuesday after 5"
  window_start timestamptz,          -- resolved range start
  window_end timestamptz,            -- resolved range end
  reason text,                       -- "spouse decides", "busy now", "after taxes"
  decision_maker text,               -- "wife", "husband", "manager"
  confidence numeric,                -- 0..1 from Claude
  source text default 'voice',       -- 'voice' | 'manual'
  status text default 'pending',     -- pending|scheduled|done|missed|cancelled
  created_at timestamptz not null default now()
);
create index if not exists door_callbacks_due_idx on door_callbacks (callback_at);
create index if not exists door_callbacks_door_idx on door_callbacks (door_id);

-- 2. Customer questions asked at the door — feeds the FAQ + objection library.
create table if not exists door_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  door_id uuid not null references doors(id) on delete cascade,
  knock_id uuid references knocks(id) on delete set null,
  question text not null,
  category text,                     -- pricing|warranty|install|financing|legal|trust|other
  answered boolean default false,
  rep_answer text,
  created_at timestamptz not null default now()
);
create index if not exists door_questions_door_idx on door_questions (door_id);
create index if not exists door_questions_category_idx on door_questions (category);

-- 3. Objections raised — "too expensive", "renting", "have one already".
create table if not exists door_objections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  door_id uuid not null references doors(id) on delete cascade,
  knock_id uuid references knocks(id) on delete set null,
  text text not null,
  category text,                     -- price|timing|trust|need|authority|competitor
  created_at timestamptz not null default now()
);

-- 4. Free-form structured facts mined from the conversation. Anything the
-- customer volunteered that's worth remembering on the next visit.
-- Examples: {"key":"roof_age","value":"12 years"}, {"key":"kids","value":"3"},
-- {"key":"pet","value":"big dog"}, {"key":"competitor","value":"ADT"}.
create table if not exists door_facts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  door_id uuid not null references doors(id) on delete cascade,
  knock_id uuid references knocks(id) on delete set null,
  key text not null,
  value text not null,
  confidence numeric,
  created_at timestamptz not null default now()
);
create index if not exists door_facts_door_key_idx on door_facts (door_id, key);

-- 5. Sentiment + intent signals per knock.
alter table knocks add column if not exists sentiment text;          -- pos|neutral|neg
alter table knocks add column if not exists buying_signal text;      -- hot|warm|cold
alter table knocks add column if not exists decision_maker_present boolean;
alter table knocks add column if not exists language text;
alter table knocks add column if not exists summary text;            -- 1-line AI summary

-- 6. RLS for the new tables
do $$
declare t text;
begin
  foreach t in array array['door_callbacks','door_questions','door_objections','door_facts']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_sel on %I', t, t);
    execute format('drop policy if exists %I_ins on %I', t, t);
    execute format('drop policy if exists %I_upd on %I', t, t);
    execute format('create policy %I_sel on %I for select using (org_id = current_org())', t, t);
    execute format('create policy %I_ins on %I for insert with check (org_id = current_org())', t, t);
    execute format('create policy %I_upd on %I for update using (org_id = current_org())', t, t);
  end loop;
end $$;

-- 7. Door memory view — everything we know about a single door, ready to
-- show on the next visit so the rep can say "Hi again, last time…".
create or replace view door_memory as
select
  d.id as door_id,
  d.org_id,
  (select count(*) from knocks k where k.door_id = d.id) as total_knocks,
  (select max(captured_at) from knocks k where k.door_id = d.id) as last_visit,
  (select status from knocks k where k.door_id = d.id order by captured_at desc limit 1) as last_status,
  (select callback_at from door_callbacks c where c.door_id = d.id and status='pending'
     order by callback_at asc limit 1) as next_callback,
  (select jsonb_agg(jsonb_build_object('key',key,'value',value))
     from door_facts f where f.door_id = d.id) as facts,
  (select jsonb_agg(jsonb_build_object('q',question,'cat',category))
     from door_questions q where q.door_id = d.id) as questions,
  (select jsonb_agg(jsonb_build_object('text',text,'cat',category))
     from door_objections o where o.door_id = d.id) as objections
from doors d;

-- 8. Automatic enrollment: when a callback is parsed, schedule a reminder
-- sequence to ping the rep at the right time.
create or replace function fn_callback_enroll() returns trigger
language plpgsql as $$
begin
  if new.callback_at is not null then
    insert into sequence_enrollments (org_id, sequence_key, subject_type, subject_id, next_run_at)
    values (new.org_id, 'callback_reminder', 'door', new.door_id,
            new.callback_at - interval '30 minutes');
  end if;
  return new;
end $$;

drop trigger if exists trg_callback_enroll on door_callbacks;
create trigger trg_callback_enroll
after insert on door_callbacks
for each row execute function fn_callback_enroll();
