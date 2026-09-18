-- Provisões: lançamentos de receita/despesa previstos, ainda não executados.
-- Não afetam o saldo (calculado no app apenas sobre status = 'confirmed') até
-- serem confirmados com data e valor efetivos.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'provisioned'));

CREATE INDEX IF NOT EXISTS transactions_status_idx ON public.transactions (status);
