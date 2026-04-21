-- CanvassCRM — billing + automation schema
-- Customers, deals (Stripe payment links), subscriptions, sequences, messages.

create table customers (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  door_id uuid references doors(id),
  first_name text, last_name text,
  email text, phone text,
  email_consent boolean default true,
  sms_consent boolean default true,
  source text default 'door_knock',
  stripe_customer_id text,
  created_at timestamptz default now()
);
create index on customers(org_id);
create index on customers(email);
create index on customers(phone);

create table deals (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid not null references customers(id),
  rep_id uuid not null references users(id),
  door_id uuid references doors(id),
  amount_cents bigint not null,
  product text not null,
  status text not null default 'quoted'
    check (status in ('quoted','sent','paid','cancelled','refunded','installed')),
  stripe_payment_link text,
  stripe_session_id text,
  stripe_payment_intent text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
create index on deals(org_id, status);
create index on deals(customer_id);

-- Org-level SaaS subscription (the org pays YOU)
create table subscriptions_org (
  org_id uuid primary key references orgs(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  plan text not null,                       -- starter|pro|enterprise
  seats int not null default 1,
  status text not null,                     -- active|past_due|canceled|trialing
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

-- Sequence engine
create table sequences (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  trigger_type text not null,              -- door_outcome|deal_status|days_since|manual
  trigger_value text,                      -- e.g. 'callback', 'paid'
  active boolean default true,
  created_at timestamptz default now()
);

create table sequence_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  step_index int not null,
  delay_minutes int not null default 0,
  channel text not null check (channel in ('email','sms','push','task','webhook','ai_upsell')),
  template_key text not null,
  condition jsonb,                         -- skip/branch logic
  unique(sequence_id, step_index)
);

create table sequence_enrollments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  sequence_id uuid not null references sequences(id),
  customer_id uuid references customers(id),
  deal_id uuid references deals(id),
  current_step int not null default 0,
  next_run_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active','paused','completed','cancelled')),
  created_at timestamptz default now()
);
create index on sequence_enrollments(next_run_at) where status='active';

-- Outbound message log (every email/sms sent, with engagement)
create table messages (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid references customers(id),
  enrollment_id uuid references sequence_enrollments(id),
  channel text not null check (channel in ('email','sms','push')),
  template_key text not null,
  to_addr text not null,
  subject text,
  body text,
  provider text,                            -- plunk|resend|textbee|twilio
  provider_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','failed','bounced','opened','clicked','replied','unsubscribed')),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  error text,
  created_at timestamptz default now()
);
create index on messages(org_id, created_at desc);
create index on messages(customer_id);

-- Upsell suggestions from Claude (per sale)
create table upsell_suggestions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id),
  deal_id uuid references deals(id),
  product text not null,
  reason text,
  confidence numeric,                       -- 0..1
  status text default 'suggested'
    check (status in ('suggested','triggered','accepted','rejected')),
  created_at timestamptz default now()
);

-- ── Auto-enroll triggers ────────────────────────────────────
create or replace function fn_enroll_on_status_change() returns trigger language plpgsql as $$
declare seq record;
begin
  for seq in select * from sequences where org_id = new.org_id and active and trigger_type = 'door_outcome' and trigger_value = new.status::text loop
    insert into sequence_enrollments(org_id, sequence_id, customer_id)
    values (new.org_id, seq.id, null)
    on conflict do nothing;
  end loop;
  return new;
end$$;

create trigger trg_door_status after update of status on doors
for each row when (old.status is distinct from new.status)
execute function fn_enroll_on_status_change();

create or replace function fn_enroll_on_deal_paid() returns trigger language plpgsql as $$
declare seq record;
begin
  if new.status = 'paid' and old.status <> 'paid' then
    for seq in select * from sequences where org_id = new.org_id and active and trigger_type='deal_status' and trigger_value='paid' loop
      insert into sequence_enrollments(org_id, sequence_id, customer_id, deal_id)
      values (new.org_id, seq.id, new.customer_id, new.id);
    end loop;
  end if;
  return new;
end$$;

create trigger trg_deal_paid after update of status on deals
for each row execute function fn_enroll_on_deal_paid();

-- RLS
alter table customers enable row level security;
alter table deals enable row level security;
alter table subscriptions_org enable row level security;
alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table sequence_enrollments enable row level security;
alter table messages enable row level security;
alter table upsell_suggestions enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['customers','deals','sequences','sequence_enrollments','messages','upsell_suggestions']) loop
    execute format($f$
      create policy org_select on %I for select using (org_id = current_org());
      create policy org_insert on %I for insert with check (org_id = current_org());
      create policy org_update on %I for update using (org_id = current_org());
    $f$, t, t, t);
  end loop;
end$$;
