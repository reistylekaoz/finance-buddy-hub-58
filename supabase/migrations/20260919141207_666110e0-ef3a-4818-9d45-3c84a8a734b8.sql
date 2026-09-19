DROP FUNCTION IF EXISTS public.debug_readonly_sql(text);
DROP FUNCTION IF EXISTS public.debug_audit_start(text);
DROP FUNCTION IF EXISTS public.debug_audit_finish(uuid, boolean, integer, text);
DROP TABLE IF EXISTS public.debug_sql_audit;

DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'debug_readonly') THEN
    FOR r IN
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND 'debug_readonly' = ANY(roles)
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM debug_readonly';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM debug_readonly';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM debug_readonly';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM debug_readonly';
    EXECUTE 'DROP OWNED BY debug_readonly';
    EXECUTE 'DROP ROLE debug_readonly';
  END IF;
END $$;