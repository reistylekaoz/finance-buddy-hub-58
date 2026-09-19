import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RateResult = { date: string; rates: Record<string, number> };

const PAIRS = ["EUR-BRL", "USD-BRL"] as const;
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

async function fetchLiveRate(pair: string): Promise<{ bid: number; date: string } | null> {
  try {
    const response = await fetch(`https://economia.awesomeapi.com.br/json/daily/${pair}/2`);
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ bid?: string; timestamp?: string }>;
    const row = rows[1] ?? rows[0];
    const bid = Number(row?.bid);
    if (!row || !Number.isFinite(bid) || bid <= 0) return null;
    let date = "";
    if (row.timestamp) {
      const stamp = new Date(Number(row.timestamp) * 1000);
      if (!Number.isNaN(stamp.getTime())) date = stamp.toISOString().slice(0, 10);
    }
    return { bid, date };
  } catch {
    return null;
  }
}

// Cotações de fechamento do dia anterior (D-1), em reais por unidade da
// moeda. Guardadas em exchange_rates com a hora da busca: só volta na API
// externa quando o registro tiver mais de 12h (ou não existir ainda) — o
// resto do tempo usa o que já está no banco, sem depender da API estar no
// ar a cada carregamento do dashboard.
export async function getCachedDailyRates(): Promise<RateResult> {
  const rates: Record<string, number> = { BRL: 1 };
  let date = "";

  const { data: cachedRows } = await supabaseAdmin.from("exchange_rates").select("*");
  const cached = new Map((cachedRows ?? []).map((row) => [row.currency, row]));

  for (const pair of PAIRS) {
    const currency = pair.slice(0, 3);
    const cachedRow = cached.get(currency);
    const isFresh =
      !!cachedRow && Date.now() - new Date(cachedRow.fetched_at).getTime() < STALE_AFTER_MS;
    if (isFresh) {
      rates[currency] = Number(cachedRow.rate_to_brl);
      date = date || cachedRow.rate_date || "";
      continue;
    }

    const live = await fetchLiveRate(pair);
    if (live) {
      rates[currency] = live.bid;
      date = date || live.date;
      await supabaseAdmin.from("exchange_rates").upsert({
        currency,
        rate_to_brl: live.bid,
        rate_date: live.date || null,
        fetched_at: new Date().toISOString(),
      });
    } else if (cachedRow) {
      // API externa fora do ar: melhor mostrar a última cotação salva
      // (ainda que desatualizada) do que sumir com a conversão.
      rates[currency] = Number(cachedRow.rate_to_brl);
      date = date || cachedRow.rate_date || "";
    }
  }

  return { date, rates };
}
