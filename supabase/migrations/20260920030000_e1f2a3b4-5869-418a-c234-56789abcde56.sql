-- Duplicava por engano a criação de exchange_rates já feita em
-- 20260919002331_c9247bde-1f32-412f-9f58-d076c6307493.sql. Envolvida num
-- guard: só executa se exchange_rates ainda não existir.
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'exchange_rates'
  ) then
    CREATE TABLE public.exchange_rates (
      currency text PRIMARY KEY,
      rate_to_brl numeric NOT NULL,
      rate_date text,
      fetched_at timestamptz NOT NULL DEFAULT now()
    );

    GRANT SELECT ON public.exchange_rates TO authenticated;
    GRANT ALL ON public.exchange_rates TO service_role;

    ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "exchange_rates_select_authenticated" ON public.exchange_rates FOR SELECT TO authenticated USING (true);
  end if;
end
$$;
