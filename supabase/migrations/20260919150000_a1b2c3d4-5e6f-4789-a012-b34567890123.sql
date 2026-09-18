-- A pedido do usuário: limpa todos os lançamentos (contas e cartão de
-- crédito) da conta murilovieiracardoso@gmail.com, mantendo apenas contas
-- bancárias, categorias e centros de custo. Cartões de crédito também são
-- removidos por completo (decisão explícita do usuário), não só suas
-- compras. Patrimônio (assets) e conexões bancárias não são "lançamentos"
-- e não são tocados. Escopo restrito ao user_id resolvido pelo e-mail; em
-- qualquer outro ambiente/usuário este bloco não encontra nada e não faz
-- nada.
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
