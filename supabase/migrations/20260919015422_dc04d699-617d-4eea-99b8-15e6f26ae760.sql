DROP POLICY IF EXISTS accounts_insert_own ON public.accounts;
CREATE POLICY accounts_insert_own ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      bank_connection_id IS NULL
      OR EXISTS (SELECT 1 FROM public.bank_connections bc WHERE bc.id = accounts.bank_connection_id AND bc.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS accounts_update_own ON public.accounts;
CREATE POLICY accounts_update_own ON public.accounts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      bank_connection_id IS NULL
      OR EXISTS (SELECT 1 FROM public.bank_connections bc WHERE bc.id = accounts.bank_connection_id AND bc.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS credit_cards_insert_own ON public.credit_cards;
CREATE POLICY credit_cards_insert_own ON public.credit_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      bank_connection_id IS NULL
      OR EXISTS (SELECT 1 FROM public.bank_connections bc WHERE bc.id = credit_cards.bank_connection_id AND bc.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS credit_cards_update_own ON public.credit_cards;
CREATE POLICY credit_cards_update_own ON public.credit_cards
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      bank_connection_id IS NULL
      OR EXISTS (SELECT 1 FROM public.bank_connections bc WHERE bc.id = credit_cards.bank_connection_id AND bc.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS support_tickets_insert_own ON public.support_tickets;
CREATE POLICY support_tickets_insert_own ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      bank_connection_id IS NULL
      OR EXISTS (SELECT 1 FROM public.bank_connections bc WHERE bc.id = support_tickets.bank_connection_id AND bc.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS support_tickets_update_own ON public.support_tickets;
CREATE POLICY support_tickets_update_own ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      bank_connection_id IS NULL
      OR EXISTS (SELECT 1 FROM public.bank_connections bc WHERE bc.id = support_tickets.bank_connection_id AND bc.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS telegram_digests_insert_own ON public.telegram_digests;
CREATE POLICY telegram_digests_insert_own ON public.telegram_digests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      recipient_id IS NULL
      OR EXISTS (SELECT 1 FROM public.telegram_recipients tr WHERE tr.id = telegram_digests.recipient_id AND tr.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS telegram_digests_update_own ON public.telegram_digests;
CREATE POLICY telegram_digests_update_own ON public.telegram_digests
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      recipient_id IS NULL
      OR EXISTS (SELECT 1 FROM public.telegram_recipients tr WHERE tr.id = telegram_digests.recipient_id AND tr.user_id = auth.uid())
    )
  );

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, preferred_currency, created_at, updated_at, pluggy_client_id) ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.has_pluggy_credentials()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.pluggy_client_id IS NOT NULL
      AND p.pluggy_client_secret IS NOT NULL
  )
$$;

REVOKE ALL ON FUNCTION public.has_pluggy_credentials() FROM public;
GRANT EXECUTE ON FUNCTION public.has_pluggy_credentials() TO authenticated, service_role;