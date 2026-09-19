ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pluggy_client_id text,
  ADD COLUMN IF NOT EXISTS pluggy_client_secret text;