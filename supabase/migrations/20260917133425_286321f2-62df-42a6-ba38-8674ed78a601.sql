ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_external_id_key
  ON public.transactions (user_id, external_id)
  WHERE external_id IS NOT NULL;