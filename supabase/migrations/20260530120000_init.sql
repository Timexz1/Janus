-- Janus schema + RLS. Tables mirror the app's stored shapes (raw trade fields;
-- normalization/FIFO happen in TypeScript). Primary keys are TEXT and supplied
-- by the client (e.g. "acc_..", "tx_..") so the local cache and the cloud copy
-- share the same ids with no translation. API keys are NOT stored here — they
-- stay client-side only. RLS is owner-only on every table (TO authenticated,
-- USING + WITH CHECK) per Supabase best practice.

-- accounts: id is unique PER USER (composite PK) so the app can use stable ids
-- like 'acc_webull' / 'acc_dime' across users without global collisions.
create table public.accounts (
  id            text not null default (gen_random_uuid())::text,
  user_id       uuid not null references auth.users (id) on delete cascade,
  broker        text not null,
  account_label text not null,
  currency      text not null default 'USD',
  created_at    timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.transactions (
  id             text primary key default (gen_random_uuid())::text,
  user_id        uuid not null references auth.users (id) on delete cascade,
  account_id     text not null,
  constraint transactions_account_fk
    foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade,
  ticker         text not null,
  exchange       text,
  side           text not null check (side in ('buy', 'sell')),
  qty            numeric(30, 10) not null,
  price          numeric(30, 10) not null,
  stock_value    numeric(30, 10),
  fees           numeric(30, 10) not null default 0,
  coupons_waived numeric(30, 10),
  executed_at    timestamptz not null,
  executed_tz    text,
  created_at     timestamptz not null default now()
);
create index transactions_user_idx on public.transactions (user_id, account_id, ticker);

create table public.remittances (
  id         text primary key default (gen_random_uuid())::text,
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  direction  text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  amount_usd numeric(30, 10) not null,
  fx_rate    numeric(30, 10) not null,
  note       text,
  created_at timestamptz not null default now()
);
create index remittances_user_idx on public.remittances (user_id);

create table public.income_inputs (
  user_id          uuid not null references auth.users (id) on delete cascade,
  tax_year         int not null,
  other_income_thb numeric(30, 2) not null default 0,
  primary key (user_id, tax_year)
);

create table public.tax_settings (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  apportionment_method text not null default 'gain_first'
    check (apportionment_method in ('gain_first', 'pro_rata', 'principal_first')),
  personal_allowance   numeric(30, 2) not null default 60000,
  tax_year             int not null default extract(year from now())::int,
  show_metrics         boolean not null default true,
  ocr_enabled          boolean not null default true,
  ocr_provider         text not null default 'claude',
  claude_model         text not null default 'claude-opus-4-8'
);

-- Row Level Security -------------------------------------------------------
alter table public.accounts      enable row level security;
alter table public.transactions  enable row level security;
alter table public.remittances   enable row level security;
alter table public.income_inputs enable row level security;
alter table public.tax_settings  enable row level security;

create policy accounts_owner on public.accounts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy transactions_owner on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy remittances_owner on public.remittances for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy income_owner on public.income_inputs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tax_settings_owner on public.tax_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Seed default broker accounts + tax settings for every new user -----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (id, user_id, broker, account_label, currency)
  values ('acc_webull', new.id, 'Webull', 'Webull Thailand', 'USD'),
         ('acc_dime', new.id, 'Dime', 'Dime! USD', 'USD');
  insert into public.tax_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
