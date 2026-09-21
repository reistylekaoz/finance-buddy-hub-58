import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PeriodType =
  "fixed" | "weekly" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "semiannual" | "annual";

export const PERIOD_LABELS: Record<PeriodType, string> = {
  fixed: "Data final fixa",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};
export const PERIOD_OPTIONS = Object.entries(PERIOD_LABELS) as [PeriodType, string][];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function parseIsoDate(iso: string): Date {
  const parts = iso.split("-").map(Number);
  return new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1));
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
function addMonthsUtc(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}
function advance(d: Date, type: Exclude<PeriodType, "fixed">): Date {
  switch (type) {
    case "weekly":
      return addDays(d, 7);
    case "biweekly":
      return addDays(d, 14);
    case "monthly":
      return addMonthsUtc(d, 1);
    case "bimonthly":
      return addMonthsUtc(d, 2);
    case "quarterly":
      return addMonthsUtc(d, 3);
    case "semiannual":
      return addMonthsUtc(d, 6);
    case "annual":
      return addMonthsUtc(d, 12);
  }
}

// Orçamento recorrente não tem um end_date salvo — a janela "atual" é
// recalculada a partir da data de início (âncora), avançando período a
// período até achar a janela que contém "agora". Orçamento de data final
// fixa usa exatamente o intervalo cadastrado, mesmo depois de encerrado
// (currentBudgetPeriod não decide se está ativo, só qual é a janela).
export function currentBudgetPeriod(
  periodType: PeriodType,
  startDate: string,
  endDate: string | null,
  now: Date = new Date(),
): { start: string; end: string } {
  if (periodType === "fixed") {
    return { start: startDate, end: endDate ?? startDate };
  }
  let periodStart = parseIsoDate(startDate);
  let periodEnd = addDays(advance(periodStart, periodType), -1);
  let guard = 0;
  while (toIsoDate(periodEnd) < toIsoDate(now) && guard < 5000) {
    periodStart = advance(periodStart, periodType);
    periodEnd = addDays(advance(periodStart, periodType), -1);
    guard += 1;
  }
  return { start: toIsoDate(periodStart), end: toIsoDate(periodEnd) };
}

type BudgetScope = {
  category_id: string | null;
  cost_center_id: string | null;
};

// Soma dos lançamentos bancários (só despesa confirmada) + de cartão de
// crédito dentro da janela do período, batendo com a categoria OU o centro
// de custo do orçamento. Usado tanto na tela (cliente) quanto no disparo de
// alertas (cron, com supabaseAdmin) — mesma assinatura de cliente Supabase
// nos dois casos.
export async function budgetSpent(
  supabase: SupabaseClient<Database>,
  userId: string,
  scope: BudgetScope,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  let bankQuery = supabase
    .from("transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("transaction_type", "expense")
    .eq("status", "confirmed")
    .gte("transaction_date", periodStart)
    .lte("transaction_date", periodEnd);
  let cardQuery = supabase
    .from("credit_card_transactions")
    .select("amount")
    .eq("user_id", userId)
    .gte("purchase_date", periodStart)
    .lte("purchase_date", periodEnd);

  if (scope.category_id) {
    bankQuery = bankQuery.eq("category_id", scope.category_id);
    cardQuery = cardQuery.eq("category_id", scope.category_id);
  } else if (scope.cost_center_id) {
    bankQuery = bankQuery.eq("cost_center_id", scope.cost_center_id);
    cardQuery = cardQuery.eq("cost_center_id", scope.cost_center_id);
  } else {
    return 0;
  }

  const [{ data: bankRows }, { data: cardRows }] = await Promise.all([bankQuery, cardQuery]);
  const bankTotal = (bankRows ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const cardTotal = (cardRows ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  return bankTotal + cardTotal;
}
