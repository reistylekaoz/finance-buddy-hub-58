-- Perfis de acesso: permite que outras pessoas (convidadas por link) vejam e
-- editem os dados de uma conta, sem precisar de uma conta separada. Cada
-- linha de account_members representa "member_user_id tem acesso à conta de
-- owner_user_id" (owner_user_id é o mesmo valor usado como user_id em toda
-- tabela do sistema — nada nas outras tabelas muda de nome ou de dono, só a
-- regra de quem pode enxergar/mexer nesse user_id passa a aceitar membros
-- aceitos, além do próprio dono).
CREATE TABLE public.account_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  invite_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  -- Editar lançamentos/contas/cartões/orçamentos etc. Sem isso, só visualiza.
  can_edit boolean NOT NULL DEFAULT true,
  -- Conectar/desconectar bancos (Pluggy) — separado de can_edit por ser mais sensível.
  can_manage_connections boolean NOT NULL DEFAULT false,
  -- Convidar/remover outros membros dessa mesma conta.
  can_manage_members boolean NOT NULL DEFAULT false,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_members_status_check CHECK (status IN ('pending', 'accepted', 'revoked')),
  CONSTRAINT account_members_invite_token_key UNIQUE (invite_token),
  CONSTRAINT account_members_owner_member_key UNIQUE (owner_user_id, member_user_id)
);

CREATE INDEX account_members_owner_idx ON public.account_members (owner_user_id);
CREATE INDEX account_members_member_idx ON public.account_members (member_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_members TO authenticated;
GRANT ALL ON public.account_members TO service_role;

ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

-- Funções auxiliares (SECURITY DEFINER: leem account_members ignorando a RLS
-- dela mesma, sem recursão — é o mesmo padrão já usado por
-- has_pluggy_credentials()). Usadas nas policies de TODAS as tabelas de dados
-- do sistema, no lugar do antigo "auth.uid() = user_id" direto.
CREATE OR REPLACE FUNCTION public.has_account_access(target_user_id uuid, require_edit boolean DEFAULT true)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = target_user_id
    OR EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.owner_user_id = target_user_id
        AND am.member_user_id = auth.uid()
        AND am.status = 'accepted'
        AND (NOT require_edit OR am.can_edit)
    );
$$;
REVOKE ALL ON FUNCTION public.has_account_access(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.has_account_access(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_connections_access(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = target_user_id
    OR EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.owner_user_id = target_user_id
        AND am.member_user_id = auth.uid()
        AND am.status = 'accepted'
        AND am.can_manage_connections
    );
$$;
REVOKE ALL ON FUNCTION public.has_connections_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.has_connections_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_members_access(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = target_user_id
    OR EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.owner_user_id = target_user_id
        AND am.member_user_id = auth.uid()
        AND am.status = 'accepted'
        AND am.can_manage_members
    );
$$;
REVOKE ALL ON FUNCTION public.has_members_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.has_members_access(uuid) TO authenticated, service_role;

-- Aceitar convite: função própria (em vez de uma policy de UPDATE genérica)
-- porque, antes de aceitar, o convidado não tem nenhuma linha que o
-- identifique (member_user_id ainda é null) — só o token do link. Não exige
-- que o e-mail da conta logada bata com o e-mail convidado, mesmo padrão do
-- link de convite do Telegram já usado no app (quem tem o link, usa).
CREATE OR REPLACE FUNCTION public.accept_account_invite(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT am.owner_user_id INTO v_owner
  FROM public.account_members am
  WHERE am.invite_token = p_token AND am.status = 'pending'
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Convite inválido ou já utilizado.';
  END IF;

  UPDATE public.account_members
  SET member_user_id = auth.uid(), status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE invite_token = p_token AND status = 'pending';

  RETURN v_owner;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_account_invite(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_account_invite(uuid) TO authenticated;

-- Policies de account_members: dono e membros com can_manage_members
-- administram (convidar, mudar permissões, revogar); qualquer membro sempre
-- enxerga e pode apagar (sair de) as próprias linhas.
CREATE POLICY account_members_select ON public.account_members FOR SELECT TO authenticated
  USING (auth.uid() = member_user_id OR public.has_members_access(owner_user_id));
CREATE POLICY account_members_insert ON public.account_members FOR INSERT TO authenticated
  WITH CHECK (public.has_members_access(owner_user_id) AND member_user_id IS NULL AND status = 'pending');
CREATE POLICY account_members_update ON public.account_members FOR UPDATE TO authenticated
  USING (public.has_members_access(owner_user_id))
  WITH CHECK (public.has_members_access(owner_user_id));
CREATE POLICY account_members_delete ON public.account_members FOR DELETE TO authenticated
  USING (auth.uid() = member_user_id OR public.has_members_access(owner_user_id));

-- profiles: leitura também liberada pra quem tem acesso à conta (a tela de
-- escolha de perfil precisa mostrar o nome de exibição do dono) — escrita
-- continua estritamente própria, cada login mantém suas próprias preferências
-- de UI (filtros/widgets) independente de qual conta está vendo no momento.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_account_access(id, false));

-- accounts
DROP POLICY IF EXISTS accounts_select_own ON public.accounts;
CREATE POLICY accounts_select_own ON public.accounts FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS accounts_insert_own ON public.accounts;
CREATE POLICY accounts_insert_own ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (bank_connection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_connections bc WHERE bc.id = accounts.bank_connection_id AND bc.user_id = accounts.user_id
    ))
  );
DROP POLICY IF EXISTS accounts_update_own ON public.accounts;
CREATE POLICY accounts_update_own ON public.accounts FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (bank_connection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_connections bc WHERE bc.id = accounts.bank_connection_id AND bc.user_id = accounts.user_id
    ))
  );
DROP POLICY IF EXISTS accounts_delete_own ON public.accounts;
CREATE POLICY accounts_delete_own ON public.accounts FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- categories
DROP POLICY IF EXISTS categories_select_own ON public.categories;
CREATE POLICY categories_select_own ON public.categories FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS categories_insert_own ON public.categories;
CREATE POLICY categories_insert_own ON public.categories FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (parent_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories p WHERE p.id = categories.parent_id AND p.user_id = categories.user_id
    ))
  );
DROP POLICY IF EXISTS categories_update_own ON public.categories;
CREATE POLICY categories_update_own ON public.categories FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (parent_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories p WHERE p.id = categories.parent_id AND p.user_id = categories.user_id
    ))
  );
DROP POLICY IF EXISTS categories_delete_own ON public.categories;
CREATE POLICY categories_delete_own ON public.categories FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- cost_centers
DROP POLICY IF EXISTS cost_centers_select_own ON public.cost_centers;
CREATE POLICY cost_centers_select_own ON public.cost_centers FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS cost_centers_insert_own ON public.cost_centers;
CREATE POLICY cost_centers_insert_own ON public.cost_centers FOR INSERT TO authenticated
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS cost_centers_update_own ON public.cost_centers;
CREATE POLICY cost_centers_update_own ON public.cost_centers FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS cost_centers_delete_own ON public.cost_centers;
CREATE POLICY cost_centers_delete_own ON public.cost_centers FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- assets
DROP POLICY IF EXISTS assets_select_own ON public.assets;
CREATE POLICY assets_select_own ON public.assets FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS assets_insert_own ON public.assets;
CREATE POLICY assets_insert_own ON public.assets FOR INSERT TO authenticated
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS assets_update_own ON public.assets;
CREATE POLICY assets_update_own ON public.assets FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS assets_delete_own ON public.assets;
CREATE POLICY assets_delete_own ON public.assets FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- transactions
DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
CREATE POLICY transactions_select_own ON public.transactions FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS transactions_insert_own ON public.transactions;
CREATE POLICY transactions_insert_own ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.account_id AND a.user_id = transactions.user_id)
    AND (destination_account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts d WHERE d.id = transactions.destination_account_id AND d.user_id = transactions.user_id
    ))
    AND (category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories c WHERE c.id = transactions.category_id AND c.user_id = transactions.user_id
    ))
    AND (cost_center_id IS NULL OR EXISTS (
      SELECT 1 FROM public.cost_centers cc WHERE cc.id = transactions.cost_center_id AND cc.user_id = transactions.user_id
    ))
  );
DROP POLICY IF EXISTS transactions_update_own ON public.transactions;
CREATE POLICY transactions_update_own ON public.transactions FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = transactions.account_id AND a.user_id = transactions.user_id)
    AND (destination_account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts d WHERE d.id = transactions.destination_account_id AND d.user_id = transactions.user_id
    ))
    AND (category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories c WHERE c.id = transactions.category_id AND c.user_id = transactions.user_id
    ))
    AND (cost_center_id IS NULL OR EXISTS (
      SELECT 1 FROM public.cost_centers cc WHERE cc.id = transactions.cost_center_id AND cc.user_id = transactions.user_id
    ))
  );
DROP POLICY IF EXISTS transactions_delete_own ON public.transactions;
CREATE POLICY transactions_delete_own ON public.transactions FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- credit_cards
DROP POLICY IF EXISTS credit_cards_select_own ON public.credit_cards;
CREATE POLICY credit_cards_select_own ON public.credit_cards FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS credit_cards_insert_own ON public.credit_cards;
CREATE POLICY credit_cards_insert_own ON public.credit_cards FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (bank_connection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_connections bc WHERE bc.id = credit_cards.bank_connection_id AND bc.user_id = credit_cards.user_id
    ))
  );
DROP POLICY IF EXISTS credit_cards_update_own ON public.credit_cards;
CREATE POLICY credit_cards_update_own ON public.credit_cards FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (bank_connection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_connections bc WHERE bc.id = credit_cards.bank_connection_id AND bc.user_id = credit_cards.user_id
    ))
  );
DROP POLICY IF EXISTS credit_cards_delete_own ON public.credit_cards;
CREATE POLICY credit_cards_delete_own ON public.credit_cards FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- credit_card_transactions
DROP POLICY IF EXISTS credit_card_transactions_select_own ON public.credit_card_transactions;
CREATE POLICY credit_card_transactions_select_own ON public.credit_card_transactions FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS credit_card_transactions_insert_own ON public.credit_card_transactions;
CREATE POLICY credit_card_transactions_insert_own ON public.credit_card_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND EXISTS (SELECT 1 FROM public.credit_cards cc WHERE cc.id = credit_card_transactions.card_id AND cc.user_id = credit_card_transactions.user_id)
    AND (category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories c WHERE c.id = credit_card_transactions.category_id AND c.user_id = credit_card_transactions.user_id
    ))
    AND (cost_center_id IS NULL OR EXISTS (
      SELECT 1 FROM public.cost_centers ct WHERE ct.id = credit_card_transactions.cost_center_id AND ct.user_id = credit_card_transactions.user_id
    ))
  );
DROP POLICY IF EXISTS credit_card_transactions_update_own ON public.credit_card_transactions;
CREATE POLICY credit_card_transactions_update_own ON public.credit_card_transactions FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND EXISTS (SELECT 1 FROM public.credit_cards cc WHERE cc.id = credit_card_transactions.card_id AND cc.user_id = credit_card_transactions.user_id)
    AND (category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories c WHERE c.id = credit_card_transactions.category_id AND c.user_id = credit_card_transactions.user_id
    ))
    AND (cost_center_id IS NULL OR EXISTS (
      SELECT 1 FROM public.cost_centers ct WHERE ct.id = credit_card_transactions.cost_center_id AND ct.user_id = credit_card_transactions.user_id
    ))
  );
DROP POLICY IF EXISTS credit_card_transactions_delete_own ON public.credit_card_transactions;
CREATE POLICY credit_card_transactions_delete_own ON public.credit_card_transactions FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- investments
DROP POLICY IF EXISTS investments_select_own ON public.investments;
CREATE POLICY investments_select_own ON public.investments FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS investments_insert_own ON public.investments;
CREATE POLICY investments_insert_own ON public.investments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (bank_connection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_connections bc WHERE bc.id = investments.bank_connection_id AND bc.user_id = investments.user_id
    ))
  );
DROP POLICY IF EXISTS investments_update_own ON public.investments;
CREATE POLICY investments_update_own ON public.investments FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS investments_delete_own ON public.investments;
CREATE POLICY investments_delete_own ON public.investments FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- investment_transactions
DROP POLICY IF EXISTS investment_transactions_select_own ON public.investment_transactions;
CREATE POLICY investment_transactions_select_own ON public.investment_transactions FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS investment_transactions_insert_own ON public.investment_transactions;
CREATE POLICY investment_transactions_insert_own ON public.investment_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND EXISTS (SELECT 1 FROM public.investments i WHERE i.id = investment_transactions.investment_id AND i.user_id = investment_transactions.user_id)
  );
DROP POLICY IF EXISTS investment_transactions_update_own ON public.investment_transactions;
CREATE POLICY investment_transactions_update_own ON public.investment_transactions FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS investment_transactions_delete_own ON public.investment_transactions;
CREATE POLICY investment_transactions_delete_own ON public.investment_transactions FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- budgets
DROP POLICY IF EXISTS budgets_select_own ON public.budgets;
CREATE POLICY budgets_select_own ON public.budgets FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS budgets_insert_own ON public.budgets;
CREATE POLICY budgets_insert_own ON public.budgets FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = budgets.account_id AND a.user_id = budgets.user_id))
    AND (card_id IS NULL OR EXISTS (SELECT 1 FROM public.credit_cards cc WHERE cc.id = budgets.card_id AND cc.user_id = budgets.user_id))
    AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = budgets.category_id AND c.user_id = budgets.user_id))
    AND (cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers ct WHERE ct.id = budgets.cost_center_id AND ct.user_id = budgets.user_id))
  );
DROP POLICY IF EXISTS budgets_update_own ON public.budgets;
CREATE POLICY budgets_update_own ON public.budgets FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = budgets.account_id AND a.user_id = budgets.user_id))
    AND (card_id IS NULL OR EXISTS (SELECT 1 FROM public.credit_cards cc WHERE cc.id = budgets.card_id AND cc.user_id = budgets.user_id))
    AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = budgets.category_id AND c.user_id = budgets.user_id))
    AND (cost_center_id IS NULL OR EXISTS (SELECT 1 FROM public.cost_centers ct WHERE ct.id = budgets.cost_center_id AND ct.user_id = budgets.user_id))
  );
DROP POLICY IF EXISTS budgets_delete_own ON public.budgets;
CREATE POLICY budgets_delete_own ON public.budgets FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- budget_recipients
DROP POLICY IF EXISTS budget_recipients_select_own ON public.budget_recipients;
CREATE POLICY budget_recipients_select_own ON public.budget_recipients FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS budget_recipients_insert_own ON public.budget_recipients;
CREATE POLICY budget_recipients_insert_own ON public.budget_recipients FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_recipients.budget_id AND b.user_id = budget_recipients.user_id)
    AND EXISTS (SELECT 1 FROM public.telegram_recipients tr WHERE tr.id = budget_recipients.recipient_id AND tr.user_id = budget_recipients.user_id)
  );
DROP POLICY IF EXISTS budget_recipients_update_own ON public.budget_recipients;
CREATE POLICY budget_recipients_update_own ON public.budget_recipients FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS budget_recipients_delete_own ON public.budget_recipients;
CREATE POLICY budget_recipients_delete_own ON public.budget_recipients FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- budget_alerts_sent (sem policy de update — são registros de log, imutáveis)
DROP POLICY IF EXISTS budget_alerts_sent_select_own ON public.budget_alerts_sent;
CREATE POLICY budget_alerts_sent_select_own ON public.budget_alerts_sent FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS budget_alerts_sent_insert_own ON public.budget_alerts_sent;
CREATE POLICY budget_alerts_sent_insert_own ON public.budget_alerts_sent FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_alerts_sent.budget_id AND b.user_id = budget_alerts_sent.user_id)
  );
DROP POLICY IF EXISTS budget_alerts_sent_delete_own ON public.budget_alerts_sent;
CREATE POLICY budget_alerts_sent_delete_own ON public.budget_alerts_sent FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- bank_connections: conectar/sincronizar/desconectar exige can_manage_connections
-- (não só can_edit) — ver a lista/status continua liberado pra qualquer membro.
DROP POLICY IF EXISTS bank_connections_select_own ON public.bank_connections;
CREATE POLICY bank_connections_select_own ON public.bank_connections FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS bank_connections_insert_own ON public.bank_connections;
CREATE POLICY bank_connections_insert_own ON public.bank_connections FOR INSERT TO authenticated
  WITH CHECK (public.has_connections_access(user_id));
DROP POLICY IF EXISTS bank_connections_update_own ON public.bank_connections;
CREATE POLICY bank_connections_update_own ON public.bank_connections FOR UPDATE TO authenticated
  USING (public.has_connections_access(user_id))
  WITH CHECK (public.has_connections_access(user_id));
DROP POLICY IF EXISTS bank_connections_delete_own ON public.bank_connections;
CREATE POLICY bank_connections_delete_own ON public.bank_connections FOR DELETE TO authenticated
  USING (public.has_connections_access(user_id));

-- support_tickets (sem policy de delete, igual já era)
DROP POLICY IF EXISTS support_tickets_select_own ON public.support_tickets;
CREATE POLICY support_tickets_select_own ON public.support_tickets FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS support_tickets_insert_own ON public.support_tickets;
CREATE POLICY support_tickets_insert_own ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (bank_connection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_connections bc WHERE bc.id = support_tickets.bank_connection_id AND bc.user_id = support_tickets.user_id
    ))
  );
DROP POLICY IF EXISTS support_tickets_update_own ON public.support_tickets;
CREATE POLICY support_tickets_update_own ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (bank_connection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_connections bc WHERE bc.id = support_tickets.bank_connection_id AND bc.user_id = support_tickets.user_id
    ))
  );

-- telegram_recipients
DROP POLICY IF EXISTS telegram_recipients_select_own ON public.telegram_recipients;
CREATE POLICY telegram_recipients_select_own ON public.telegram_recipients FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS telegram_recipients_insert_own ON public.telegram_recipients;
CREATE POLICY telegram_recipients_insert_own ON public.telegram_recipients FOR INSERT TO authenticated
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS telegram_recipients_update_own ON public.telegram_recipients;
CREATE POLICY telegram_recipients_update_own ON public.telegram_recipients FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (public.has_account_access(user_id, true));
DROP POLICY IF EXISTS telegram_recipients_delete_own ON public.telegram_recipients;
CREATE POLICY telegram_recipients_delete_own ON public.telegram_recipients FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));

-- telegram_digests (sem policy de delete, igual já era)
DROP POLICY IF EXISTS telegram_digests_select_own ON public.telegram_digests;
CREATE POLICY telegram_digests_select_own ON public.telegram_digests FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));
DROP POLICY IF EXISTS telegram_digests_insert_own ON public.telegram_digests;
CREATE POLICY telegram_digests_insert_own ON public.telegram_digests FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (recipient_id IS NULL OR EXISTS (
      SELECT 1 FROM public.telegram_recipients tr WHERE tr.id = telegram_digests.recipient_id AND tr.user_id = telegram_digests.user_id
    ))
  );
DROP POLICY IF EXISTS telegram_digests_update_own ON public.telegram_digests;
CREATE POLICY telegram_digests_update_own ON public.telegram_digests FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (recipient_id IS NULL OR EXISTS (
      SELECT 1 FROM public.telegram_recipients tr WHERE tr.id = telegram_digests.recipient_id AND tr.user_id = telegram_digests.user_id
    ))
  );
