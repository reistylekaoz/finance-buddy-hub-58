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
  if normalized ~ '(auth|storage|vault|pgsodium|realtime|supabase_functions|cron|pg_catalog|information_schema)\s*\.'
     or normalized ~ '\mset\s+role\M' or normalized ~ '\mreset\s+role\M'
     or normalized ~ '\mset_config\M' or normalized ~ '\mpg_read_file\M' then
    raise exception 'Consulta nao permitida.';
  end if;

  -- Auditoria gravada ANTES de ligar o modo somente-leitura.
  insert into public.debug_sql_audit (query, succeeded)
    values (left(cleaned, 2000), false)
    returning id into audit_id;

  perform set_config('transaction_read_only', 'on', true);

  begin
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', cleaned) into result;
  exception when others then
    err := sqlerrm;
    perform set_config('transaction_read_only', 'off', true);
    update public.debug_sql_audit
      set error_message = left(err, 500)
      where id = audit_id;
    raise exception '%', err;
  end;

  perform set_config('transaction_read_only', 'off', true);
  update public.debug_sql_audit
    set succeeded = true, row_count = jsonb_array_length(result)
    where id = audit_id;
  return result;
end;
$function$;

GRANT INSERT, UPDATE ON public.debug_sql_audit TO debug_readonly;