-- Guarda o último filtro (conta/categoria/centro de custo/período/ordenação)
-- escolhido na tela de Lançamentos, pra reaparecer sozinho na próxima sessão,
-- do mesmo jeito que já acontece com os filtros do dashboard.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS transactions_filters jsonb;
