-- Drop into any Postgres/Supabase project
create extension if not exists pgcrypto;

create table if not exists referral_codes (
  user_id uuid primary key,
  code text unique not null,
  created_at timestamptz default now()
);

create table if not exists referrals (
  id bigserial primary key,
  code text references referral_codes(code) on delete cascade,
  inviter_id uuid not null,
  invitee_id uuid not null unique,
  reward_status text not null default 'pending' check (reward_status in ('pending','granted','revoked')),
  created_at timestamptz default now(),
  converted_at timestamptz
);

create or replace function issue_referral_code(uid uuid)
returns text language plpgsql as $$
declare c text;
begin
  c := lower(substr(encode(gen_random_bytes(6),'base64'), 1, 8));
  c := regexp_replace(c, '[^a-z0-9]', '', 'g');
  insert into referral_codes(user_id, code) values (uid, c)
    on conflict (user_id) do update set code=excluded.code returning code into c;
  return c;
end$$;

create or replace view referral_leaderboard as
select inviter_id, count(*) filter (where reward_status='granted') as conversions,
       count(*) as total_invites
from referrals
group by inviter_id
order by conversions desc;
