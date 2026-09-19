import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Investment = Database["public"]["Tables"]["investments"]["Row"];
type InvestmentTransaction = Database["public"]["Tables"]["investment_transactions"]["Row"];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const TYPE_LABELS: Record<string, string> = {
  COE: "COE",
  EQUITY: "Ações",
  ETF: "ETF",
  FIXED_INCOME: "Renda fixa",
  MUTUAL_FUND: "Fundo de investimento",
  SECURITY: "Título",
  OTHER: "Outro",
};

const MOVEMENT_LABELS: Record<string, string> = {
  BUY: "Aplicação",
  SELL: "Resgate",
  TAX: "Imposto",
  TRANSFER: "Transferência",
  INTEREST: "Rendimento",
  AMORTIZATION: "Amortização",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function movementLabel(type: string): string {
  return MOVEMENT_LABELS[type] ?? type;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums">{money.format(value)}</p>
    </div>
  );
}

function InvestmentCard({
  investment,
  transactions,
}: {
  investment: Investment;
  transactions: InvestmentTransaction[];
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => [...transactions].sort((a, b) => (a.trade_date < b.trade_date ? 1 : -1)),
    [transactions],
  );
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3 p-5 text-left"
      >
        {open ? (
          <ChevronDown className="size-4 flex-none text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 flex-none text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{investment.name}</p>
          <p className="text-xs text-muted-foreground">
            {typeLabel(investment.investment_type)}
            {investment.investment_subtype ? ` · ${investment.investment_subtype}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono tabular-nums">{money.format(Number(investment.balance))}</p>
          {investment.amount_profit !== null && (
            <p
              className={cn(
                "text-xs",
                Number(investment.amount_profit) >= 0 ? "text-income" : "text-expense",
              )}
            >
              {Number(investment.amount_profit) >= 0 ? "+" : ""}
              {money.format(Number(investment.amount_profit))} de rendimento
            </p>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-5 py-3">
          {sorted.length ? (
            <div className="space-y-2">
              {sorted.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{tx.description || movementLabel(tx.movement_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.trade_date.split("-").reverse().join("/")} ·{" "}
                      {movementLabel(tx.movement_type)}
                      {tx.matched_transaction_id && (
                        <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary">
                          Resgate identificado na conta
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      tx.movement_type === "SELL" || tx.movement_type === "INTEREST"
                        ? "text-income"
                        : "text-foreground",
                    )}
                  >
                    {money.format(Number(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhuma movimentação trazida pela Pluggy ainda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function Investments({
  investments,
  investmentTransactions,
}: {
  investments: Investment[];
  investmentTransactions: InvestmentTransaction[];
}) {
  const totalBalance = investments.reduce((sum, i) => sum + Number(i.balance), 0);
  const totalProfit = investments.reduce((sum, i) => sum + Number(i.amount_profit ?? 0), 0);
  const txByInvestment = useMemo(() => {
    const map = new Map<string, InvestmentTransaction[]>();
    for (const tx of investmentTransactions) {
      const list = map.get(tx.investment_id) ?? [];
      list.push(tx);
      map.set(tx.investment_id, list);
    }
    return map;
  }, [investmentTransactions]);

  if (!investments.length) {
    return (
      <div className="grid min-h-[40vh] place-items-center px-6 text-center">
        <div className="max-w-sm space-y-2">
          <TrendingUp className="mx-auto size-8 text-muted-foreground" />
          <h2 className="font-semibold">Nenhum investimento encontrado</h2>
          <p className="text-sm text-muted-foreground">
            Investimentos aparecem aqui automaticamente depois de conectar um banco ou corretora que
            os traga pela Pluggy, em Conexões bancárias. Nem todo conector expõe investimentos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Total investido" value={totalBalance} />
        <Metric label="Rendimento acumulado" value={totalProfit} />
      </div>
      <div className="space-y-3">
        {investments.map((investment) => (
          <InvestmentCard
            key={investment.id}
            investment={investment}
            transactions={txByInvestment.get(investment.id) ?? []}
          />
        ))}
      </div>
    </div>
  );
}
