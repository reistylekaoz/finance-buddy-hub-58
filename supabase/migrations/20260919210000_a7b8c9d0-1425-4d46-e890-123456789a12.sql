-- Dados da conta na instituição, para exibir no card de integração bancária
-- (instituição, agência, conta e portador) em vez de só o nome do conector
-- (ex.: "MeuPluggy", que é o agregador, não o banco). Preenchidos pelo sync
-- a partir da Pluggy; ficam vazios para contas manuais.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS branch_number text,
  ADD COLUMN IF NOT EXISTS account_number text;
