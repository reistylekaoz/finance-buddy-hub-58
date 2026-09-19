REVOKE ALL ON FUNCTION public.has_pluggy_credentials() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_pluggy_credentials() TO authenticated, service_role;