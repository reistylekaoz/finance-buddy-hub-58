ALTER TABLE public.investments ALTER COLUMN pluggy_investment_id SET NOT NULL;
DROP INDEX IF EXISTS public.investments_pluggy_investment_id_idx;
ALTER TABLE public.investments ADD CONSTRAINT investments_pluggy_investment_id_key UNIQUE (pluggy_investment_id);
ALTER TABLE public.investment_transactions ALTER COLUMN external_id SET NOT NULL;
DROP INDEX IF EXISTS public.investment_transactions_external_id_idx;
ALTER TABLE public.investment_transactions ADD CONSTRAINT investment_transactions_investment_id_external_id_key UNIQUE (investment_id, external_id);