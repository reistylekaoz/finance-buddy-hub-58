CREATE TABLE public.exchange_rates (
  currency text PRIMARY KEY,
  rate_to_brl numeric NOT NULL,
  rate_date text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exchange_rates_select_authenticated" ON public.exchange_rates FOR SELECT TO authenticated USING (true);