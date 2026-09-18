-- Índices parciais (WHERE external_id IS NOT NULL) não são reconhecidos pelo
-- Postgres como alvo de "ON CONFLICT (col1, col2)" sem repetir o WHERE ali,
-- o que o cliente supabase-js não permite configurar. Como NULL nunca colide
-- com NULL numa unique constraint comum, remover o WHERE não muda o
-- comportamento e permite o upsert usado na sincronização da Pluggy.
DROP INDEX IF EXISTS public.transactions_user_external_id_key;
CREATE UNIQUE INDEX transactions_user_external_id_key
  ON public.transactions (user_id, external_id);

DROP INDEX IF EXISTS public.credit_card_transactions_external_id_idx;
CREATE UNIQUE INDEX credit_card_transactions_external_id_idx
  ON public.credit_card_transactions (card_id, external_id);