-- Marca lançamentos vindos da integração bancária como "revisados" depois
-- que o usuário passa por eles na tela de conciliação — precisa de uma
-- coluna própria porque category_id IS NULL por si só não distingue "ainda
-- não revisado" de "revisado e deixado sem categoria de propósito".
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.credit_card_transactions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
