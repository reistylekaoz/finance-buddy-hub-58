-- Cache da cotação EUR/USD -> BRL: antes o app buscava direto na API
-- externa a cada carregamento e, se ela falhasse ou não respondesse a
-- tempo, a conversão simplesmente sumia do saldo total. Agora fica
-- guardada com data/hora da última busca; só refaz a consulta externa
-- quando passar de 12h (ou não tiver registro ainda).
CREATE TABLE public.exchange_rates (
  currency text PRIMARY KEY,
  rate_to_brl numeric NOT NULL,
  rate_date text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- Referência global (não por usuário) — qualquer usuário autenticado lê;
-- só o service role (o cron/servidor) grava.
CREATE POLICY "exchange_rates_select_authenticated" ON public.exchange_rates FOR SELECT TO authenticated USING (true);
