-- CanvassCRM core schema
create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ── Tenancy ──────────────────────────────────────────────────
create table orgs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  region text not null default 'us',           -- us | eu | ca
  recording_mode text not null default 'transcript-only',  -- disabled|transcript-only|full
  retention_days int not null default 30,
  plan text not null default 'starter',
  created_at timestamptz default now()
);

create table users (
  id uuid primary key references auth.users(id),
  org_id uuid not null references orgs(id) on delete cascade,
  role text not null check (role in ('rep','lead','manager','admin','auditor')),
  full_name text,
  phone text,
  active boolean default true,
  created_at timestamptz default now()
);
create index on users(org_id);

-- ── Territory ────────────────────────────────────────────────
create table territories (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  polygon geography(Polygon, 4326) not null,
  assigned_to uuid references users(id),
  created_at timestamptz default now()
);
create index on territories using gist(polygon);
create index on territories(org_id);

-- ── Doors / addresses ────────────────────────────────────────
create table addresses (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id),
  point geography(Point, 4326) not null,
  street text, city text, region text, postal text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  unique(org_id, street, postal)
);
create index on addresses using gist(point);
create index on addresses(org_id);

create type door_status as enum (
  'unknocked','no_answer','not_home','callback','interested',
  'sold','not_interested','dnc','no_soliciting','spanish_only','language_barrier'
);

create table doors (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id),
  address_id uuid not null references addresses(id),
  status door_status not null default 'unknocked',
  last_knocked_at timestamptz,
  last_rep uuid references users(id),
  contact_name text,
  notes text,
  updated_at timestamptz default now()
);
create index on doors(org_id, status);
create index on doors(address_id);

-- ── Knocks (every interaction, append-only history) ──────────
create table knocks (
  id bigserial primary key,
  org_id uuid not null references orgs(id),
  door_id uuid not null references doors(id),
  rep_id uuid not null references users(id),
  outcome door_status not null,
  point geography(Point,4326) not null,         -- where rep actually stood
  duration_seconds int,
  occurred_at timestamptz not null default now()
);
create index on knocks(org_id, occurred_at desc);
create index on knocks(rep_id, occurred_at desc);

-- ── Recordings + transcripts + intents ──────────────────────
create table recordings (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id),
  knock_id bigint references knocks(id) on delete cascade,
  rep_id uuid not null references users(id),
  storage_key text not null,                     -- supabase storage path
  duration_seconds int,
  consent_announced boolean not null default false,
  encrypted boolean not null default true,
  expires_at timestamptz,                        -- auto-purge per retention_days
  created_at timestamptz default now()
);
create index on recordings(org_id, created_at desc);

create table transcripts (
  recording_id uuid primary key references recordings(id) on delete cascade,
  text text not null,
  language text default 'en',
  asr_engine text not null,                      -- whisper.cpp | whisper-server
  created_at timestamptz default now()
);

create table intents (
  id bigserial primary key,
  recording_id uuid references recordings(id) on delete cascade,
  org_id uuid not null references orgs(id),
  outcome door_status,
  follow_up_at timestamptz,
  decision_maker text,
  objections text[],
  budget_signal text,
  family_signal text,
  raw jsonb,
  model text not null default 'claude-haiku-4-5-20251001',
  created_at timestamptz default now()
);
create index on intents(org_id, follow_up_at);

-- ── Callbacks (geofence-aware) ──────────────────────────────
create table callbacks (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id),
  door_id uuid not null references doors(id),
  rep_id uuid references users(id),
  scheduled_for timestamptz not null,
  window_minutes int default 60,
  notify_radius_m int default 100,
  status text default 'pending' check (status in ('pending','notified','done','missed','cancelled')),
  created_at timestamptz default now()
);
create index on callbacks(org_id, scheduled_for);

-- ── Sales + commissions ─────────────────────────────────────
create table sales (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id),
  door_id uuid references doors(id),
  rep_id uuid not null references users(id),
  amount_cents bigint not null,
  product text,
  contract_url text,
  signed_at timestamptz default now()
);
create index on sales(org_id, signed_at desc);

create table commissions (
  id bigserial primary key,
  org_id uuid not null references orgs(id),
  rep_id uuid not null references users(id),
  sale_id uuid references sales(id),
  amount_cents bigint not null,
  status text default 'pending' check (status in ('pending','approved','paid','clawback')),
  payable_at date,
  created_at timestamptz default now()
);

-- ── Audit log (append-only, no update/delete) ───────────────
create table audit_log (
  id bigserial primary key,
  org_id uuid not null,
  actor_id uuid,
  action text not null,
  resource_type text,
  resource_id text,
  diff jsonb,
  ip inet,
  ua text,
  created_at timestamptz default now()
);
create index on audit_log(org_id, created_at desc);
revoke update, delete on audit_log from public;

-- ── Referrals ───────────────────────────────────────────────
create table referral_codes (
  user_id uuid primary key references users(id),
  code text unique not null,
  created_at timestamptz default now()
);
create table referrals (
  id bigserial primary key,
  code text references referral_codes(code),
  inviter_id uuid not null,
  invitee_id uuid not null unique,
  reward_status text default 'pending',
  created_at timestamptz default now()
);

-- ── RLS ─────────────────────────────────────────────────────
alter table orgs enable row level security;
alter table users enable row level security;
alter table territories enable row level security;
alter table addresses enable row level security;
alter table doors enable row level security;
alter table knocks enable row level security;
alter table recordings enable row level security;
alter table transcripts enable row level security;
alter table intents enable row level security;
alter table callbacks enable row level security;
alter table sales enable row level security;
alter table commissions enable row level security;
alter table audit_log enable row level security;

create or replace function current_org() returns uuid language sql stable as $$
  select org_id from users where id = auth.uid()
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'territories','addresses','doors','knocks','recordings','transcripts',
    'intents','callbacks','sales','commissions','audit_log'
  ]) loop
    execute format($f$
      create policy org_select on %I for select using (org_id = current_org());
      create policy org_insert on %I for insert with check (org_id = current_org());
      create policy org_update on %I for update using (org_id = current_org());
    $f$, t, t, t);
  end loop;
end$$;

-- Users: see own org only
create policy users_select on users for select using (org_id = current_org());
create policy orgs_select on orgs for select using (id = current_org());

-- ── Helpful spatial queries ─────────────────────────────────
-- Doors within 100m of a point
-- select * from doors d join addresses a on a.id=d.address_id
--   where ST_DWithin(a.point, ST_MakePoint(:lng,:lat)::geography, 100);

-- Callbacks the rep is currently near & within window
-- select * from callbacks c join doors d on d.id=c.door_id
--   join addresses a on a.id=d.address_id
--   where c.rep_id = auth.uid()
--     and c.status='pending'
--     and now() between c.scheduled_for - interval '15 min' and c.scheduled_for + (c.window_minutes || ' min')::interval
--     and ST_DWithin(a.point, ST_MakePoint(:lng,:lat)::geography, c.notify_radius_m);
