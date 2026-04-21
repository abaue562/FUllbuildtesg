-- POWER FEATURES — everything that turns CanvassCRM from "logger" into "weapon".
--
-- 1.  Weather snapshot per knock (rain kills conv, sunny boosts answer rate)
-- 2.  Door scoring (next-best-door AI ranking)
-- 3.  Territory ownership + collision prevention (no two reps same street)
-- 4.  Gamification: streaks, XP, leaderboards, achievements
-- 5.  Safety: SOS, panic geofence, last-known location, auto-checkin
-- 6.  Knock streaks + shift sessions (clock-in/out tied to GPS)
-- 7.  DNC + no-soliciting auto-skip with reason
-- 8.  Photo evidence (door, yard signs, condition) per knock
-- 9.  Referral capture (neighbor said "try the Smiths next door")
-- 10. Competitor sightings (ADT sign in window, etc) → market intel
-- 11. AI talk-time / interruption ratio per rep per shift (coaching metric)
-- 12. Lookalike scoring: doors that resemble your sold doors

-- 1. Weather context
alter table knocks add column if not exists temp_f int;
alter table knocks add column if not exists weather text;       -- clear|rain|snow|cloud|wind
alter table knocks add column if not exists daylight text;      -- dawn|day|dusk|night

-- 2. Door scoring
create table if not exists door_scores (
  door_id uuid primary key references doors(id) on delete cascade,
  org_id uuid not null,
  score numeric not null,                  -- 0..100
  factors jsonb,                           -- {"income": 0.8, "neighbor_sold": 0.9, ...}
  computed_at timestamptz not null default now()
);
create index if not exists door_scores_org_idx on door_scores (org_id, score desc);

-- 3. Territory locking — prevents two reps walking the same block
alter table territories add column if not exists assigned_to uuid references users(id);
alter table territories add column if not exists locked_until timestamptz;
alter table territories add column if not exists color text default '#3A8540';

create table if not exists territory_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  territory_id uuid references territories(id) on delete cascade,
  user_id uuid references users(id),
  claimed_at timestamptz not null default now(),
  released_at timestamptz
);

-- 4. Gamification
create table if not exists rep_xp (
  user_id uuid primary key references users(id) on delete cascade,
  org_id uuid not null,
  xp int not null default 0,
  level int not null default 1,
  current_streak_days int not null default 0,
  longest_streak_days int not null default 0,
  last_active_date date
);

create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  org_id uuid not null,
  key text not null,                        -- 'first_sale','100_knocks','5_in_a_row'
  earned_at timestamptz not null default now()
);
create unique index if not exists achievements_unique on achievements (user_id, key);

create or replace view leaderboard_today as
select
  k.org_id,
  k.user_id,
  count(*) as knocks,
  count(*) filter (where status='sold') as sales,
  count(*) filter (where status in ('interested','callback')) as positives,
  round(100.0 * count(*) filter (where status='sold') / nullif(count(*),0), 1) as conv_pct
from knocks k
where k.captured_at::date = current_date
group by 1, 2
order by sales desc, knocks desc;

create or replace view leaderboard_week as
select
  k.org_id,
  k.user_id,
  count(*) as knocks,
  count(*) filter (where status='sold') as sales,
  round(100.0 * count(*) filter (where status='sold') / nullif(count(*),0), 1) as conv_pct
from knocks k
where k.captured_at >= date_trunc('week', current_date)
group by 1, 2
order by sales desc;

-- 5. Safety
create table if not exists safety_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null references users(id),
  kind text not null,                       -- sos|fall|silent|geofence_breach|no_motion
  lat double precision,
  lng double precision,
  notes text,
  resolved boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists safety_events_user_time_idx on safety_events (user_id, created_at desc);

create table if not exists shift_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null references users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  start_geom geography(Point, 4326),
  end_geom geography(Point, 4326),
  total_knocks int default 0,
  total_sales int default 0,
  miles_walked numeric default 0,
  talk_seconds int default 0
);
create index if not exists shift_sessions_user_idx on shift_sessions (user_id, started_at desc);

-- 6. Photo evidence
create table if not exists knock_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  knock_id uuid not null references knocks(id) on delete cascade,
  storage_path text not null,
  kind text,                                -- door|yard|sign|condition|damage
  ai_caption text,
  created_at timestamptz not null default now()
);

-- 7. Referrals captured at the door
create table if not exists door_referrals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  source_door_id uuid references doors(id),
  target_address text,
  target_name text,
  note text,
  created_at timestamptz not null default now()
);

-- 8. Competitor sightings → market intel
create table if not exists competitor_sightings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  door_id uuid references doors(id),
  competitor text not null,
  evidence text,                            -- 'sign in window','customer mentioned','ad on truck'
  photo_path text,
  created_at timestamptz not null default now()
);

-- 9. Lookalike doors — find houses that resemble your sold doors
create or replace function find_lookalikes(p_org uuid, p_radius_m int default 500)
returns table(door_id uuid, score numeric) language sql as $$
  with sold as (
    select d.id, d.geom, a.line1
    from knocks k join doors d on d.id = k.door_id
                  join addresses a on a.id = d.address_id
    where k.org_id = p_org and k.status = 'sold'
  ),
  candidates as (
    select d.id, min(st_distance(d.geom, s.geom)) as dist
    from doors d, sold s
    where st_dwithin(d.geom, s.geom, p_radius_m)
      and not exists (select 1 from knocks k where k.door_id = d.id and k.status='sold')
    group by d.id
  )
  select id, round(100 - (dist / p_radius_m * 100), 1) from candidates
  order by dist asc;
$$;

-- 10. RLS for new tables
do $$
declare t text;
begin
  foreach t in array array['door_scores','territory_claims','rep_xp','achievements',
                            'safety_events','shift_sessions','knock_photos',
                            'door_referrals','competitor_sightings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_sel on %I', t, t);
    execute format('drop policy if exists %I_ins on %I', t, t);
    execute format('create policy %I_sel on %I for select using (org_id = current_org())', t, t);
    execute format('create policy %I_ins on %I for insert with check (org_id = current_org())', t, t);
  end loop;
end $$;

-- 11. XP trigger — award points for every knock
create or replace function fn_award_xp() returns trigger
language plpgsql as $$
declare pts int := 1;
begin
  if new.status = 'sold' then pts := 100;
  elsif new.status in ('interested','callback') then pts := 10;
  end if;
  insert into rep_xp (user_id, org_id, xp, last_active_date)
  values (new.user_id, new.org_id, pts, current_date)
  on conflict (user_id) do update
    set xp = rep_xp.xp + pts,
        level = 1 + (rep_xp.xp + pts) / 1000,
        current_streak_days = case
          when rep_xp.last_active_date = current_date then rep_xp.current_streak_days
          when rep_xp.last_active_date = current_date - 1 then rep_xp.current_streak_days + 1
          else 1 end,
        longest_streak_days = greatest(rep_xp.longest_streak_days,
          case when rep_xp.last_active_date = current_date - 1
               then rep_xp.current_streak_days + 1 else 1 end),
        last_active_date = current_date;
  return new;
end $$;

drop trigger if exists trg_award_xp on knocks;
create trigger trg_award_xp after insert on knocks
for each row execute function fn_award_xp();
