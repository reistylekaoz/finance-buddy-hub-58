-- Corrige o saldo inicial da conta Nubank Murilo, que ficou errado porque
-- initial_balance era recalculado a cada sincronização (bug já corrigido no
-- código). Recalcula a partir do saldo real informado pelo usuário
-- (R$ 1.048,75) menos o líquido dos lançamentos que já estão corretos no
-- banco, com a mesma fórmula usada no cálculo de saldo do app.
DO $$
DECLARE
  target_user uuid;
  target_account uuid := 'b62595c1-2a31-4427-b26a-d5a3d1d4d18e';
  net numeric;
BEGIN
  SELECT id INTO target_user FROM auth.users WHERE email = 'murilovieiracardoso@gmail.com';
  IF target_user IS NULL THEN
    RAISE NOTICE 'Usuário não encontrado, nada a fazer.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE id = target_account AND user_id = target_user
  ) THEN
    RAISE NOTICE 'Conta não encontrada para esse usuário, nada a fazer.';
    RETURN;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'income' AND account_id = target_account THEN amount
      WHEN transaction_type = 'expense' AND account_id = target_account THEN -amount
      WHEN transaction_type = 'transfer' AND account_id = target_account THEN -amount
      WHEN transaction_type = 'transfer' AND destination_account_id = target_account THEN amount
      ELSE 0
    END
  ), 0)
  INTO net
  FROM public.transactions
  WHERE user_id = target_user
    AND status != 'provisioned'
    AND (account_id = target_account OR destination_account_id = target_account);

  UPDATE public.accounts
  SET initial_balance = 1048.75 - net
  WHERE id = target_account AND user_id = target_user;
END $$;
