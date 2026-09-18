-- Telegram não permite que um bot inicie conversa com alguém (regra
-- anti-spam da plataforma, vale pra qualquer telefone/usuário) — a
-- alternativa real é um link de convite (t.me/<bot>?start=<token>) que a
-- pessoa recebe por qualquer canal e só precisa tocar; o Telegram manda o
-- /start com o token sozinho, sem precisar digitar @usuario nem mandar
-- mensagem manualmente.
ALTER TABLE public.telegram_recipients
  ADD COLUMN link_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX telegram_recipients_link_token_key
  ON public.telegram_recipients (link_token);

ALTER TABLE public.telegram_recipients
  ALTER COLUMN telegram_username DROP NOT NULL;
