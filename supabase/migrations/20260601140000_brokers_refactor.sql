-- 1. Shared brokers lookup (no user_id)
CREATE TABLE public.brokers (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD'
);

INSERT INTO public.brokers (id, display_name, currency) VALUES
  ('webull', 'Webull Thailand', 'USD'),
  ('dime',   'Dime! USD',       'USD');

-- 2. Add broker_id to transactions (nullable first for migration)
ALTER TABLE public.transactions ADD COLUMN broker_id TEXT REFERENCES public.brokers(id);

-- 3. Populate broker_id from existing accounts
UPDATE public.transactions t
SET broker_id = lower(a.broker)
FROM public.accounts a
WHERE t.account_id = a.id;

-- 4. Make broker_id NOT NULL now that it's populated
ALTER TABLE public.transactions ALTER COLUMN broker_id SET NOT NULL;

-- 5. Drop old column and table
ALTER TABLE public.transactions DROP COLUMN account_id;
DROP TABLE public.accounts;
