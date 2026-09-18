DO $$
DECLARE
  target_user uuid;
BEGIN
  SELECT id INTO target_user FROM auth.users WHERE email = 'murilovieiracardoso@gmail.com';
  IF target_user IS NULL THEN
    RAISE NOTICE 'Usuário não encontrado, nada a fazer.';
    RETURN;
  END IF;

  UPDATE public.bank_connections
  SET last_synced_at = NULL
  WHERE user_id = target_user;
END $$;