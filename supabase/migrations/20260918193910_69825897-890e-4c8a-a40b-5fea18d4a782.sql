ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.credit_card_transactions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;