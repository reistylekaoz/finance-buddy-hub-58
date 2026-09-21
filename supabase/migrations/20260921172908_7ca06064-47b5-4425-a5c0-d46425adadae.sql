REVOKE ALL ON FUNCTION public.has_account_access(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.has_connections_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.has_members_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.accept_account_invite(uuid) FROM anon;