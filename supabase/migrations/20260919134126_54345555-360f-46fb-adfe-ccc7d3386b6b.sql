GRANT SELECT ON public.profiles TO authenticated;
REVOKE ALL ON public.pluggy_credentials FROM anon, authenticated;
GRANT ALL ON public.pluggy_credentials TO service_role;