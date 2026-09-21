-- Filtro de status (ativa/inativa/todas) das telas de Contas e Cartões de
-- crédito, persistido por usuário pra reaparecer sozinho na próxima sessão,
-- do mesmo jeito que profiles.dashboard_filters/transactions_filters.
ALTER TABLE public.profiles ADD COLUMN active_filters jsonb;