-- Sincronizar um banco grava dados (contas, cartões, lançamentos) como
-- consequência direta de conectar — sem isso, um membro com só
-- "gerenciar conexões" (sem "editar dados") conseguiria iniciar a conexão
-- pelo servidor, mas toda gravação do próprio sync seria barrada pela RLS.
-- Trata as duas permissões como equivalentes pra fins de escrita.
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
        AND (NOT require_edit OR am.can_edit OR am.can_manage_connections)
    );
$$;
