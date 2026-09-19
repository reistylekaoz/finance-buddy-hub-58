-- 1. Credenciais Pluggy em tabela isolada (sem acesso pelo navegador)
CREATE TABLE IF NOT EXISTS public.pluggy_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pluggy_credentials TO service_role;
ALTER TABLE public.pluggy_credentials ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS pluggy_credentials_set_updated_at ON public.pluggy_credentials;
CREATE TRIGGER pluggy_credentials_set_updated_at
  BEFORE UPDATE ON public.pluggy_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indicador público (booleano) no perfil
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pluggy_configured boolean NOT NULL DEFAULT false;

INSERT INTO public.pluggy_credentials (user_id, client_id, client_secret)
SELECT id, pluggy_client_id, pluggy_client_secret
FROM public.profiles
WHERE pluggy_client_id IS NOT NULL AND pluggy_client_secret IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.profiles p SET pluggy_configured = true
WHERE EXISTS (SELECT 1 FROM public.pluggy_credentials c WHERE c.user_id = p.id);

CREATE OR REPLACE FUNCTION public.sync_pluggy_configured()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET pluggy_configured = false WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  UPDATE public.profiles SET pluggy_configured = true WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pluggy_credentials_sync_flag ON public.pluggy_credentials;
CREATE TRIGGER pluggy_credentials_sync_flag
  AFTER INSERT OR UPDATE OR DELETE ON public.pluggy_credentials
  FOR EACH ROW EXECUTE FUNCTION public.sync_pluggy_configured();

ALTER TABLE public.profiles DROP COLUMN IF EXISTS pluggy_client_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pluggy_client_secret;

DROP FUNCTION IF EXISTS public.has_pluggy_credentials();

-- 2. Debug role: sem acesso a dados sensíveis
DROP POLICY IF EXISTS debug_readonly_select ON public.profiles;
DROP POLICY IF EXISTS debug_readonly_select ON public.bank_connections;
DROP POLICY IF EXISTS debug_readonly_select ON public.telegram_recipients;
DROP POLICY IF EXISTS debug_readonly_select ON public.telegram_digests;
DROP POLICY IF EXISTS debug_readonly_select ON public.support_tickets;

REVOKE ALL ON public.profiles FROM debug_readonly;
REVOKE ALL ON public.bank_connections FROM debug_readonly;
REVOKE ALL ON public.telegram_recipients FROM debug_readonly;
REVOKE ALL ON public.telegram_digests FROM debug_readonly;
REVOKE ALL ON public.support_tickets FROM debug_readonly;
REVOKE ALL ON public.pluggy_credentials FROM debug_readonly;

-- 3. Auditoria fora do alcance do debug role
DROP POLICY IF EXISTS debug_audit_select ON public.debug_sql_audit;
DROP POLICY IF EXISTS debug_audit_insert ON public.debug_sql_audit;
DROP POLICY IF EXISTS debug_audit_update ON public.debug_sql_audit;
REVOKE ALL ON public.debug_sql_audit FROM debug_readonly;

CREATE OR REPLACE FUNCTION public.debug_audit_start(_query text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.debug_sql_audit (query, succeeded)
  VALUES (left(_query, 2000), false)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.debug_audit_finish(_id uuid, _succeeded boolean, _row_count integer, _error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.debug_sql_audit
    SET succeeded = _succeeded,
        row_count = _row_count,
        error_message = left(_error, 500)
    WHERE id = _id;
END;
$$;

ALTER FUNCTION public.debug_audit_start(text) OWNER TO postgres;
ALTER FUNCTION public.debug_audit_finish(uuid, boolean, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.debug_audit_start(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debug_audit_finish(uuid, boolean, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debug_audit_start(text) TO debug_readonly, service_role;
GRANT EXECUTE ON FUNCTION public.debug_audit_finish(uuid, boolean, integer, text) TO debug_readonly, service_role;

CREATE OR REPLACE FUNCTION public.debug_readonly_sql(query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cleaned text := regexp_replace(query, ';\s*$', '');
  normalized text := lower(btrim(cleaned));
  result jsonb;
  err text;
  audit_id uuid;
begin
  if normalized !~ '^(select|with|explain|table|show)\s' then
    raise exception 'Apenas consultas de leitura sao permitidas.';
  end if;
  if cleaned ~ ';' then
    raise exception 'Apenas uma consulta por chamada.';
  end if;
  if normalized ~ '\m(insert|update|delete|merge|truncate|drop|create|alter|grant|revoke|copy|vacuum|call|do|refresh|comment|lock|prepare|listen|notify)\M' then
    raise exception 'Apenas consultas de leitura sao permitidas.';
  end if;
  if normalized ~ '(auth|storage|vault|pgsodium|realtime|supabase_functions|cron|pg_catalog|information_schema)\s*\.'
     or normalized ~ '\mset\s+role\M' or normalized ~ '\mreset\s+role\M'
     or normalized ~ '\mset_config\M' or normalized ~ '\mpg_read_file\M'
     or normalized ~ '\mdblink\M' or normalized ~ '\mpg_sleep\M' then
    raise exception 'Consulta nao permitida.';
  end if;

  audit_id := public.debug_audit_start(cleaned);

  begin
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', cleaned) into result;
  exception when others then
    err := sqlerrm;
    perform public.debug_audit_finish(audit_id, false, null, err);
    raise exception '%', err;
  end;

  perform public.debug_audit_finish(audit_id, true, jsonb_array_length(result), null);
  return result;
end;
$function$;

-- 4. Funções internas não devem ser chamáveis pelo navegador
REVOKE ALL ON FUNCTION public.debug_readonly_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debug_readonly_sql(text) TO service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_pluggy_configured() FROM PUBLIC, anon, authenticated;