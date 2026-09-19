-- Reduz o raio de dano do endpoint de debug SQL (/api/public/debug/sql).
--
-- debug_readonly_sql rodava como security definer com os privilégios de
-- quem criou a função (o papel usado pelas migrações) — isso deixa
-- QUALQUER schema/tabela visível a esse papel acessível via uma consulta
-- SELECT, inclusive auth.users (e-mail, hash de senha) e colunas de
-- credencial como profiles.pluggy_client_secret e
-- telegram_recipients.link_token. A checagem de "somente leitura" impede
-- escrita, não impede ler dado sensível.
--
-- Criamos um papel próprio, sem privilégio nenhum por padrão (logo, sem
-- acesso ao schema auth), com SELECT só nas tabelas do schema public e
-- sem acesso às colunas de credencial/segredo, e passamos a função a
-- rodar com esse papel em vez do papel que a criou.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'debug_sql_role') then
    create role debug_sql_role nologin;
  end if;
end
$$;

grant usage on schema public to debug_sql_role;
grant select on all tables in schema public to debug_sql_role;
alter default privileges in schema public grant select on tables to debug_sql_role;

-- Nunca legíveis pelo debug SQL, mesmo que a consulta selecione a tabela
-- inteira: credenciais de terceiros e o token de vínculo do Telegram.
--
-- IMPORTANTE: "revoke select (coluna) ... from role" NÃO basta quando o
-- papel também tem select na tabela inteira (como acima, via "all tables
-- in schema public") — no Postgres, o grant de tabela inteira continua
-- valendo e "select *" volta a enxergar tudo, ignorando o revoke de
-- coluna. O jeito que realmente funciona é revogar a tabela inteira e
-- conceder de volta só as colunas seguras (lista explícita).
revoke select on public.profiles from debug_sql_role;
grant select (id, display_name, preferred_currency, created_at, updated_at)
  on public.profiles to debug_sql_role;

revoke select on public.telegram_recipients from debug_sql_role;
grant select (
  id, user_id, label, telegram_username, telegram_chat_id,
  notify_daily, notify_weekly, notify_monthly,
  all_accounts, account_ids, card_ids, created_at, updated_at
) on public.telegram_recipients to debug_sql_role;

alter function public.debug_readonly_sql(text) owner to debug_sql_role;

-- Trilha de auditoria: cada chamada ao endpoint de debug fica registrada
-- (consulta, quando e quantas linhas voltaram), pra qualquer uso indevido
-- do token deixar rastro em vez de passar em silêncio. Só o service_role
-- lê/escreve — não passa por RLS de usuário nenhum.
create table if not exists public.debug_sql_audit_log (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  query text not null,
  row_count integer,
  error text
);
grant select, insert on public.debug_sql_audit_log to service_role;
alter table public.debug_sql_audit_log enable row level security;
-- A regra "alter default privileges" acima já dá select em toda tabela
-- nova pro debug_sql_role, incluindo esta — não faz sentido a ferramenta
-- de debug conseguir ler o próprio log de auditoria (revelaria as
-- consultas de outras chamadas ao endpoint).
revoke select on public.debug_sql_audit_log from debug_sql_role;
