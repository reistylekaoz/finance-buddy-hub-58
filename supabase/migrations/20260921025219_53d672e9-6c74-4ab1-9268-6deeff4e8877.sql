ALTER TABLE public.budgets
  ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  ADD COLUMN card_id uuid REFERENCES public.credit_cards(id) ON DELETE CASCADE;

ALTER TABLE public.budgets DROP CONSTRAINT budgets_scope_check;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_scope_check CHECK (
  (
    (category_id IS NOT NULL)::int +
    (cost_center_id IS NOT NULL)::int +
    (account_id IS NOT NULL)::int +
    (card_id IS NOT NULL)::int
  ) = 1
);

DROP POLICY "budgets_insert_own" ON public.budgets;
CREATE POLICY "budgets_insert_own" ON public.budgets FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.user_id = auth.uid()))
  AND (cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid()))
  AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
  AND (card_id IS NULL OR EXISTS (SELECT 1 FROM public.credit_cards cd WHERE cd.id = card_id AND cd.user_id = auth.uid()))
);

DROP POLICY "budgets_update_own" ON public.budgets;
CREATE POLICY "budgets_update_own" ON public.budgets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.user_id = auth.uid()))
  AND (cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid()))
  AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
  AND (card_id IS NULL OR EXISTS (SELECT 1 FROM public.credit_cards cd WHERE cd.id = card_id AND cd.user_id = auth.uid()))
);

CREATE INDEX budgets_account_id_idx ON public.budgets(account_id);
CREATE INDEX budgets_card_id_idx ON public.budgets(card_id);