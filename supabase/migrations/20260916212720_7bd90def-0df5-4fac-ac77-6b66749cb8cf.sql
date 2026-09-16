CREATE TYPE public.cost_center_type AS ENUM ('property', 'business', 'personal', 'other');

CREATE TABLE public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  center_type public.cost_center_type NOT NULL DEFAULT 'other',
  description text,
  color text NOT NULL DEFAULT 'orange',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_centers_select_own ON public.cost_centers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cost_centers_insert_own ON public.cost_centers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY cost_centers_update_own ON public.cost_centers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY cost_centers_delete_own ON public.cost_centers FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER cost_centers_set_updated_at BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX cost_centers_user_idx ON public.cost_centers (user_id);

ALTER TABLE public.transactions
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX transactions_cost_center_idx ON public.transactions (cost_center_id);

DROP POLICY transactions_insert_own ON public.transactions;
DROP POLICY transactions_update_own ON public.transactions;

CREATE POLICY transactions_insert_own ON public.transactions FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  AND (destination_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts d WHERE d.id = destination_account_id AND d.user_id = auth.uid()))
  AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.user_id = auth.uid()))
  AND (cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid()))
);

CREATE POLICY transactions_update_own ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  AND (destination_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts d WHERE d.id = destination_account_id AND d.user_id = auth.uid()))
  AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.user_id = auth.uid()))
  AND (cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid()))
);