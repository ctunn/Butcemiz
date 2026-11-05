-- Bütçemiz / Our Budget — Supabase schema.
-- Run once in Supabase Dashboard → SQL Editor → New query → paste → Run.


create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Ev',
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id) -- one household per login
);

create table if not exists categories (
  household_id uuid not null references households(id) on delete cascade,
  id text not null,
  name_en text not null, name_tr text not null, icon text not null, color text not null,
  kind text not null check (kind in ('expense','income')),
  archived boolean not null default false,
  primary key (household_id, id)
);

create table if not exists people (
  household_id uuid not null references households(id) on delete cascade,
  id text not null, name text not null, color text not null,
  primary key (household_id, id)
);

create table if not exists cards (
  household_id uuid not null references households(id) on delete cascade,
  id text not null, name text not null, bank text not null default 'other',
  person_id text, last4 text, kind text default 'card',
  primary key (household_id, id)
);

create table if not exists txns (
  household_id uuid not null references households(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('expense','income')),
  amount numeric(14,2) not null check (amount > 0),
  date date not null,
  category_id text not null,
  person_id text, card_id text,
  note text not null default '',
  source text not null default 'manual',
  import_id text,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);
create index if not exists txns_household_date on txns (household_id, date desc);

-- v1.1: card bills count in the month they are paid (safe to re-run).
alter table txns add column if not exists pay_month text;
alter table cards add column if not exists cut_day int;
alter table cards add column if not exists due_day int;
-- v1.2: installment plans (future installments are planned and replaced by the real statement row).
alter table txns add column if not exists plan_key text;
alter table txns add column if not exists inst_no int;
alter table txns add column if not exists projected boolean not null default false;
alter table txns drop constraint if exists txns_source_check;
-- v1.3: household (ev) shared expenses.
alter table txns add column if not exists shared boolean not null default false;

create table if not exists rules (
  household_id uuid not null references households(id) on delete cascade,
  id text not null, key text not null, category_id text not null,
  primary key (household_id, id)
);

-- Row level security: you can only see rows of the household you belong to.
create or replace function my_household_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select household_id from members where user_id = auth.uid()
$$;

alter table households enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table people enable row level security;
alter table cards enable row level security;
alter table txns enable row level security;
alter table rules enable row level security;

drop policy if exists hh_select on households;
create policy hh_select on households for select using (id in (select my_household_ids()));
drop policy if exists mem_select on members;
create policy mem_select on members for select using (household_id in (select my_household_ids()));

do $$
declare t text;
begin
  foreach t in array array['categories','people','cards','txns','rules'] loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('create policy %I_all on %I for all using (household_id in (select my_household_ids())) with check (household_id in (select my_household_ids()))', t, t);
    execute format('alter table %I replica identity full', t);
  end loop;
end $$;

-- Create a household and join it. Returns the household id.
create or replace function create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid; code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'already in a household'; end if;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into households(name, invite_code) values (coalesce(nullif(p_name, ''), 'Ev'), code) returning id into hid;
  insert into members(household_id, user_id) values (hid, auth.uid());
  return hid;
end $$;

-- Join a household with its invite code. Returns the household id.
create or replace function join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into hid from households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'invite code not found'; end if;
  insert into members(household_id, user_id) values (hid, auth.uid()) on conflict do nothing;
  return hid;
end $$;

-- Table access for signed-in users (rows are still filtered by the policies above).
grant usage on schema public to authenticated;
grant select on households, members to authenticated;
grant select, insert, update, delete on categories, people, cards, txns, rules to authenticated;

grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text) to authenticated;

-- Live sync between phones.
do $$
declare t text;
begin
  foreach t in array array['categories','people','cards','txns','rules'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
