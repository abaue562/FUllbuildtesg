-- COMMISSION ENGINE
-- Handles multi-tier commission structures, overrides, clawbacks,
-- splits (rep + closer + manager), per-product rates, and payout batches.

-- Commission plan (org-level, versioned)
create table if not exists commission_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  version int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Rules within a plan (multiple rules = tiered structure)
create table if not exists commission_rules (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references commission_plans(id) on delete cascade,
  org_id uuid not null,
  role text not null,                         -- rep|closer|manager|team_lead
  product_key text,                           -- null = applies to all products
  rate_pct numeric not null,                  -- e.g. 8.5 = 8.5%
  flat_bonus numeric default 0,              -- extra flat $ per sale
  min_sale_amount numeric default 0,         -- minimum deal size to qualify
  clawback_days int default 90,              -- # days before commission is guaranteed
  split_pct numeric default 100,            -- what % of the commission this role gets
  priority int default 0                    -- higher = evaluated first
);

-- Per-sale commission ledger (append-only)
create table if not exists commission_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  sale_id uuid references sales(id),
  knock_id uuid references knocks(id),
  door_id uuid references doors(id),
  user_id uuid not null references users(id),
  role text not null,
  plan_id uuid references commission_plans(id),
  rule_id uuid references commission_rules(id),
  sale_amount numeric not null,
  rate_pct numeric,
  flat_bonus numeric default 0,
  gross_commission numeric not null,
  clawback_date timestamptz,               -- when it becomes safe to pay out
  status text not null default 'pending',  -- pending|approved|paid|clawedback|held
  payout_batch_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists comm_ledger_user_idx on commission_ledger (user_id, created_at desc);
create index if not exists comm_ledger_status_idx on commission_ledger (status, clawback_date);

revoke update on commission_ledger from public;
revoke delete on commission_ledger from public;

-- Payout batches
create table if not exists payout_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  period_start date not null,
  period_end date not null,
  total_amount numeric not null default 0,
  status text not null default 'draft',   -- draft|approved|processing|paid
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Rep earnings summary view
create or replace view rep_earnings as
select
  cl.org_id,
  cl.user_id,
  date_trunc('month', cl.created_at)::date as month,
  count(*) as sales,
  sum(cl.sale_amount) as revenue,
  sum(cl.gross_commission) as gross,
  sum(cl.gross_commission) filter (where cl.status = 'paid') as paid,
  sum(cl.gross_commission) filter (where cl.status = 'pending') as pending,
  sum(cl.gross_commission) filter (where cl.status = 'clawedback') as clawedback
from commission_ledger cl
group by 1, 2, 3;

-- Auto-calculate commission when a sale is inserted
create or replace function fn_calculate_commission() returns trigger
language plpgsql as $$
declare
  r record;
  gross numeric;
begin
  -- Find the active plan rules for this org, most specific first
  for r in
    select cr.*, cp.id as plan_id
    from commission_rules cr
    join commission_plans cp on cp.id = cr.plan_id
    where cr.org_id = new.org_id
      and cp.active = true
      and (cr.product_key is null or cr.product_key = new.product_key)
      and new.amount >= cr.min_sale_amount
    order by cr.priority desc, cr.role
  loop
    gross := round(new.amount * (r.rate_pct / 100) + r.flat_bonus, 2);
    gross := round(gross * (r.split_pct / 100), 2);
    insert into commission_ledger (
      org_id, sale_id, knock_id, door_id, user_id, role,
      plan_id, rule_id, sale_amount, rate_pct, flat_bonus,
      gross_commission, clawback_date
    ) values (
      new.org_id, new.id, new.knock_id, new.door_id, new.user_id, r.role,
      r.plan_id, r.id, new.amount, r.rate_pct, r.flat_bonus,
      gross, now() + (r.clawback_days || ' days')::interval
    );
  end loop;
  return new;
end $$;

drop trigger if exists trg_calculate_commission on sales;
create trigger trg_calculate_commission
after insert on sales
for each row execute function fn_calculate_commission();

-- Clawback trigger — if deal cancels before clawback_date, reverse commissions
create or replace function fn_clawback_commission() returns trigger
language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status != 'cancelled' then
    update commission_ledger
    set status = 'clawedback', note = 'deal cancelled'
    where sale_id = new.id
      and status in ('pending','approved')
      and clawback_date > now();
  end if;
  return new;
end $$;

drop trigger if exists trg_clawback_commission on deals;
create trigger trg_clawback_commission
after update on deals
for each row execute function fn_clawback_commission();

-- RLS
do $$ begin
  perform 1 from pg_policies where tablename='commission_ledger' and policyname='cl_org_sel';
  if not found then
    alter table commission_plans enable row level security;
    alter table commission_rules enable row level security;
    alter table commission_ledger enable row level security;
    alter table payout_batches enable row level security;
    execute 'create policy cl_org_sel on commission_ledger for select using (org_id = current_org())';
    execute 'create policy cl_org_ins on commission_ledger for insert with check (org_id = current_org())';
    execute 'create policy cp_org_sel on commission_plans for select using (org_id = current_org())';
    execute 'create policy cr_org_sel on commission_rules for select using (org_id = current_org())';
    execute 'create policy pb_org_sel on payout_batches for select using (org_id = current_org())';
  end if;
end $$;
