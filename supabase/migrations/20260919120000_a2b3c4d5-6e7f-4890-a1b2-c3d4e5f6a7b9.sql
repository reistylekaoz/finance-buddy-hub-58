-- Duplicava por engano a criação de bank_connections já feita em
-- 20260918125656_2d8bcd94-7997-42e5-8993-059f21fae395.sql. Envolvida num
-- guard: só executa se bank_connections ainda não existir.
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'bank_connections'
  ) then
    CREATE TABLE public.bank_connections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      provider text NOT NULL DEFAULT 'pluggy',
      pluggy_item_id text NOT NULL,
      connector_name text,
      status text NOT NULL DEFAULT 'connecting' CHECK (status IN ('connecting', 'updating', 'updated', 'login_error', 'outdated', 'error')),
      status_detail text,
      last_synced_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, pluggy_item_id)
    );
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections TO authenticated;
    GRANT ALL ON public.bank_connections TO service_role;
    ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "bank_connections_select_own" ON public.bank_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "bank_connections_insert_own" ON public.bank_connections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "bank_connections_update_own" ON public.bank_connections FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "bank_connections_delete_own" ON public.bank_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);
    CREATE INDEX bank_connections_user_id_idx ON public.bank_connections(user_id);
    CREATE TRIGGER bank_connections_set_updated_at BEFORE UPDATE ON public.bank_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    ALTER TABLE public.accounts
      ADD COLUMN IF NOT EXISTS bank_connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS pluggy_account_id text;
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_pluggy_account_id_idx ON public.accounts(pluggy_account_id) WHERE pluggy_account_id IS NOT NULL;

    ALTER TABLE public.credit_cards
      ADD COLUMN IF NOT EXISTS bank_connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS pluggy_account_id text;
    CREATE UNIQUE INDEX IF NOT EXISTS credit_cards_pluggy_account_id_idx ON public.credit_cards(pluggy_account_id) WHERE pluggy_account_id IS NOT NULL;
  end if;
end
$$;
