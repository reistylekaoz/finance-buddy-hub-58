import { createServerFn } from "@tanstack/react-start";

export type RateResult = { date: string; rates: Record<string, number> };

export const getDailyRates = createServerFn({ method: "GET" }).handler(
  async (): Promise<RateResult> => {
    const { getCachedDailyRates } = await import("@/lib/rates.server");
    return getCachedDailyRates();
  },
);
