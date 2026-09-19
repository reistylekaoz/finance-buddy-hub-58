import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { matchInvestmentRedemptions } from "@/lib/pluggy.functions";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Investment = Database["public"]["Tables"]["investments"]["Row"];
type InvestmentTransaction = Database["public"]["Tables"]["investment_transactions"]["Row"];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

const TYPE_LABELS: Record<string, string> = {
  COE: "COE",
  EQUITY: "Ações",
  ETF: "ETF",
  FIXED_INCOME: "Renda fixa",
  MUTUAL_FUND: "Fundo de investimento",
  SECURITY: "Título",
  OTHER: "Outro",
};
const TYPE_OPTIONS = Object.entries(TYPE_LABELS);

const MOVEMENT_LABELS: Record<string, string> = {
  BUY: "Aplicação",
  SELL: "Resgate",
  TAX: "Imposto",
  TRANSFER: "Transferência",
  INTEREST: "Rendimento",
  AMORTIZATION: "Amortização",
};
const MOVEMENT_OPTIONS = Object.entries(MOVEMENT_LABELS);

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function movementLabel(type: string): string {
  return MOVEMENT_LABELS[type] ?? type;
}

// Investimentos e movimentações trazidos pela Pluggy sempre têm o id
// externo preenchido; os lançados manualmente, não — é isso que decide se
// mostra os botões de editar/excluir (dado sincronizado é sobrescrito no
// próximo sync, não faz sentido editar por aqui).
function isManualInvestment(investment: Investment): boolean {
  return !investment.pluggy_investment_id;
}
function isManualMovement(tx: InvestmentTransaction): boolean {
  return !tx.external_id;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const cents = Math.round(Math.abs(Number(value || 0)) * 100);
  const display = (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <Input
      required
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        onChange(((digits ? parseInt(digits, 10) : 0) / 100).toFixed(2));
      }}
    />
  );
}

type InvestmentFormState = {
  name: string;
  investment_type: string;
  investment_subtype: string;
  balance: string;
  amount_original: string;
};
const emptyInvestmentForm = (): InvestmentFormState => ({
  name: "",
  investment_type: "FIXED_INCOME",
  investment_subtype: "",
  balance: "0.00",
  amount_original: "",
});

type MovementFormState = {
  movement_type: string;
  amount: string;
  quantity: string;
  trade_date: string;
  description: string;
};
const emptyMovementForm = (): MovementFormState => ({
  movement_type: "BUY",
  amount: "0.00",
  quantity: "",
  trade_date: new Date().toISOString().slice(0, 10),
  description: "",
});

export function Investments() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investmentTransactions, setInvestmentTransactions] = useState<InvestmentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const [investmentModalOpen, setInvestmentModalOpen] = useState(false);
  const [editingInvestmentId, setEditingInvestmentId] = useState<string | null>(null);
  const [investmentForm, setInvestmentForm] = useState<InvestmentFormState>(emptyInvestmentForm());
  const [savingInvestment, setSavingInvestment] = useState(false);

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementInvestmentId, setMovementInvestmentId] = useState<string | null>(null);
  const [movementForm, setMovementForm] = useState<MovementFormState>(emptyMovementForm());
  const [savingMovement, setSavingMovement] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<{
    type: "investment" | "movement";
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [investmentRows, txRows] = await Promise.all([
      supabase.from("investments").select("*").order("name"),
      supabase
        .from("investment_transactions")
        .select("*")
        .order("trade_date", { ascending: false }),
    ]);
    setInvestments(investmentRows.data ?? []);
    setInvestmentTransactions(txRows.data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const txByInvestment = useMemo(() => {
    const map = new Map<string, InvestmentTransaction[]>();
    for (const tx of investmentTransactions) {
      const list = map.get(tx.investment_id) ?? [];
      list.push(tx);
      map.set(tx.investment_id, list);
    }
    return map;
  }, [investmentTransactions]);

  function toggleOpen(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openNewInvestment() {
    setEditingInvestmentId(null);
    setInvestmentForm(emptyInvestmentForm());
    setInvestmentModalOpen(true);
  }
  function openEditInvestment(investment: Investment) {
    setEditingInvestmentId(investment.id);
    setInvestmentForm({
      name: investment.name,
      investment_type: investment.investment_type,
      investment_subtype: investment.investment_subtype ?? "",
      balance: String(investment.balance),
      amount_original:
        investment.amount_original !== null ? String(investment.amount_original) : "",
    });
    setInvestmentModalOpen(true);
  }
  async function saveInvestment(e: React.FormEvent) {
    e.preventDefault();
    setSavingInvestment(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setSavingInvestment(false);
      return;
    }
    const balance = Number(investmentForm.balance || 0);
    const amountOriginal = investmentForm.amount_original
      ? Number(investmentForm.amount_original)
      : null;
    const payload = {
      user_id: userId,
      name: investmentForm.name,
      investment_type: investmentForm.investment_type,
      investment_subtype: investmentForm.investment_subtype || null,
      balance,
      amount_original: amountOriginal,
      amount_profit: amountOriginal !== null ? balance - amountOriginal : null,
    };
    const result = editingInvestmentId
      ? await supabase.from("investments").update(payload).eq("id", editingInvestmentId)
      : await supabase.from("investments").insert(payload);
    setSavingInvestment(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(editingInvestmentId ? "Investimento atualizado." : "Investimento criado.");
    setInvestmentModalOpen(false);
    await load();
  }

  function openNewMovement(investmentId: string) {
    setMovementInvestmentId(investmentId);
    setMovementForm(emptyMovementForm());
    setMovementModalOpen(true);
  }
  async function saveMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!movementInvestmentId) return;
    setSavingMovement(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setSavingMovement(false);
      return;
    }
    const { error } = await supabase.from("investment_transactions").insert({
      user_id: userId,
      investment_id: movementInvestmentId,
      movement_type: movementForm.movement_type,
      amount: Number(movementForm.amount || 0),
      quantity: movementForm.quantity ? Number(movementForm.quantity) : null,
      trade_date: movementForm.trade_date,
      description: movementForm.description || null,
    });
    if (error) {
      setSavingMovement(false);
      toast.error(error.message);
      return;
    }
    // Um resgate lançado manualmente também tenta casar com um lançamento de
    // receita "solto" numa conta, igual ao resgate trazido pela Pluggy.
    if (movementForm.movement_type === "SELL") {
      try {
        await matchInvestmentRedemptions(supabase, userId);
      } catch {
        // Casamento é um extra — não bloqueia o lançamento da movimentação.
      }
    }
    setSavingMovement(false);
    toast.success("Movimentação lançada.");
    setMovementModalOpen(false);
    await load();
  }

  function confirmDeleteInvestment(investment: Investment) {
    setPendingDelete({ type: "investment", id: investment.id, label: investment.name });
  }
  function confirmDeleteMovement(tx: InvestmentTransaction) {
    setPendingDelete({
      type: "movement",
      id: tx.id,
      label: tx.description || movementLabel(tx.movement_type),
    });
  }
  async function performDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const table = pendingDelete.type === "investment" ? "investments" : "investment_transactions";
    const { error } = await supabase.from(table).delete().eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      pendingDelete.type === "investment" ? "Investimento excluído." : "Movimentação excluída.",
    );
    setPendingDelete(null);
    await load();
  }

  const totalBalance = investments.reduce((sum, i) => sum + Number(i.balance), 0);
  const totalProfit = investments.reduce((sum, i) => sum + Number(i.amount_profit ?? 0), 0);

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando investimentos…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openNewInvestment}>
          <Plus />
          Novo investimento
        </Button>
      </div>
      {!investments.length ? (
        <div className="grid min-h-[30vh] place-items-center px-6 text-center">
          <div className="max-w-sm space-y-2">
            <TrendingUp className="mx-auto size-8 text-muted-foreground" />
            <h2 className="font-semibold">Nenhum investimento ainda</h2>
            <p className="text-sm text-muted-foreground">
              Investimentos aparecem aqui automaticamente ao conectar um banco ou corretora que os
              traga pela Pluggy, em Conexões bancárias — ou lance um manualmente com o botão acima.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total investido</p>
              <p className="mt-1 font-mono text-xl tabular-nums">{money.format(totalBalance)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Rendimento acumulado</p>
              <p className="mt-1 font-mono text-xl tabular-nums">{money.format(totalProfit)}</p>
            </div>
          </div>
          <div className="space-y-3">
            {investments.map((investment) => {
              const open = openIds.has(investment.id);
              const manual = isManualInvestment(investment);
              const sorted = [...(txByInvestment.get(investment.id) ?? [])].sort((a, b) =>
                a.trade_date < b.trade_date ? 1 : -1,
              );
              return (
                <div key={investment.id} className="rounded-lg border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-3 p-5">
                    <button
                      type="button"
                      onClick={() => toggleOpen(investment.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                          {investment.investment_subtype
                            ? ` · ${investment.investment_subtype}`
                            : ""}
                        </p>
                      </div>
                    </button>
                    <div className="text-right">
                      <p className="font-mono tabular-nums">
                        {money.format(Number(investment.balance))}
                      </p>
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
                    {manual ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar investimento"
                          onClick={() => openEditInvestment(investment)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir investimento"
                          onClick={() => confirmDeleteInvestment(investment)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Sincronizado
                      </span>
                    )}
                  </div>
                  {open && (
                    <div className="space-y-3 border-t border-border px-5 py-3">
                      {sorted.length ? (
                        <div className="space-y-2">
                          {sorted.map((tx) => (
                            <div
                              key={tx.id}
                              className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate">
                                  {tx.description || movementLabel(tx.movement_type)}
                                </p>
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
                              {isManualMovement(tx) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Excluir movimentação"
                                  onClick={() => confirmDeleteMovement(tx)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-2 text-center text-xs text-muted-foreground">
                          Nenhuma movimentação ainda.
                        </p>
                      )}
                      {manual && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openNewMovement(investment.id)}
                        >
                          <Plus />
                          Nova movimentação
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={investmentModalOpen} onOpenChange={setInvestmentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingInvestmentId ? "Editar investimento" : "Novo investimento"}
            </DialogTitle>
            <DialogDescription>
              Para investimentos que não vêm automaticamente por um banco ou corretora conectada.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveInvestment} className="space-y-4">
            <Field label="Nome">
              <Input
                required
                value={investmentForm.name}
                onChange={(e) => setInvestmentForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Tesouro Selic 2029"
              />
            </Field>
            <Field label="Tipo">
              <select
                className={selectClass}
                value={investmentForm.investment_type}
                onChange={(e) =>
                  setInvestmentForm((f) => ({ ...f, investment_type: e.target.value }))
                }
              >
                {TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subtipo (opcional)">
              <Input
                value={investmentForm.investment_subtype}
                onChange={(e) =>
                  setInvestmentForm((f) => ({ ...f, investment_subtype: e.target.value }))
                }
                placeholder="Ex.: CDB, LCI, Multimercado…"
              />
            </Field>
            <Field label="Saldo atual">
              <CurrencyInput
                value={investmentForm.balance}
                onChange={(v) => setInvestmentForm((f) => ({ ...f, balance: v }))}
              />
            </Field>
            <Field label="Valor total aplicado (opcional)">
              <Input
                type="text"
                inputMode="numeric"
                value={investmentForm.amount_original}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setInvestmentForm((f) => ({
                    ...f,
                    amount_original: digits ? (parseInt(digits, 10) / 100).toFixed(2) : "",
                  }));
                }}
                placeholder="Usado só para calcular o rendimento acumulado"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              O saldo não é calculado a partir das movimentações — atualize-o aqui sempre que ele
              mudar.
            </p>
            <Button type="submit" className="w-full" disabled={savingInvestment}>
              {savingInvestment ? <Loader2 className="animate-spin" /> : null}
              {editingInvestmentId ? "Salvar" : "Criar investimento"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={movementModalOpen} onOpenChange={setMovementModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova movimentação</DialogTitle>
            <DialogDescription>
              Registra uma aplicação, resgate ou outro movimento nesse investimento.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveMovement} className="space-y-4">
            <Field label="Tipo">
              <select
                className={selectClass}
                value={movementForm.movement_type}
                onChange={(e) => setMovementForm((f) => ({ ...f, movement_type: e.target.value }))}
              >
                {MOVEMENT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor">
              <CurrencyInput
                value={movementForm.amount}
                onChange={(v) => setMovementForm((f) => ({ ...f, amount: v }))}
              />
            </Field>
            <Field label="Data">
              <Input
                required
                type="date"
                value={movementForm.trade_date}
                onChange={(e) => setMovementForm((f) => ({ ...f, trade_date: e.target.value }))}
              />
            </Field>
            <Field label="Descrição (opcional)">
              <Input
                value={movementForm.description}
                onChange={(e) => setMovementForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            {movementForm.movement_type === "SELL" && (
              <p className="text-xs text-muted-foreground">
                Se houver um lançamento de receita sem categoria com o mesmo valor em até 5 dias,
                ele é identificado e categorizado como resgate automaticamente.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={savingMovement}>
              {savingMovement ? <Loader2 className="animate-spin" /> : null}
              Lançar movimentação
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {pendingDelete?.type === "investment" ? "investimento" : "movimentação"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === "investment"
                ? `"${pendingDelete?.label}" e todas as suas movimentações serão excluídos permanentemente.`
                : `A movimentação "${pendingDelete?.label}" será excluída permanentemente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={() => void performDelete()}>
              {deleting ? <Loader2 className="animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
