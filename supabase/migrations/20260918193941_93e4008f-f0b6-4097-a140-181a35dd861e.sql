DO $$
DECLARE
  target_user uuid;
BEGIN
  SELECT id INTO target_user FROM auth.users WHERE email = 'murilovieiracardoso@gmail.com';
  IF target_user IS NULL THEN
    RAISE NOTICE 'Usuário não encontrado, nada a fazer.';
    RETURN;
  END IF;

  DELETE FROM public.transactions
  WHERE user_id = target_user
    AND (
      account_id IN (
        SELECT id FROM public.accounts
        WHERE user_id = target_user
          AND pluggy_account_id IS NOT NULL
          AND bank_connection_id IS NULL
      )
      OR destination_account_id IN (
        SELECT id FROM public.accounts
        WHERE user_id = target_user
          AND pluggy_account_id IS NOT NULL
          AND bank_connection_id IS NULL
      )
    );

  DELETE FROM public.accounts
  WHERE user_id = target_user
    AND pluggy_account_id IS NOT NULL
    AND bank_connection_id IS NULL;

  -- credit_card_transactions cai em cascata (ON DELETE CASCADE).
  DELETE FROM public.credit_cards
  WHERE user_id = target_user
    AND pluggy_account_id IS NOT NULL
    AND bank_connection_id IS NULL;

  -- Conexões que ficaram sem nenhuma conta/cartão vinculado (tentativas de
  -- reconexão feitas enquanto o bug ainda estava ativo).
  DELETE FROM public.bank_connections
  WHERE user_id = target_user
    AND id NOT IN (
      SELECT bank_connection_id FROM public.accounts WHERE bank_connection_id IS NOT NULL
    )
    AND id NOT IN (
      SELECT bank_connection_id FROM public.credit_cards WHERE bank_connection_id IS NOT NULL
    );
END $$;