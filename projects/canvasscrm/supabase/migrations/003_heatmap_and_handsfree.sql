-- HEATMAP + HANDS-FREE BACKEND
-- Adds the data model and aggregations needed for hands-free canvassing,
-- street-level heatmaps, and time-of-day performance analytics.

-- 1. Mark knocks created without a manual tap (auto-detected via dwell+VAD)
alter table knocks add column if not exists auto boolean not null default false;
alter table knocks add column if not exists dwell_seconds int;
alter table knocks add column if not exists captured_at timestamptz not null default now();
alter table knocks add column if not exists lat double precision;
alter table knocks add column if not exists lng double precision;
alter table knocks add column if not exists geom geography(Point, 4326)
  generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored;
create index if not exists knocks_geom_gix on knocks using gist (geom);
create index if not exists knocks_captured_idx on knocks (captured_at);

-- 2. Mini-transcripts attached to a knock (sub-conversation snippets)
create table if not exists knock_transcripts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  knock_id uuid not null references knocks(id) on delete cascade,
  audio_path text,
  text text not null,
  duration_ms int,
  speaker text,           -- 'rep' | 'prospect' | null
  created_at timestamptz not null default now()
);
create index if not exists knock_transcripts_knock_idx on knock_transcripts (knock_id);

alter table knock_transcripts enable row level security;
do $$ begin
  perform 1 from pg_policies where tablename='knock_transcripts' and policyname='kt_org_select';
  if not found then
    execute 'create policy kt_org_select on knock_transcripts for select using (org_id = current_org())';
    execute 'create policy kt_org_insert on knock_transcripts for insert with check (org_id = current_org())';
  end if;
end $$;

-- 3. Breadcrumb trail of every position the rep walked through
create table if not exists rep_breadcrumbs (
  id bigserial primary key,
  org_id uuid not null,
  user_id uuid not null,
  recorded_at timestamptz not null,
  speed_mps double precision,
  geom geography(Point, 4326) not null
);
create index if not exists breadcrumbs_user_time_idx on rep_breadcrumbs (user_id, recorded_at);
create index if not exists breadcrumbs_geom_gix on rep_breadcrumbs using gist (geom);

alter table rep_breadcrumbs enable row level security;
do $$ begin
  perform 1 from pg_policies where tablename='rep_breadcrumbs' and policyname='bc_org_select';
  if not found then
    execute 'create policy bc_org_select on rep_breadcrumbs for select using (org_id = current_org())';
    execute 'create policy bc_org_insert on rep_breadcrumbs for insert with check (org_id = current_org())';
  end if;
end $$;

-- 4. HEATMAP — pre-aggregated knock density per ~25m grid cell per hour.
-- ST_SnapToGrid in geographic units bucketed at ~0.00025 deg (~28m at equator)
create materialized view if not exists knock_heatmap_hourly as
select
  org_id,
  date_trunc('hour', captured_at) as hour,
  st_snaptogrid(geom::geometry, 0.00025, 0.00025) as cell,
  count(*) as knocks,
  count(*) filter (where status in ('interested','sold','callback')) as positive,
  count(*) filter (where status = 'sold') as sold
from knocks
where lat is not null and lng is not null
group by 1,2,3;

create index if not exists knock_heatmap_hourly_idx
  on knock_heatmap_hourly (org_id, hour);

-- Refresh helper (call from a 5-minute cron edge function)
create or replace function refresh_heatmap() returns void
language sql as $$
  refresh materialized view concurrently knock_heatmap_hourly;
$$;

-- 5. STREET HEATMAP — knocks grouped by street name (parsed from address)
create or replace view knock_street_summary as
select
  k.org_id,
  split_part(a.line1, ' ', 2) as street,
  date_trunc('day', k.captured_at)::date as day,
  count(*) as total_knocks,
  count(*) filter (where k.status='sold') as sold,
  count(*) filter (where k.status in ('interested','callback')) as positive,
  round(100.0 * count(*) filter (where k.status='sold') / nullif(count(*),0), 1) as conv_pct
from knocks k
join doors d on d.id = k.door_id
join addresses a on a.id = d.address_id
group by 1,2,3;

-- 6. TIME-OF-DAY ANALYTICS — which hour-of-day works for this rep on this street
create or replace view rep_hour_performance as
select
  k.org_id,
  k.user_id,
  extract(dow  from k.captured_at)::int as dow,
  extract(hour from k.captured_at)::int as hour,
  count(*) as knocks,
  count(*) filter (where k.status='sold') as sold,
  count(*) filter (where k.status in ('interested','callback')) as positive,
  round(100.0 * count(*) filter (where k.status='sold') / nullif(count(*),0), 2) as conv_pct
from knocks k
group by 1,2,3,4;

-- 7. DWELL → KNOCK rule guard. If hands-free creates the same dwell twice
-- inside 90 seconds for the same door, merge them.
create or replace function fn_dedupe_auto_knocks() returns trigger
language plpgsql as $$
begin
  if new.auto then
    if exists (
      select 1 from knocks
      where door_id = new.door_id
        and auto = true
        and captured_at > now() - interval '90 seconds'
        and id <> new.id
    ) then
      return null; -- skip duplicate
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_dedupe_auto_knocks on knocks;
create trigger trg_dedupe_auto_knocks
before insert on knocks
for each row execute function fn_dedupe_auto_knocks();
