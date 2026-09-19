-- Investimentos trazidos automaticamente da Pluggy (GET /investments por
-- item conectado). Cada investimento pertence a uma conexão bancária
-- existente — não é uma conta nova, é um recurso separado na Pluggy.
CREATE TABLE public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bank_connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
  pluggy_investment_id text,
  name text NOT NULL,
  investment_type text NOT NULL,
  investment_subtype text,
  currency text NOT NULL DEFAULT 'BRL',
  balance numeric(14,2) NOT NULL DEFAULT 0,
  amount_original numeric(14,2),
  amount_profit numeric(14,2),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investments TO authenticated;
GRANT ALL ON public.investments TO service_role;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investments_select_own" ON public.investments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "investments_insert_own" ON public.investments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "investments_update_own" ON public.investments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "investments_delete_own" ON public.investments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX investments_user_id_idx ON public.investments(user_id);
-- Global (não por usuário) igual accounts/credit_cards: o app já filtra por
-- user_id ao religar, isso só evita colisão de pluggy_investment_id.
CREATE UNIQUE INDEX investments_pluggy_investment_id_idx ON public.investments(pluggy_investment_id) WHERE pluggy_investment_id IS NOT NULL;
CREATE TRIGGER investments_set_updated_at BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Movimentações de cada investimento (aplicação, resgate, rendimento etc.),
-- trazidas de GET /investments/{id}/transactions. matched_transaction_id
-- guarda o lançamento de receita que o sistema identificou como sendo o
-- resgate caindo na conta bancária (mesmo valor, data próxima).
CREATE TABLE public.investment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  investment_id uuid NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('BUY','SELL','TAX','TRANSFER','INTEREST','AMORTIZATION')),
  description text,
  amount numeric(14,2) NOT NULL,
  quantity numeric(18,8),
  trade_date date NOT NULL,
  external_id text,
  matched_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_transactions TO authenticated;
GRANT ALL ON public.investment_transactions TO service_role;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investment_transactions_select_own" ON public.investment_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "investment_transactions_insert_own" ON public.investment_transactions FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.investments i WHERE i.id = public.investment_transactions.investment_id AND i.user_id = auth.uid())
);
CREATE POLICY "investment_transactions_update_own" ON public.investment_transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "investment_transactions_delete_own" ON public.investment_transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX investment_transactions_investment_id_idx ON public.investment_transactions(investment_id);
CREATE INDEX investment_transactions_user_id_idx ON public.investment_transactions(user_id);
CREATE UNIQUE INDEX investment_transactions_external_id_idx ON public.investment_transactions(investment_id, external_id) WHERE external_id IS NOT NULL;
