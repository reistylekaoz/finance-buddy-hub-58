-- 1) Perfil limitado usado pela consulta externa de debug.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'debug_readonly') THEN
    CREATE ROLE debug_readonly NOLOGIN NOINHERIT;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM debug_readonly;
GRANT USAGE ON SCHEMA public TO debug_readonly;

-- Somente leitura, tabela a tabela, e sem as colunas sensíveis.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM debug_readonly', t.tablename);
  END LOOP;

  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('profiles', 'telegram_recipients', 'debug_sql_audit')
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO debug_readonly', t.tablename);
  END LOOP;
END
$$;

GRANT SELECT (id, display_name, preferred_currency, created_at, updated_at, pluggy_client_id)
  ON public.profiles TO debug_readonly;

GRANT SELECT (
  id, user_id, label, telegram_username, telegram_chat_id,
  notify_daily, notify_weekly, notify_monthly,
  all_accounts, account_ids, card_ids, created_at, updated_at
) ON public.telegram_recipients TO debug_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM debug_readonly;

-- 2) Auditoria de cada consulta externa.
CREATE TABLE IF NOT EXISTS public.debug_sql_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  succeeded boolean NOT NULL,
  error_message text,
  row_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.debug_sql_audit TO service_role;
ALTER TABLE public.debug_sql_audit ENABLE ROW LEVEL SECURITY;

-- 3) A função de debug passa a executar com o perfil limitado + auditoria.
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
begin
  if normalized !~ '^(select|with|explain|table|show)\s' then
    raise exception 'Apenas consultas de leitura sao permitidas.';
  end if;
  if cleaned ~ ';' then
    raise exception 'Apenas uma consulta por chamada.';
  end if;
  -- Bloqueia acesso a schemas internos e a alteracao de papel dentro da query.
  if normalized ~ '(auth|storage|vault|pgsodium|realtime|supabase_functions|cron|pg_catalog|information_schema)\s*\.'
     or normalized ~ '\mset\s+role\M' or normalized ~ '\mreset\s+role\M'
     or normalized ~ '\mset_config\M' or normalized ~ '\mpg_read_file\M' then
    raise exception 'Consulta nao permitida.';
  end if;

  perform set_config('transaction_read_only', 'on', true);
  -- Executa com privilegios minimos: sem colunas sensiveis, sem schemas internos.
  set local role debug_readonly;

  begin
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', cleaned) into result;
  exception when others then
    err := sqlerrm;
    reset role;
    insert into public.debug_sql_audit (query, succeeded, error_message)
      values (left(cleaned, 2000), false, left(err, 500));
    raise exception '%', err;
  end;

  reset role;
  insert into public.debug_sql_audit (query, succeeded, row_count)
    values (left(cleaned, 2000), true, jsonb_array_length(result));
  return result;
end;
$function$;

REVOKE ALL ON FUNCTION public.debug_readonly_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debug_readonly_sql(text) TO service_role;