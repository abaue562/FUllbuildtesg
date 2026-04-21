-- MIGRATION 007 — E-Signature, Social Proof, Dispatch, Completion Tracking
-- and every other power feature that makes this unstoppable in the field.

-- ─────────────────────────────────────────────
-- 1. E-SIGNATURE AT THE DOOR
-- Customer signs on the rep's phone screen right at the door.
-- Stores SVG path data + hash + timestamp + GPS for legal validity.
-- ─────────────────────────────────────────────
create table if not exists signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  door_id uuid references doors(id),
  knock_id uuid references knocks(id),
  sale_id uuid references sales(id),
  signer_name text not null,
  signer_type text default 'customer',       -- customer|witness|rep
  svg_data text not null,                    -- raw SVG path string
  svg_hash text not null,                    -- sha256 of svg_data for tamper-proof
  ip_address text,
  lat double precision,
  lng double precision,
  device_info jsonb,
  signed_at timestamptz not null default now(),
  document_key text,                         -- which doc was signed: 'contract','disclosure','dnc_waiver'
  pdf_path text                              -- generated signed PDF stored in Supabase Storage
);
create index if not exists signatures_door_idx on signatures (door_id);
create index if not exists signatures_sale_idx on signatures (sale_id);

-- ─────────────────────────────────────────────
-- 2. SOCIAL PROOF ENGINE
-- Tracks which addresses on a street have bought so we can tell prospects
-- "3 of your neighbors already use us" — verified, not made up.
-- ─────────────────────────────────────────────
create or replace view street_social_proof as
select
  a.street,
  a.city,
  k.org_id,
  count(distinct d.id) filter (where k.status = 'sold') as sold_count,
  count(distinct d.id) filter (where k.status = 'interested') as interested_count,
  max(k.captured_at) filter (where k.status = 'sold') as last_sale_at,
  -- "your neighbor at 142 just signed up" — anonymized to block number
  (select concat(floor(a2.street_number / 100) * 100, ' block')
   from addresses a2
   join doors d2 on d2.address_id = a2.id
   join knocks k2 on k2.door_id = d2.id
   where a2.street = a.street and k2.status = 'sold' and k2.org_id = k.org_id
   order by k2.captured_at desc limit 1) as latest_sold_block
from knocks k
join doors d on d.id = k.door_id
join addresses a on a.id = d.address_id
group by a.street, a.city, k.org_id;

-- ─────────────────────────────────────────────
-- 3. MANAGER DISPATCH
-- Manager pushes a list of priority door_ids to a specific rep.
-- Rep gets a push notification + their route updates in real-time.
-- ─────────────────────────────────────────────
create table if not exists dispatch_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  from_user_id uuid not null references users(id),   -- manager
  to_user_id uuid not null references users(id),     -- rep
  door_ids uuid[] not null,
  priority text default 'normal',                     -- urgent|high|normal
  note text,
  expires_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dispatch_rep_idx on dispatch_orders (to_user_id, created_at desc);

-- ─────────────────────────────────────────────
-- 4. STREET COMPLETION TRACKER
-- Shows what % of every street has been knocked, skipped, or sold.
-- Powers the "finish this street" push notification.
-- ─────────────────────────────────────────────
create or replace view street_completion as
select
  a.street,
  a.city,
  d.org_id,
  count(distinct d.id) as total_doors,
  count(distinct d.id) filter (where d.status != 'unknocked') as worked_doors,
  count(distinct d.id) filter (where d.status = 'sold') as sold_doors,
  count(distinct d.id) filter (where d.status in ('dnc','no_soliciting')) as skipped_doors,
  round(100.0 * count(distinct d.id) filter (where d.status != 'unknocked')
        / nullif(count(distinct d.id), 0), 1) as pct_worked,
  round(100.0 * count(distinct d.id) filter (where d.status = 'sold')
        / nullif(count(distinct d.id) filter (where d.status != 'unknocked' and d.status not in ('dnc','no_soliciting')), 0), 1) as conv_pct
from doors d
join addresses a on a.id = d.address_id
group by a.street, a.city, d.org_id;

-- ─────────────────────────────────────────────
-- 5. LIVE COMMISSION EVENTS (Realtime feed)
-- Every time a sale is closed, broadcast to the whole team channel.
-- "🔥 Andrew just closed $3,200 on Maple St" — team morale engine.
-- ─────────────────────────────────────────────
create table if not exists commission_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  event_type text not null,   -- sale|milestone|streak|achievement
  amount numeric,
  message text not null,
  street text,
  created_at timestamptz not null default now()
);
-- Supabase Realtime listens to this table — mobile subscribes to fire-and-forget push

create or replace function fn_broadcast_sale() returns trigger
language plpgsql as $$
declare
  rep_name text;
  street_name text;
begin
  select display_name into rep_name from users where id = new.user_id;
  select a.street into street_name
    from knocks k join doors d on d.id=k.door_id join addresses a on a.id=d.address_id
    where k.id = new.knock_id limit 1;
  insert into commission_events (org_id, user_id, event_type, amount, message, street)
  values (
    new.org_id, new.user_id, 'sale', new.amount,
    format('🔥 %s just closed $%s%s!',
      coalesce(rep_name, 'A rep'),
      to_char(new.amount, 'FM999,999'),
      case when street_name is not null then ' on ' || street_name else '' end),
    street_name
  );
  return new;
end $$;

drop trigger if exists trg_broadcast_sale on sales;
create trigger trg_broadcast_sale
after insert on sales
for each row execute function fn_broadcast_sale();

-- ─────────────────────────────────────────────
-- 6. WIN-BACK SEQUENCE TRIGGER
-- If a deal is cancelled within 90 days, auto-enroll in win-back sequence.
-- ─────────────────────────────────────────────
create or replace function fn_winback_enroll() returns trigger
language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status != 'cancelled'
     and old.created_at > now() - interval '90 days' then
    insert into sequence_enrollments (org_id, sequence_key, subject_type, subject_id, next_run_at)
    values (new.org_id, 'winback', 'deal', new.id, now() + interval '24 hours');
  end if;
  return new;
end $$;

drop trigger if exists trg_winback_enroll on deals;
create trigger trg_winback_enroll
after update on deals
for each row execute function fn_winback_enroll();

-- ─────────────────────────────────────────────
-- 7. INSTANT QUOTE CALCULATOR PRODUCTS TABLE
-- Rep configures products with base price + variables so they can
-- generate a quote at the door in seconds.
-- ─────────────────────────────────────────────
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  description text,
  base_price numeric not null,
  unit text default 'each',         -- each|sqft|linear_ft|month|year
  price_per_unit numeric,
  min_qty numeric default 1,
  commission_pct numeric default 8,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  quote_id uuid,
  product_id uuid references products(id),
  name text not null,
  qty numeric not null default 1,
  unit_price numeric not null,
  discount_pct numeric default 0,
  total numeric generated always as (qty * unit_price * (1 - discount_pct/100)) stored
);

-- ─────────────────────────────────────────────
-- 8. DIGITAL BUSINESS CARD
-- Each rep has a shareable card with QR + NFC deep link.
-- Scanning the card opens a landing page with rep's photo, reviews, and a booking link.
-- ─────────────────────────────────────────────
create table if not exists rep_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null unique references users(id),
  slug text not null unique,           -- canvass.app/card/alec-bauer
  headline text,
  photo_path text,
  tagline text,
  review_count int default 0,
  avg_rating numeric default 5.0,
  booking_url text,
  qr_svg text,
  nfc_url text,
  scans int default 0,
  created_at timestamptz not null default now()
);

create table if not exists card_scans (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references rep_cards(id),
  scanned_at timestamptz default now(),
  source text,                         -- qr|nfc|link
  lat double precision,
  lng double precision,
  converted boolean default false      -- did they book / sign up?
);

-- ─────────────────────────────────────────────
-- 9. ANSWER RATE PREDICTOR
-- Learned from your own knock data: what % of doors answer on this street
-- on this day/hour? Powers "best time to hit this street" suggestions.
-- ─────────────────────────────────────────────
create or replace view answer_rate_by_hour as
select
  k.org_id,
  a.street,
  extract(dow  from k.captured_at)::int as dow,    -- 0=Sun
  extract(hour from k.captured_at)::int as hour,
  count(*) as knocks,
  count(*) filter (where k.status != 'no_answer' and k.status != 'not_home') as answered,
  round(100.0 * count(*) filter (where k.status != 'no_answer' and k.status != 'not_home')
        / nullif(count(*), 0), 1) as answer_rate_pct
from knocks k
join doors d on d.id = k.door_id
join addresses a on a.id = d.address_id
group by 1, 2, 3, 4
having count(*) >= 5;   -- only show streets with enough data

-- ─────────────────────────────────────────────
-- 10. RLS for new tables
-- ─────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['signatures','dispatch_orders','commission_events',
                            'products','quote_line_items','rep_cards','card_scans']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_sel on %I', t, t);
    execute format('drop policy if exists %I_ins on %I', t, t);
    execute format('create policy %I_sel on %I for select using (org_id = current_org())', t, t);
    execute format('create policy %I_ins on %I for insert with check (org_id = current_org())', t, t);
  end loop;
end $$;
