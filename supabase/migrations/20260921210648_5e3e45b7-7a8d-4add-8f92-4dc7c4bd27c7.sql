CREATE TABLE IF NOT EXISTS public.ignored_external_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  external_id text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ignored_external_ids TO authenticated;
GRANT ALL ON public.ignored_external_ids TO service_role;

ALTER TABLE public.ignored_external_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ignored_external_ids_select ON public.ignored_external_ids;
CREATE POLICY ignored_external_ids_select ON public.ignored_external_ids
  FOR SELECT TO authenticated
  USING (public.has_account_access(user_id, false));

DROP POLICY IF EXISTS ignored_external_ids_insert ON public.ignored_external_ids;
CREATE POLICY ignored_external_ids_insert ON public.ignored_external_ids
  FOR INSERT TO authenticated
  WITH CHECK (public.has_account_access(user_id, true));

DROP POLICY IF EXISTS ignored_external_ids_update ON public.ignored_external_ids;
CREATE POLICY ignored_external_ids_update ON public.ignored_external_ids
  FOR UPDATE TO authenticated
  USING (public.has_account_access(user_id, true))
  WITH CHECK (public.has_account_access(user_id, true));

DROP POLICY IF EXISTS ignored_external_ids_delete ON public.ignored_external_ids;
CREATE POLICY ignored_external_ids_delete ON public.ignored_external_ids
  FOR DELETE TO authenticated
  USING (public.has_account_access(user_id, true));