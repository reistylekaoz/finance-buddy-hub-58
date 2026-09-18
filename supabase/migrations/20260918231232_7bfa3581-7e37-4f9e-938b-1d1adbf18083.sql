-- Migração 1: dados da conta na instituição (card de integração bancária)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS branch_number text,
  ADD COLUMN IF NOT EXISTS account_number text;

-- Migração 2: notificação diária via Telegram
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_username text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_chat_id_key
  ON public.profiles (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_id text NOT NULL,
  transaction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  card_transaction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.telegram_digests TO authenticated;
GRANT ALL ON public.telegram_digests TO service_role;

ALTER TABLE public.telegram_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_digests_select_own" ON public.telegram_digests;
DROP POLICY IF EXISTS "telegram_digests_insert_own" ON public.telegram_digests;
DROP POLICY IF EXISTS "telegram_digests_update_own" ON public.telegram_digests;
CREATE POLICY "telegram_digests_select_own" ON public.telegram_digests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "telegram_digests_insert_own" ON public.telegram_digests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "telegram_digests_update_own" ON public.telegram_digests FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS telegram_digests_chat_sent_idx
  ON public.telegram_digests (chat_id, sent_at DESC);