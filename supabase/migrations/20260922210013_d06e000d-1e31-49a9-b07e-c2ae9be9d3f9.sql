-- Liga um ticket a uma conta específica — usado pelos novos tickets de
-- divergência de saldo (detectados na sincronização diária), pra dar pra
-- identificar/desduplicar por conta, e pro painel de problemas linkar de
-- volta pra conta certa.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_tickets_account_id_idx ON public.support_tickets (account_id);

DROP POLICY IF EXISTS support_tickets_insert_own ON public.support_tickets;
CREATE POLICY support_tickets_insert_own ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    public.has_account_access(user_id, true)
    AND (bank_connection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_connections bc WHERE bc.id = support_tickets.bank_connection_id AND bc.user_id = support_tickets.user_id
    ))
    AND (account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = support_tickets.account_id AND a.user_id = support_tickets.user_id
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
    AND (account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = support_tickets.account_id AND a.user_id = support_tickets.user_id
    ))
  );