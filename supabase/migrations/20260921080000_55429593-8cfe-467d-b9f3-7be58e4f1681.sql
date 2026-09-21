-- Controle orçamentário: metas de orçamento por categoria OU centro de
-- custo, com período fixo (data final) ou recorrente (semanal, quinzenal,
-- mensal, bimestral, trimestral, semestral, anual), e configuração de
-- disparos por Telegram (report diário, alerta de % atingido, alerta de
-- estourado) para uma lista de destinatários.
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  period_type text NOT NULL CHECK (
    period_type IN ('fixed','weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual')
  ),
  start_date date NOT NULL,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  alert_daily_report boolean NOT NULL DEFAULT false,
  alert_threshold_enabled boolean NOT NULL DEFAULT false,
  alert_threshold_percent numeric(5,2) CHECK (
    alert_threshold_percent IS NULL OR (alert_threshold_percent > 0 AND alert_threshold_percent <= 100)
  ),
  alert_exceeded_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Exatamente um dos dois: escopo por categoria OU por centro de custo, nunca ambos nem nenhum.
  CONSTRAINT budgets_scope_check CHECK ((category_id IS NOT NULL) <> (cost_center_id IS NOT NULL)),
  -- Período fixo precisa de data final; períodos recorrentes calculam a janela a partir de start_date.
  CONSTRAINT budgets_end_date_check CHECK (period_type <> 'fixed' OR end_date IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets_select_own" ON public.budgets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "budgets_insert_own" ON public.budgets FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.user_id = auth.uid()))
  AND (cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid()))
);
CREATE POLICY "budgets_update_own" ON public.budgets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.user_id = auth.uid()))
  AND (cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid()))
);
CREATE POLICY "budgets_delete_own" ON public.budgets FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX budgets_user_id_idx ON public.budgets(user_id);
CREATE INDEX budgets_category_id_idx ON public.budgets(category_id);
CREATE INDEX budgets_cost_center_id_idx ON public.budgets(cost_center_id);
CREATE TRIGGER budgets_set_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Quem recebe os alertas de Telegram de cada orçamento (N:N com telegram_recipients).
CREATE TABLE public.budget_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.telegram_recipients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_id, recipient_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_recipients TO authenticated;
GRANT ALL ON public.budget_recipients TO service_role;
ALTER TABLE public.budget_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_recipients_select_own" ON public.budget_recipients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "budget_recipients_insert_own" ON public.budget_recipients FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND b.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.telegram_recipients r WHERE r.id = recipient_id AND r.user_id = auth.uid())
);
CREATE POLICY "budget_recipients_update_own" ON public.budget_recipients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "budget_recipients_delete_own" ON public.budget_recipients FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX budget_recipients_budget_id_idx ON public.budget_recipients(budget_id);
CREATE INDEX budget_recipients_recipient_id_idx ON public.budget_recipients(recipient_id);
CREATE INDEX budget_recipients_user_id_idx ON public.budget_recipients(user_id);

-- Log de alertas de limiar/estouro já enviados, para não repetir o mesmo
-- alerta várias vezes dentro do mesmo período (report diário não precisa de
-- dedup, ele é reenviado todo dia por natureza).
CREATE TABLE public.budget_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('threshold', 'exceeded')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_id, alert_type, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_alerts_sent TO authenticated;
GRANT ALL ON public.budget_alerts_sent TO service_role;
ALTER TABLE public.budget_alerts_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_alerts_sent_select_own" ON public.budget_alerts_sent FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "budget_alerts_sent_insert_own" ON public.budget_alerts_sent FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND b.user_id = auth.uid())
);
CREATE POLICY "budget_alerts_sent_delete_own" ON public.budget_alerts_sent FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX budget_alerts_sent_budget_id_idx ON public.budget_alerts_sent(budget_id);
CREATE INDEX budget_alerts_sent_user_id_idx ON public.budget_alerts_sent(user_id);
