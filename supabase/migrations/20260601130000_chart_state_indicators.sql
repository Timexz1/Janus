-- Add chart indicator preferences for projects that already applied the
-- chart_states migration before indicator toggles existed.
alter table if exists public.chart_states
  add column if not exists indicators jsonb not null
    default '{"volume":true,"ma20":true,"ma50":false,"ma200":false}'::jsonb;

alter table if exists public.chart_states
  add column if not exists visible_range jsonb;
