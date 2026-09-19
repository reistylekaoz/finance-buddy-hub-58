ALTER TABLE public.telegram_recipients
  ADD COLUMN IF NOT EXISTS link_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS telegram_recipients_link_token_key
  ON public.telegram_recipients (link_token);

ALTER TABLE public.telegram_recipients
  ALTER COLUMN telegram_username DROP NOT NULL;
