ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_filters jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS transactions_filters jsonb;