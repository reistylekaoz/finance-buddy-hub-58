-- Libera o botão "Sincronizar agora" imediatamente (sem esperar as 12h do
-- limite normal) para as conexões bancárias de murilovieiracardoso@gmail.com,
-- porque a sincronização anterior calculou o saldo errado (bug já corrigido
-- no código: lançamentos bancários reais vêm com amount sempre positivo, a
-- direção é o campo type). Ressincronizar corrige os dados, já que o upsert
-- por external_id atualiza os lançamentos existentes em vez de duplicar.
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
