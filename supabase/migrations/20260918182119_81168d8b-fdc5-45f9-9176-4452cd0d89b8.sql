create or replace function public.debug_readonly_sql(query text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  cleaned text := regexp_replace(query, ';\s*$', '');
  normalized text := lower(btrim(cleaned));
  result jsonb;
begin
  if normalized !~ '^(select|with|explain|table|show)\s' then
    raise exception 'Apenas consultas de leitura sao permitidas.';
  end if;
  if cleaned ~ ';' then
    raise exception 'Apenas uma consulta por chamada.';
  end if;
  perform set_config('transaction_read_only', 'on', true);
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', cleaned) into result;
  return result;
end;
$fn$;

revoke all on function public.debug_readonly_sql(text) from public;
revoke all on function public.debug_readonly_sql(text) from anon;
revoke all on function public.debug_readonly_sql(text) from authenticated;
grant execute on function public.debug_readonly_sql(text) to service_role;