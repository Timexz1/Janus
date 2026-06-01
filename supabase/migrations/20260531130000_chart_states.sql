-- Persist per-user chart layout state so drawings and selected chart controls
-- are restored when the user returns to a ticker.
create table public.chart_states (
  user_id    uuid not null references auth.users (id) on delete cascade,
  ticker     text not null,
  period     text not null default '1Y'
    check (period in ('1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL')),
  timeframe  text not null default 'D'
    check (timeframe in ('D', 'W', 'M')),
  drawings   jsonb not null default '[]'::jsonb,
  indicators jsonb not null default '{"volume":true,"ma20":true,"ma50":false,"ma200":false}'::jsonb,
  visible_range jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create index chart_states_user_idx on public.chart_states (user_id);

alter table public.chart_states enable row level security;

create policy chart_states_owner on public.chart_states for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
