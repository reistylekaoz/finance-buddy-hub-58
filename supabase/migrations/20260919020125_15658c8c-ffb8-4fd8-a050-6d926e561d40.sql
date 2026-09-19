-- O "set local role" nao e permitido dentro de SECURITY DEFINER; em vez disso,
-- a funcao passa a PERTENCER ao perfil limitado, entao SECURITY DEFINER ja
-- executa com os privilegios restritos dele.
DO $$
BEGIN
  EXECUTE format('GRANT debug_readonly TO %I', current_user);
END
$$;

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
  if normalized ~ '(auth|storage|vault|pgsodium|realtime|supabase_functions|cron|pg_catalog|information_schema)\s*\.'
     or normalized ~ '\mset\s+role\M' or normalized ~ '\mreset\s+role\M'
     or normalized ~ '\mset_config\M' or normalized ~ '\mpg_read_file\M' then
    raise exception 'Consulta nao permitida.';
  end if;

  perform set_config('transaction_read_only', 'on', true);

  begin
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', cleaned) into result;
  exception when others then
    err := sqlerrm;
    insert into public.debug_sql_audit (query, succeeded, error_message)
      values (left(cleaned, 2000), false, left(err, 500));
    raise exception '%', err;
  end;

  insert into public.debug_sql_audit (query, succeeded, row_count)
    values (left(cleaned, 2000), true, jsonb_array_length(result));
  return result;
end;
$function$;

GRANT INSERT ON public.debug_sql_audit TO debug_readonly;
GRANT USAGE ON SCHEMA public TO debug_readonly;

-- O novo dono precisa de CREATE no schema apenas no momento do ALTER;
-- em seguida o privilegio e revogado (o perfil segue somente-leitura).
GRANT CREATE ON SCHEMA public TO debug_readonly;
ALTER FUNCTION public.debug_readonly_sql(text) OWNER TO debug_readonly;
REVOKE CREATE ON SCHEMA public FROM debug_readonly;

REVOKE ALL ON FUNCTION public.debug_readonly_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debug_readonly_sql(text) TO service_role;