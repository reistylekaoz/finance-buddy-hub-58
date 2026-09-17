import { createServerFn } from "@tanstack/react-start";

export type RateResult = { date: string; rates: Record<string, number> };

const PAIRS = ["EUR-BRL", "USD-BRL"] as const;

/** Cotações de fechamento do dia anterior (D-1), em reais por unidade da moeda. */
export const getDailyRates = createServerFn({ method: "GET" }).handler(
  async (): Promise<RateResult> => {
    const rates: Record<string, number> = { BRL: 1 };
    let date = "";
    for (const pair of PAIRS) {
      try {
        const response = await fetch(`https://economia.awesomeapi.com.br/json/daily/${pair}/2`);
        if (!response.ok) continue;
        const rows = (await response.json()) as Array<{ bid?: string; timestamp?: string }>;
        const row = rows[1] ?? rows[0];
        const bid = Number(row?.bid);
        if (!row || !Number.isFinite(bid) || bid <= 0) continue;
        rates[pair.slice(0, 3)] = bid;
        if (row.timestamp) {
          const stamp = new Date(Number(row.timestamp) * 1000);
          if (!Number.isNaN(stamp.getTime())) date = stamp.toISOString().slice(0, 10);
        }
      } catch {
        // mantém apenas as moedas que responderam
      }
    }
    return { date, rates };
  },
);
