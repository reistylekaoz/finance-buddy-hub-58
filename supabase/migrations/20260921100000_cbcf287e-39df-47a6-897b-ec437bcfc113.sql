-- Guarda quais painéis do dashboard cada usuário deixou visíveis e em que
-- ordem, pra reaparecer do jeito que a pessoa personalizou (manualmente ou
-- pelo assistente) em vez de sempre voltar pro padrão. Null = padrão (todos
-- os painéis, na ordem original).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_widgets jsonb;
