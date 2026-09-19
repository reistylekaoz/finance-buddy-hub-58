-- Duplicava por engano a criação de support_tickets já feita em
-- 20260918155231_84814987-eaad-4b08-880e-c34fbff2b96a.sql. Envolvida num
-- guard: só executa se support_tickets ainda não existir.
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'support_tickets'
  ) then
    CREATE TABLE public.support_tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      source text NOT NULL DEFAULT 'bank_sync',
      title text NOT NULL,
      description text,
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
      bank_connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
    GRANT ALL ON public.support_tickets TO service_role;
    ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "support_tickets_select_own" ON public.support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "support_tickets_insert_own" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "support_tickets_update_own" ON public.support_tickets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    CREATE INDEX support_tickets_user_id_idx ON public.support_tickets(user_id);
    CREATE TRIGGER support_tickets_set_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  end if;
end
$$;
