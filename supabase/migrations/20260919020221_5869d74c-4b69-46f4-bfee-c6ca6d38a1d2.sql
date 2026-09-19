CREATE POLICY debug_audit_insert ON public.debug_sql_audit
  FOR INSERT TO debug_readonly WITH CHECK (true);
CREATE POLICY debug_audit_update ON public.debug_sql_audit
  FOR UPDATE TO debug_readonly USING (true) WITH CHECK (true);