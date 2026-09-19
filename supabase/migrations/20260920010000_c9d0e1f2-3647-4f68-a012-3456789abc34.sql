-- Duplicava por engano a criação de telegram_recipients já feita em
-- 20260918234729_2a4d99fa-d50a-4ed6-9890-83ce46b914cf.sql — inclusive a
-- migração de dados de profiles.telegram_username/telegram_chat_id e o
-- DROP dessas colunas. Sem o guard, rodar as duas em sequência não só
-- falha em "relation already exists": se alguém "corrigisse" só o CREATE
-- TABLE com IF NOT EXISTS, o INSERT ... SELECT logo abaixo ainda quebraria
-- com "column does not exist", porque a primeira migração já apagou
-- profiles.telegram_username/telegram_chat_id. Por isso o corpo inteiro
-- (inclusive a migração de dados) só roda se telegram_recipients ainda
-- não existir.
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'telegram_recipients'
  ) then
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

    GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_recipients TO authenticated;
    GRANT ALL ON public.telegram_recipients TO service_role;

    ALTER TABLE public.telegram_recipients ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "telegram_recipients_select_own" ON public.telegram_recipients FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "telegram_recipients_insert_own" ON public.telegram_recipients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "telegram_recipients_update_own" ON public.telegram_recipients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "telegram_recipients_delete_own" ON public.telegram_recipients FOR DELETE TO authenticated USING (auth.uid() = user_id);

    CREATE UNIQUE INDEX telegram_recipients_chat_id_key
      ON public.telegram_recipients (telegram_chat_id)
      WHERE telegram_chat_id IS NOT NULL;

    -- Migra quem já estava vinculado (profiles.telegram_*) para um primeiro
    -- destinatário "Eu", só se as colunas antigas ainda existirem (podem já
    -- ter sido migradas e removidas por essa mesma lógica antes).
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'telegram_username'
    ) then
      INSERT INTO public.telegram_recipients (user_id, label, telegram_username, telegram_chat_id)
      SELECT id, 'Eu', telegram_username, telegram_chat_id
      FROM public.profiles
      WHERE telegram_username IS NOT NULL;

      ALTER TABLE public.profiles
        DROP COLUMN IF EXISTS telegram_username,
        DROP COLUMN IF EXISTS telegram_chat_id;
    end if;

    ALTER TABLE public.telegram_digests
      ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.telegram_recipients(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS telegram_digests_recipient_sent_idx
      ON public.telegram_digests (recipient_id, sent_at DESC);
  end if;
end
$$;
