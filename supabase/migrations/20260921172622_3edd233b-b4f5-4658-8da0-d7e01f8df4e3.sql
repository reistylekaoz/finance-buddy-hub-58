ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_widgets jsonb;