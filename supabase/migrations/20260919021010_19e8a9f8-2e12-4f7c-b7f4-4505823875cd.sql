DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'debug_sql_audit'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS debug_readonly_select ON public.%I', t.tablename);
    EXECUTE format(
      'CREATE POLICY debug_readonly_select ON public.%I FOR SELECT TO debug_readonly USING (true)',
      t.tablename);
  END LOOP;
END
$$;