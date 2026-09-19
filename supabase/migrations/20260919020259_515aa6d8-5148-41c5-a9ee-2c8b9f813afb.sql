GRANT SELECT ON public.debug_sql_audit TO debug_readonly;
CREATE POLICY debug_audit_select ON public.debug_sql_audit
  FOR SELECT TO debug_readonly USING (true);