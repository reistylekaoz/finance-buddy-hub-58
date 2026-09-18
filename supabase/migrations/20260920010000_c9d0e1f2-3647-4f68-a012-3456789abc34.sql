-- Generaliza a notificação do Telegram de "1 usuário = 1 chat" para
-- múltiplos destinatários por conta Fluxora, cada um com sua própria
-- frequência (diária/semanal/mensal) e escopo de contas/cartões.
CREATE TABLE public.telegram_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Eu',
  telegram_username text NOT NULL,
  telegram_chat_id text,
  notify_daily boolean NOT NULL DEFAULT true,
  notify_weekly boolean NOT NULL DEFAULT false,
  notify_monthly boolean NOT NULL DEFAULT false,
  all_accounts boolean NOT NULL DEFAULT true,
  account_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  card_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_recipients_select_own" ON public.telegram_recipients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "telegram_recipients_insert_own" ON public.telegram_recipients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "telegram_recipients_update_own" ON public.telegram_recipients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "telegram_recipients_delete_own" ON public.telegram_recipients FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE UNIQUE INDEX telegram_recipients_chat_id_key
  ON public.telegram_recipients (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- Migra quem já estava vinculado (profiles.telegram_*) para um primeiro
-- destinatário "Eu", com o mesmo comportamento de antes (diário, todas as
-- contas), pra não perder o vínculo que já funciona.
INSERT INTO public.telegram_recipients (user_id, label, telegram_username, telegram_chat_id)
SELECT id, 'Eu', telegram_username, telegram_chat_id
FROM public.profiles
WHERE telegram_username IS NOT NULL;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS telegram_username,
  DROP COLUMN IF EXISTS telegram_chat_id;

-- Cada resumo diário/semanal/mensal agora pertence a um destinatário
-- específico, não a "o" chat do usuário.
ALTER TABLE public.telegram_digests
  ADD COLUMN recipient_id uuid REFERENCES public.telegram_recipients(id) ON DELETE CASCADE;

CREATE INDEX telegram_digests_recipient_sent_idx
  ON public.telegram_digests (recipient_id, sent_at DESC);
