-- Cash balance snapshot per user per broker.
-- One row per (user, broker) — upserted by the client whenever the user
-- updates their cash balance. No history; just the current amount.
CREATE TABLE public.cash_balances (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_id  TEXT        NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  amount_usd NUMERIC(30, 10) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, broker_id)
);

ALTER TABLE public.cash_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner-select" ON public.cash_balances
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "owner-insert" ON public.cash_balances
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "owner-update" ON public.cash_balances
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "owner-delete" ON public.cash_balances
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
