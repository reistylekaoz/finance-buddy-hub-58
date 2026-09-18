DO $$
DECLARE
  target_user uuid;
  conn record;
BEGIN
  SELECT id INTO target_user FROM auth.users WHERE email = 'murilovieiracardoso@gmail.com';
  IF target_user IS NULL THEN
    RAISE NOTICE 'Usuário não encontrado, nada a limpar.';
    RETURN;
  END IF;

  FOR conn IN
    SELECT id FROM public.bank_connections
    WHERE user_id = target_user
      AND (
        connector_name ILIKE '%sib%'
        OR connector_name ILIKE '%diners%'
        OR connector_name ILIKE '%dinners%'
        OR connector_name ILIKE '%pluggy%'
      )
  LOOP
    DELETE FROM public.credit_card_transactions
    WHERE card_id IN (SELECT id FROM public.credit_cards WHERE bank_connection_id = conn.id);

    DELETE FROM public.transactions
    WHERE account_id IN (SELECT id FROM public.accounts WHERE bank_connection_id = conn.id)
       OR destination_account_id IN (SELECT id FROM public.accounts WHERE bank_connection_id = conn.id);

    DELETE FROM public.credit_cards WHERE bank_connection_id = conn.id;
    DELETE FROM public.accounts WHERE bank_connection_id = conn.id;
    DELETE FROM public.bank_connections WHERE id = conn.id;
  END LOOP;
END $$;