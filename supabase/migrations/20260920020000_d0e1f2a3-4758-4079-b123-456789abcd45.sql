-- Telegram não permite que um bot inicie conversa com alguém (regra
-- anti-spam da plataforma, vale pra qualquer telefone/usuário) — a
-- alternativa real é um link de convite (t.me/<bot>?start=<token>) que a
-- pessoa recebe por qualquer canal e só precisa tocar; o Telegram manda o
-- /start com o token sozinho, sem precisar digitar @usuario nem mandar
-- mensagem manualmente.
--
-- (Duplicava 20260919000600_00929bf7-ea30-4bae-864a-0d5ae52f0933.sql — os
-- IF NOT EXISTS abaixo fazem essa repetição virar um no-op em vez de
-- quebrar com "column already exists".)
ALTER TABLE public.telegram_recipients
  ADD COLUMN IF NOT EXISTS link_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS telegram_recipients_link_token_key
  ON public.telegram_recipients (link_token);

ALTER TABLE public.telegram_recipients
  ALTER COLUMN telegram_username DROP NOT NULL;
