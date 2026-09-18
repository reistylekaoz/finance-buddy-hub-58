DO $$
DECLARE
  target_user uuid;
BEGIN
  SELECT id INTO target_user FROM auth.users WHERE email = 'murilovieiracardoso@gmail.com';
  IF target_user IS NULL THEN
    RAISE NOTICE 'Usuário não encontrado, nada a limpar.';
    RETURN;
  END IF;

  DELETE FROM public.credit_card_transactions WHERE user_id = target_user;
  DELETE FROM public.credit_cards WHERE user_id = target_user;
  DELETE FROM public.transactions WHERE user_id = target_user;
END $$;