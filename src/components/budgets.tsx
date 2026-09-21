import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Pencil, Plus, Target, Trash2 } from "lucide-react";
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
import {
  currentBudgetPeriod,
  budgetSpent,
  PERIOD_OPTIONS,
  PERIOD_LABELS,
  type PeriodType,
} from "@/lib/budget-period";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Budget = Database["public"]["Tables"]["budgets"]["Row"];
type BudgetRecipient = Database["public"]["Tables"]["budget_recipients"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type CostCenter = Database["public"]["Tables"]["cost_centers"]["Row"];
type Account = Database["public"]["Tables"]["accounts"]["Row"];
type CreditCard = Database["public"]["Tables"]["credit_cards"]["Row"];
type TelegramRecipient = Database["public"]["Tables"]["telegram_recipients"]["Row"];

type ScopeType = "category" | "cost_center" | "account" | "card";
const SCOPE_LABELS: Record<ScopeType, string> = {
  category: "Categoria",
  cost_center: "Centro de custo",
  account: "Conta",
  card: "Cartão de crédito",
};
const SCOPE_OPTIONS = Object.entries(SCOPE_LABELS) as [ScopeType, string][];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function br(dateIso: string): string {
  return dateIso.split("-").reverse().join("/");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

type BudgetFormState = {
  name: string;
  scope_type: ScopeType;
  scope_id: string;
  amount: string;
  period_type: PeriodType;
  start_date: string;
  end_date: string;
  alert_daily_report: boolean;
  alert_threshold_enabled: boolean;
  alert_threshold_percent: string;
  alert_exceeded_enabled: boolean;
  recipient_ids: string[];
};
const emptyBudgetForm = (): BudgetFormState => ({
  name: "",
  scope_type: "category",
  scope_id: "",
  amount: "0.00",
  period_type: "monthly",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  alert_daily_report: false,
  alert_threshold_enabled: true,
  alert_threshold_percent: "80",
  alert_exceeded_enabled: true,
  recipient_ids: [],
});

export function Budgets() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetRecipients, setBudgetRecipients] = useState<BudgetRecipient[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [recipients, setRecipients] = useState<TelegramRecipient[]>([]);
  const [spentByBudget, setSpentByBudget] = useState<
    Map<string, { spent: number; start: string; end: string }>
  >(new Map());
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetFormState>(emptyBudgetForm());
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    const [
      budgetRows,
      budgetRecipientRows,
      categoryRows,
      costCenterRows,
      accountRows,
      creditCardRows,
      recipientRows,
    ] = await Promise.all([
      supabase.from("budgets").select("*").order("created_at"),
      supabase.from("budget_recipients").select("*"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("cost_centers").select("*").order("name"),
      supabase.from("accounts").select("*").order("name"),
      supabase.from("credit_cards").select("*").order("name"),
      supabase.from("telegram_recipients").select("*").order("created_at"),
    ]);
    const budgetList = budgetRows.data ?? [];
    setBudgets(budgetList);
    setBudgetRecipients(budgetRecipientRows.data ?? []);
    setCategories(categoryRows.data ?? []);
    setCostCenters(costCenterRows.data ?? []);
    setAccounts(accountRows.data ?? []);
    setCreditCards(creditCardRows.data ?? []);
    setRecipients(recipientRows.data ?? []);

    if (userId && budgetList.length) {
      const entries = await Promise.all(
        budgetList.map(async (b) => {
          const period = currentBudgetPeriod(b.period_type as PeriodType, b.start_date, b.end_date);
          const spent = await budgetSpent(supabase, userId, b, period.start, period.end);
          return [b.id, { spent, ...period }] as const;
        }),
      );
      setSpentByBudget(new Map(entries));
    } else {
      setSpentByBudget(new Map());
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const categoryPath = (id: string | null): string => {
    if (!id) return "";
    const c = categories.find((cat) => cat.id === id);
    if (!c) return "";
    return c.parent_id ? `${categoryPath(c.parent_id)} › ${c.name}` : c.name;
  };
  const costCenterName = (id: string | null): string =>
    costCenters.find((cc) => cc.id === id)?.name ?? "";
  const accountName = (id: string | null): string => accounts.find((a) => a.id === id)?.name ?? "";
  const cardName = (id: string | null): string => creditCards.find((c) => c.id === id)?.name ?? "";

  const recipientsByBudget = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const br of budgetRecipients) {
      const list = map.get(br.budget_id) ?? [];
      list.push(br.recipient_id);
      map.set(br.budget_id, list);
    }
    return map;
  }, [budgetRecipients]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.category_type === "expense"),
    [categories],
  );
  const activeCostCenters = useMemo(() => costCenters.filter((c) => c.is_active), [costCenters]);
  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts]);
  const activeCreditCards = useMemo(() => creditCards.filter((c) => c.is_active), [creditCards]);

  function openNew() {
    setEditingId(null);
    setForm(emptyBudgetForm());
    setModalOpen(true);
  }
  function openEdit(budget: Budget) {
    setEditingId(budget.id);
    const scopeType: ScopeType = budget.category_id
      ? "category"
      : budget.cost_center_id
        ? "cost_center"
        : budget.account_id
          ? "account"
          : "card";
    setForm({
      name: budget.name,
      scope_type: scopeType,
      scope_id:
        budget.category_id ?? budget.cost_center_id ?? budget.account_id ?? budget.card_id ?? "",
      amount: String(budget.amount),
      period_type: budget.period_type as PeriodType,
      start_date: budget.start_date,
      end_date: budget.end_date ?? "",
      alert_daily_report: budget.alert_daily_report,
      alert_threshold_enabled: budget.alert_threshold_enabled,
      alert_threshold_percent:
        budget.alert_threshold_percent !== null ? String(budget.alert_threshold_percent) : "80",
      alert_exceeded_enabled: budget.alert_exceeded_enabled,
      recipient_ids: recipientsByBudget.get(budget.id) ?? [],
    });
    setModalOpen(true);
  }

  function toggleRecipient(id: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      recipient_ids: checked ? [...f.recipient_ids, id] : f.recipient_ids.filter((r) => r !== id),
    }));
  }

  async function saveBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scope_id) {
      toast.error(
        `Selecione ${SCOPE_LABELS[form.scope_type].toLowerCase()} para aplicar o orçamento.`,
      );
      return;
    }
    if (form.period_type === "fixed" && !form.end_date) {
      toast.error("Informe a data final do orçamento.");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setSaving(false);
      return;
    }
    const payload = {
      user_id: userId,
      name: form.name,
      category_id: form.scope_type === "category" ? form.scope_id : null,
      cost_center_id: form.scope_type === "cost_center" ? form.scope_id : null,
      account_id: form.scope_type === "account" ? form.scope_id : null,
      card_id: form.scope_type === "card" ? form.scope_id : null,
      amount: Number(form.amount || 0),
      period_type: form.period_type,
      start_date: form.start_date,
      end_date: form.period_type === "fixed" ? form.end_date : null,
      alert_daily_report: form.alert_daily_report,
      alert_threshold_enabled: form.alert_threshold_enabled,
      alert_threshold_percent: form.alert_threshold_enabled
        ? Number(form.alert_threshold_percent || 0)
        : null,
      alert_exceeded_enabled: form.alert_exceeded_enabled,
    };
    let budgetId: string;
    if (editingId) {
      const { error } = await supabase.from("budgets").update(payload).eq("id", editingId);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
      budgetId = editingId;
    } else {
      const { data, error } = await supabase.from("budgets").insert(payload).select("id").single();
      if (error || !data) {
        setSaving(false);
        toast.error(error?.message ?? "Não foi possível criar o orçamento.");
        return;
      }
      budgetId = data.id;
    }
    // Reconstrói a lista de destinatários do zero — mais simples que calcular
    // o diff, e o volume por orçamento é pequeno.
    await supabase.from("budget_recipients").delete().eq("budget_id", budgetId);
    if (form.recipient_ids.length) {
      const { error: recipientsError } = await supabase.from("budget_recipients").insert(
        form.recipient_ids.map((recipientId) => ({
          user_id: userId,
          budget_id: budgetId,
          recipient_id: recipientId,
        })),
      );
      if (recipientsError) {
        setSaving(false);
        toast.error(recipientsError.message);
        return;
      }
    }
    setSaving(false);
    toast.success(editingId ? "Orçamento atualizado." : "Orçamento criado.");
    setModalOpen(false);
    await load();
  }

  function confirmDelete(budget: Budget) {
    setPendingDelete({ id: budget.id, name: budget.name });
  }
  async function performDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("budgets").delete().eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Orçamento excluído.");
    setPendingDelete(null);
    await load();
  }

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando orçamentos…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openNew}>
          <Plus />
          Novo orçamento
        </Button>
      </div>
      {!budgets.length ? (
        <div className="grid min-h-[30vh] place-items-center px-6 text-center">
          <div className="max-w-sm space-y-2">
            <Target className="mx-auto size-8 text-muted-foreground" />
            <h2 className="font-semibold">Nenhum orçamento ainda</h2>
            <p className="text-sm text-muted-foreground">
              Crie uma meta de orçamento por categoria, centro de custo, conta ou cartão de crédito,
              com período fixo ou recorrente, e configure alertas por Telegram sobre o andamento.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((budget) => {
            const info = spentByBudget.get(budget.id);
            const spent = info?.spent ?? 0;
            const amount = Number(budget.amount);
            const pct = amount > 0 ? Math.min(999, (spent / amount) * 100) : 0;
            const exceeded = spent > amount;
            const nearThreshold =
              !exceeded &&
              budget.alert_threshold_enabled &&
              budget.alert_threshold_percent !== null &&
              pct >= Number(budget.alert_threshold_percent);
            const barColor = exceeded
              ? "bg-expense"
              : nearThreshold
                ? "bg-amber-500"
                : "bg-primary";
            const scopeLabel = budget.category_id
              ? categoryPath(budget.category_id)
              : budget.cost_center_id
                ? costCenterName(budget.cost_center_id)
                : budget.account_id
                  ? accountName(budget.account_id)
                  : cardName(budget.card_id);
            const recipientCount = (recipientsByBudget.get(budget.id) ?? []).length;
            return (
              <div key={budget.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{budget.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {scopeLabel} · {PERIOD_LABELS[budget.period_type as PeriodType]}
                      {info ? ` · ${br(info.start)} a ${br(info.end)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Editar orçamento"
                      onClick={() => openEdit(budget)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir orçamento"
                      onClick={() => confirmDelete(budget)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full transition-all", barColor)}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className={cn("font-mono tabular-nums", exceeded && "text-expense")}>
                      {money.format(spent)} de {money.format(amount)}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        exceeded
                          ? "text-expense"
                          : nearThreshold
                            ? "text-amber-600"
                            : "text-muted-foreground",
                      )}
                    >
                      {pct.toFixed(0)}%{exceeded ? " · estourado" : ""}
                    </span>
                  </div>
                </div>
                {(budget.alert_daily_report ||
                  budget.alert_threshold_enabled ||
                  budget.alert_exceeded_enabled) && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Alertas por Telegram:{" "}
                    {[
                      budget.alert_daily_report && "report diário",
                      budget.alert_threshold_enabled &&
                        `${Number(budget.alert_threshold_percent)}% atingido`,
                      budget.alert_exceeded_enabled && "estourado",
                    ]
                      .filter(Boolean)
                      .join(", ")}{" "}
                    · {recipientCount ? `${recipientCount} destinatário(s)` : "nenhum destinatário"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar orçamento" : "Novo orçamento"}</DialogTitle>
            <DialogDescription>
              Defina uma meta de gasto por categoria, centro de custo, conta ou cartão de crédito e,
              se quiser, alertas por Telegram sobre o andamento.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveBudget} className="space-y-4">
            <Field label="Nome">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Mercado do mês"
              />
            </Field>
            <Field label="Aplicar a">
              <div className="flex flex-wrap gap-4 text-sm">
                {SCOPE_OPTIONS.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="scope_type"
                      checked={form.scope_type === value}
                      onChange={() => setForm((f) => ({ ...f, scope_type: value, scope_id: "" }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={SCOPE_LABELS[form.scope_type]}>
              <select
                required
                className={selectClass}
                value={form.scope_id}
                onChange={(e) => setForm((f) => ({ ...f, scope_id: e.target.value }))}
              >
                <option value="">Selecione…</option>
                {form.scope_type === "category" &&
                  expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryPath(c.id)}
                    </option>
                  ))}
                {form.scope_type === "cost_center" &&
                  activeCostCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                {form.scope_type === "account" &&
                  activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                {form.scope_type === "card" &&
                  activeCreditCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Valor do orçamento">
              <Input
                required
                type="text"
                inputMode="numeric"
                value={(Math.round(Math.abs(Number(form.amount || 0)) * 100) / 100).toLocaleString(
                  "pt-BR",
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setForm((f) => ({
                    ...f,
                    amount: ((digits ? parseInt(digits, 10) : 0) / 100).toFixed(2),
                  }));
                }}
              />
            </Field>
            <Field label="Período">
              <select
                className={selectClass}
                value={form.period_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, period_type: e.target.value as PeriodType }))
                }
              >
                {PERIOD_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={form.period_type === "fixed" ? "Data de início" : "Início (âncora)"}>
              <Input
                required
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </Field>
            {form.period_type === "fixed" ? (
              <Field label="Data final">
                <Input
                  required
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </Field>
            ) : (
              <p className="text-xs text-muted-foreground">
                Períodos recorrentes se renovam automaticamente a partir da data de início — não
                precisa recriar o orçamento a cada {PERIOD_LABELS[form.period_type].toLowerCase()}.
              </p>
            )}

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Alertas por Telegram
              </p>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={form.alert_daily_report}
                  onChange={(e) => setForm((f) => ({ ...f, alert_daily_report: e.target.checked }))}
                />
                Report diário com o andamento
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={form.alert_threshold_enabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, alert_threshold_enabled: e.target.checked }))
                  }
                />
                Avisar ao atingir
                <Input
                  className="h-8 w-20"
                  type="number"
                  min={1}
                  max={100}
                  disabled={!form.alert_threshold_enabled}
                  value={form.alert_threshold_percent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, alert_threshold_percent: e.target.value }))
                  }
                />
                % do orçamento
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={form.alert_exceeded_enabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, alert_exceeded_enabled: e.target.checked }))
                  }
                />
                Avisar quando estourar o orçamento
              </label>
              {(form.alert_daily_report ||
                form.alert_threshold_enabled ||
                form.alert_exceeded_enabled) && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground">Quem recebe</p>
                  {recipients.length ? (
                    <div className="mt-1.5 grid gap-1.5">
                      {recipients.map((r) => (
                        <label key={r.id} className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary)]"
                            checked={form.recipient_ids.includes(r.id)}
                            onChange={(e) => toggleRecipient(r.id, e.target.checked)}
                          />
                          {r.label}
                          {!r.telegram_chat_id && (
                            <span className="text-xs text-muted-foreground">
                              (aguardando vínculo)
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cadastre um destinatário em Configurações para poder receber alertas.
                    </p>
                  )}
                </div>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              {editingId ? "Salvar" : "Criar orçamento"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${pendingDelete?.name}" será excluído permanentemente, junto com o histórico de alertas enviados.`}
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

// Versão compacta pro Dashboard: só o andamento dos orçamentos ativos, sem
// criar/editar — quem quiser mexer clica em "Ver todos" e vai pra aba
// Controle orçamentário de verdade.
export function BudgetsPanel({ onOpenAll }: { onOpenAll?: () => void }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [spentByBudget, setSpentByBudget] = useState<
    Map<string, { spent: number; start: string; end: string }>
  >(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      const [budgetRows, categoryRows, costCenterRows, accountRows, creditCardRows] =
        await Promise.all([
          supabase.from("budgets").select("*").eq("is_active", true).order("created_at"),
          supabase.from("categories").select("*"),
          supabase.from("cost_centers").select("*"),
          supabase.from("accounts").select("*"),
          supabase.from("credit_cards").select("*"),
        ]);
      const budgetList = budgetRows.data ?? [];
      setBudgets(budgetList);
      setCategories(categoryRows.data ?? []);
      setCostCenters(costCenterRows.data ?? []);
      setAccounts(accountRows.data ?? []);
      setCreditCards(creditCardRows.data ?? []);
      if (userId && budgetList.length) {
        const entries = await Promise.all(
          budgetList.map(async (b) => {
            const period = currentBudgetPeriod(
              b.period_type as PeriodType,
              b.start_date,
              b.end_date,
            );
            const spent = await budgetSpent(supabase, userId, b, period.start, period.end);
            return [b.id, { spent, ...period }] as const;
          }),
        );
        setSpentByBudget(new Map(entries));
      }
      setLoading(false);
    })();
  }, []);

  const categoryPath = (id: string | null): string => {
    if (!id) return "";
    const c = categories.find((cat) => cat.id === id);
    if (!c) return "";
    return c.parent_id ? `${categoryPath(c.parent_id)} › ${c.name}` : c.name;
  };
  const scopeLabel = (budget: Budget): string => {
    if (budget.category_id) return categoryPath(budget.category_id);
    if (budget.cost_center_id)
      return costCenters.find((cc) => cc.id === budget.cost_center_id)?.name ?? "";
    if (budget.account_id) return accounts.find((a) => a.id === budget.account_id)?.name ?? "";
    return creditCards.find((c) => c.id === budget.card_id)?.name ?? "";
  };

  if (loading) return null;
  if (!budgets.length) return null;

  // Mais urgente primeiro: estourado, depois perto do limiar, depois o resto.
  const sorted = [...budgets].sort((a, b) => {
    const pctA =
      Number(a.amount) > 0 ? (spentByBudget.get(a.id)?.spent ?? 0) / Number(a.amount) : 0;
    const pctB =
      Number(b.amount) > 0 ? (spentByBudget.get(b.id)?.spent ?? 0) / Number(b.amount) : 0;
    return pctB - pctA;
  });

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">Controle orçamentário</h2>
          <p className="text-xs text-muted-foreground">Andamento dos orçamentos ativos</p>
        </div>
        {onOpenAll && (
          <button
            type="button"
            onClick={onOpenAll}
            className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          >
            Ver todos
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
      <div className="divide-y divide-border">
        {sorted.map((budget) => {
          const info = spentByBudget.get(budget.id);
          const spent = info?.spent ?? 0;
          const amount = Number(budget.amount);
          const pct = amount > 0 ? Math.min(999, (spent / amount) * 100) : 0;
          const exceeded = spent > amount;
          const nearThreshold =
            !exceeded &&
            budget.alert_threshold_enabled &&
            budget.alert_threshold_percent !== null &&
            pct >= Number(budget.alert_threshold_percent);
          const barColor = exceeded ? "bg-expense" : nearThreshold ? "bg-amber-500" : "bg-primary";
          return (
            <div key={budget.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="min-w-0 truncate font-medium">
                  {budget.name}{" "}
                  <span className="text-muted-foreground">· {scopeLabel(budget)}</span>
                </p>
                <span
                  className={cn(
                    "flex-none font-mono text-xs tabular-nums",
                    exceeded ? "text-expense" : "text-muted-foreground",
                  )}
                >
                  {money.format(spent)} / {money.format(amount)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full transition-all", barColor)}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
