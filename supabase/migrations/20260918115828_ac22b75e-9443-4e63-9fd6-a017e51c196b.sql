-- Cartões de crédito: lançamentos próprios, com limite e categorização,
-- preparados para futura captura automática via integração bancária
-- (colunas source/external_id já ficam prontas para isso).
CREATE TABLE public.credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  institution text,
  color text NOT NULL DEFAULT 'purple',
  credit_limit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  closing_day smallint NOT NULL DEFAULT 1 CHECK (closing_day BETWEEN 1 AND 28),
  due_day smallint NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_cards TO authenticated;
GRANT ALL ON public.credit_cards TO service_role;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_cards_select_own" ON public.credit_cards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "credit_cards_insert_own" ON public.credit_cards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "credit_cards_update_own" ON public.credit_cards FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "credit_cards_delete_own" ON public.credit_cards FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX credit_cards_user_id_idx ON public.credit_cards(user_id);
CREATE TRIGGER credit_cards_set_updated_at BEFORE UPDATE ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.credit_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  purchase_date date NOT NULL DEFAULT current_date,
  installment_number smallint NOT NULL DEFAULT 1 CHECK (installment_number >= 1),
  installment_total smallint NOT NULL DEFAULT 1 CHECK (installment_total >= 1),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'api')),
  external_id text,
  notes text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_transactions TO authenticated;
GRANT ALL ON public.credit_card_transactions TO service_role;
ALTER TABLE public.credit_card_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_card_transactions_select_own" ON public.credit_card_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "credit_card_transactions_insert_own" ON public.credit_card_transactions FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.credit_cards c WHERE c.id = public.credit_card_transactions.card_id AND c.user_id = auth.uid())
  AND (public.credit_card_transactions.category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories cat WHERE cat.id = public.credit_card_transactions.category_id AND cat.user_id = auth.uid()))
  AND (public.credit_card_transactions.cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = public.credit_card_transactions.cost_center_id AND cc.user_id = auth.uid()))
);
CREATE POLICY "credit_card_transactions_update_own" ON public.credit_card_transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.credit_cards c WHERE c.id = public.credit_card_transactions.card_id AND c.user_id = auth.uid())
  AND (public.credit_card_transactions.category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories cat WHERE cat.id = public.credit_card_transactions.category_id AND cat.user_id = auth.uid()))
  AND (public.credit_card_transactions.cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = public.credit_card_transactions.cost_center_id AND cc.user_id = auth.uid()))
);
CREATE POLICY "credit_card_transactions_delete_own" ON public.credit_card_transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX credit_card_transactions_user_id_idx ON public.credit_card_transactions(user_id);
CREATE INDEX credit_card_transactions_card_id_idx ON public.credit_card_transactions(card_id);
CREATE INDEX credit_card_transactions_category_idx ON public.credit_card_transactions(category_id);
CREATE UNIQUE INDEX credit_card_transactions_external_id_idx ON public.credit_card_transactions(card_id, external_id) WHERE external_id IS NOT NULL;
CREATE TRIGGER credit_card_transactions_set_updated_at BEFORE UPDATE ON public.credit_card_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();