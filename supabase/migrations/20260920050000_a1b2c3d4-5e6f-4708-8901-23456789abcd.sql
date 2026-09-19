-- Guarda o último filtro de moeda/período escolhido no dashboard, pra
-- reaparecer sozinho na próxima sessão em vez do usuário ter que escolher de
-- novo toda vez que abre o app.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_filters jsonb;
