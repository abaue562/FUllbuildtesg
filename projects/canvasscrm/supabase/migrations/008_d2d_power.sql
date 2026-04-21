-- MIGRATION 008 — D2D / Canvasser Power Features
-- Everything that makes a door-to-door operation unstoppable.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. NEIGHBOR RIPPLE QUEUE
-- When a sale closes, the 6 closest unworked doors automatically get
-- promoted to "hot" in the door_scores table and pushed to the rep's
-- active route. Momentum selling — the whole street feels it.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function fn_neighbor_ripple() returns trigger
language plpgsql as $$
declare
  sold_geom geography;
  neighbor record;
begin
  if new.status = 'sold' then
    -- Get geometry of the sold door
    select d.geom into sold_geom
    from knocks k join doors d on d.id = k.door_id
    where k.id = new.id limit 1;

    if sold_geom is null then return new; end if;

    -- Find 6 nearest unworked doors within 150m and boost their score
    for neighbor in
      select d.id
      from doors d
      where d.org_id = new.org_id
        and d.status = 'unknocked'
        and st_dwithin(d.geom, sold_geom, 150)
      order by st_distance(d.geom, sold_geom) asc
      limit 6
    loop
      insert into door_scores (door_id, org_id, score, factors, computed_at)
      values (neighbor.id, new.org_id, 88,
              '{"neighbor_sale": 1.0, "ripple": true}'::jsonb,
              now())
      on conflict (door_id) do update
        set score = least(100, door_scores.score + 30),
            factors = door_scores.factors || '{"neighbor_sale": 1.0}'::jsonb,
            computed_at = now();
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_neighbor_ripple on knocks;
create trigger trg_neighbor_ripple
after update on knocks
for each row execute function fn_neighbor_ripple();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. APPOINTMENT SETTER MODE
-- Alternative workflow: goal is booking appointments, not closing at door.
-- Tracks appointment slots, shows/no-shows, and rep who set vs closed.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  door_id uuid references doors(id),
  knock_id uuid references knocks(id),
  set_by uuid references users(id),          -- rep who booked it at the door
  closed_by uuid references users(id),        -- closer who runs the appointment
  customer_name text,
  phone text,
  email text,
  scheduled_at timestamptz not null,
  duration_minutes int default 60,
  address text,
  status text default 'scheduled',            -- scheduled|confirmed|completed|no_show|cancelled
  notes text,
  set_at timestamptz default now(),
  confirmed_at timestamptz,
  outcome text,                               -- sold|not_sold|follow_up|reschedule
  sale_amount numeric,
  commission_setter numeric,                  -- setter's portion (e.g. 30% of commission)
  commission_closer numeric                   -- closer's portion
);
create index if not exists appts_scheduled_idx on appointments (scheduled_at);
create index if not exists appts_closer_idx on appointments (closed_by, scheduled_at);

-- Setter vs closer split configuration
alter table commission_rules add column if not exists
  setter_split_pct numeric default 30;     -- setter gets 30%, closer gets 70%

-- ─────────────────────────────────────────────────────────────────────────
-- 3. COMPETITIVE DISPLACEMENT
-- Track competitor products at every door. Trigger specific counter-scripts.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists competitor_counter_scripts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  competitor text not null,                  -- 'ADT','Ring','Vivint','SunRun','Tesla Solar'
  opener text not null,                      -- what to say first
  key_differentiators text[],
  price_anchor text,
  proof_point text,
  created_at timestamptz default now()
);

-- View: doors with competitor + script ready to fire
create or replace view competitor_ready_doors as
select
  cs.door_id,
  cs.competitor,
  cs.evidence,
  sc.opener,
  sc.key_differentiators,
  sc.price_anchor,
  sc.proof_point
from competitor_sightings cs
left join competitor_counter_scripts sc
  on lower(sc.competitor) = lower(cs.competitor)
  and sc.org_id = cs.org_id;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. TRAINING / SHADOW MODE
-- New rep listens to a senior rep's live session.
-- Shadow rep gets the same earpiece suggestions + can see live transcript.
-- Trainer can also push notes / feedback in real-time.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists shadow_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  trainer_id uuid not null references users(id),
  trainee_id uuid not null references users(id),
  shift_session_id uuid references shift_sessions(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  trainer_feedback text[],               -- real-time notes pushed from trainer
  trainee_score int,                     -- post-shift coaching score 0-100
  notes text
);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. HOA / APARTMENT / RESTRICTED PROPERTY FLAGS
-- Automatically tag addresses that have restrictions on soliciting.
-- Sources: manual flag, AI OCR from photos, crowd-sourced from other reps.
-- ─────────────────────────────────────────────────────────────────────────
alter table addresses add column if not exists property_type text default 'residential';
  -- residential|apartment|condo|mobile_home|commercial|hoa|gated|military

alter table addresses add column if not exists hoa boolean default false;
alter table addresses add column if not exists gated boolean default false;
alter table addresses add column if not exists no_solicit_ordinance boolean default false;
alter table addresses add column if not exists permit_required boolean default false;
alter table addresses add column if not exists permit_number text;
alter table addresses add column if not exists units int default 1;   -- apartments: # of units

-- Multi-unit building: each unit is a separate door
create table if not exists building_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  address_id uuid not null references addresses(id),
  unit_number text not null,
  door_id uuid references doors(id),
  floor int,
  status text default 'unknocked',
  created_at timestamptz default now()
);
create index if not exists building_units_addr_idx on building_units (address_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. TEAM SHIFT COMPETITION
-- Real-time leaderboard during a shift. Teams compete against each other.
-- Every sale fires a broadcast. Trash talk encouraged.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  color text default '#3A8540',
  emoji text default '🔥',
  manager_id uuid references users(id)
);

alter table users add column if not exists team_id uuid references teams(id);

create or replace view team_leaderboard_live as
select
  t.id as team_id,
  t.name,
  t.color,
  t.emoji,
  count(k.id) as knocks,
  count(k.id) filter (where k.status = 'sold') as sales,
  sum(s.amount) as revenue,
  round(100.0 * count(k.id) filter (where k.status='sold') / nullif(count(k.id),0), 1) as conv_pct
from teams t
join users u on u.team_id = t.id
left join knocks k on k.user_id = u.id and k.captured_at::date = current_date
left join sales s on s.knock_id = k.id
group by t.id, t.name, t.color, t.emoji
order by sales desc, knocks desc;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. LEAVE-BEHIND TRACKING
-- When a rep leaves a door hanger / QR card at a no-answer door,
-- track if the customer scans it and logs in.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists door_hangers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  door_id uuid references doors(id),
  knock_id uuid references knocks(id),
  rep_id uuid references users(id),
  qr_code text not null,               -- unique QR payload → landing page
  left_at timestamptz default now(),
  scanned_at timestamptz,
  converted boolean default false,     -- did they become a lead / book?
  landing_url text
);
create index if not exists hangers_door_idx on door_hangers (door_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. PERMIT MANAGEMENT
-- After a sale, some products require a permit. Track status.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists permits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  sale_id uuid references sales(id),
  door_id uuid references doors(id),
  permit_type text,                    -- electrical|roofing|structural|hoa_approval
  jurisdiction text,
  application_date date,
  approved_date date,
  permit_number text,
  status text default 'not_started',  -- not_started|applied|pending|approved|rejected|expired
  notes text,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. IMPACT TRACKER (for green products: solar, HVAC, insulation)
-- Shows the rep and customer the real-world impact of the sale.
-- "You just saved 4.2 tons of CO2 per year."
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists sale_impact (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  sale_id uuid references sales(id),
  co2_tons_per_year numeric,
  kwh_saved_per_year numeric,
  trees_equivalent numeric,
  dollars_saved_per_year numeric,
  payback_years numeric,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. RLS for all new tables
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'appointments','competitor_counter_scripts','shadow_sessions',
    'building_units','teams','door_hangers','permits','sale_impact'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_sel on %I', t, t);
    execute format('drop policy if exists %I_ins on %I', t, t);
    execute format('create policy %I_sel on %I for select using (org_id = current_org())', t, t);
    execute format('create policy %I_ins on %I for insert with check (org_id = current_org())', t, t);
  end loop;
end $$;
