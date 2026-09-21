import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { MultiSelectFilter, PeriodFilter, SortSelect, type Period } from "@/components/ui/filters";
import { sortByKey, type SortKey } from "@/lib/sort";
import { CategoryCombobox } from "@/components/ui/category-combobox";
import { cn } from "@/lib/utils";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { BANKS, bankByName, initialsFor } from "@/lib/banks";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Tables"]["categories"]["Row"];
type CostCenter = Database["public"]["Tables"]["cost_centers"]["Row"];
type CreditCardRow = Database["public"]["Tables"]["credit_cards"]["Row"];
type CardTransaction = Database["public"]["Tables"]["credit_card_transactions"]["Row"];
type Account = Database["public"]["Tables"]["accounts"]["Row"];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const monthNames = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// Competência da fatura: se a compra caiu depois do fechamento, ela entra na
// fatura do mês seguinte. Vencimento cai no mesmo mês da competência quando o
// dia de vencimento é depois do fechamento; senão, no mês seguinte (convenção
// usual dos bancos: fecha, aí só depois vence).
function invoiceInfo(purchaseDate: string, closingDay: number, dueDay: number) {
  const d = new Date(`${purchaseDate}T12:00:00`);
  let month = d.getMonth();
  let year = d.getFullYear();
  if (d.getDate() > closingDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  let dueMonth = month;
  let dueYear = year;
  if (dueDay <= closingDay) {
    dueMonth += 1;
    if (dueMonth > 11) {
      dueMonth = 0;
      dueYear += 1;
    }
  }
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  const dueDate = `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
  return { key, label: `${monthNames[month]}/${year}`, dueDate };
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CardBadge({ institution }: { institution: string | null }) {
  if (!institution) return <CreditCard className="text-primary" />;
  const bank = bankByName(institution);
  if (bank?.logo)
    return (
      <img
        src={bank.logo}
        alt={bank.name}
        title={bank.name}
        className="size-full rounded-md object-cover"
      />
    );
  return (
    <span
      className="grid size-full place-items-center rounded-md text-xs font-semibold text-white"
      style={{ backgroundColor: bank?.color ?? "var(--muted-foreground)" }}
      title={institution}
    >
      {bank?.short ?? initialsFor(institution)}
    </span>
  );
}

type CardFormState = {
  name: string;
  institution: string;
  credit_limit: string;
  closing_day: string;
  due_day: string;
};
const emptyCardForm = (): CardFormState => ({
  name: "",
  institution: "",
  credit_limit: "0.00",
  closing_day: "1",
  due_day: "10",
});

type TxFormState = {
  card_id: string;
  description: string;
  amount: string;
  purchase_date: string;
  category_id: string;
  cost_center_id: string;
  installments: boolean;
  installment_count: string;
};
const emptyTxForm = (cardId: string): TxFormState => ({
  card_id: cardId,
  description: "",
  amount: "0.00",
  purchase_date: new Date().toISOString().slice(0, 10),
  category_id: "",
  cost_center_id: "",
  installments: false,
  installment_count: "2",
});

export function CreditCards({
  categories,
  costCenters,
  categoryPath,
  centerName,
  accounts,
  statusFilter,
  onStatusFilterChange,
}: {
  categories: Category[];
  costCenters: CostCenter[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
  accounts: Account[];
  statusFilter: "all" | "active" | "inactive";
  onStatusFilterChange: (value: "all" | "active" | "inactive") => void;
}) {
  const [cards, setCards] = useState<CreditCardRow[]>([]);
  const [txs, setTxs] = useState<CardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardIds, setCardIds] = useState<Set<string>>(new Set());
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set());
  const [costCenterIds, setCostCenterIds] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState<CardFormState>(emptyCardForm());
  const [cardActive, setCardActive] = useState(true);
  const [savingCard, setSavingCard] = useState(false);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txForm, setTxForm] = useState<TxFormState>(emptyTxForm(""));
  const [savingTx, setSavingTx] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<{
    type: "card" | "transaction";
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [payTarget, setPayTarget] = useState<{
    cardId: string;
    invoiceKey: string;
    label: string;
    total: number;
  } | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [payingInvoice, setPayingInvoice] = useState(false);

  async function load() {
    setLoading(true);
    const [cardRows, txsData] = await Promise.all([
      supabase.from("credit_cards").select("*").order("created_at"),
      fetchAllRows<CardTransaction>((from, to) =>
        supabase
          .from("credit_card_transactions")
          .select("*")
          .order("purchase_date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);
    setCards(cardRows.data ?? []);
    setTxs(txsData);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const usedByCard = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of txs) {
      if (tx.paid_at) continue;
      map.set(tx.card_id, (map.get(tx.card_id) ?? 0) + tx.amount);
    }
    return map;
  }, [txs]);

  const filteredCards = useMemo(
    () =>
      cards.filter((c) =>
        statusFilter === "all" ? true : statusFilter === "active" ? c.is_active : !c.is_active,
      ),
    [cards, statusFilter],
  );

  function openNewCard() {
    setEditingCardId(null);
    setCardForm(emptyCardForm());
    setCardActive(true);
    setCardModalOpen(true);
  }
  function openEditCard(card: CreditCardRow) {
    setEditingCardId(card.id);
    setCardForm({
      name: card.name,
      institution: card.institution ?? "",
      credit_limit: String(card.credit_limit ?? "0.00"),
      closing_day: String(card.closing_day),
      due_day: String(card.due_day),
    });
    setCardActive(card.is_active);
    setCardModalOpen(true);
  }
  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    setSavingCard(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setSavingCard(false);
      return;
    }
    const payload = {
      user_id: userId,
      name: cardForm.name,
      institution: cardForm.institution || null,
      credit_limit: Number(cardForm.credit_limit || 0),
      closing_day: Math.min(28, Math.max(1, Math.trunc(Number(cardForm.closing_day || 1)))),
      due_day: Math.min(28, Math.max(1, Math.trunc(Number(cardForm.due_day || 1)))),
      is_active: cardActive,
    };
    const result = editingCardId
      ? await supabase.from("credit_cards").update(payload).eq("id", editingCardId)
      : await supabase.from("credit_cards").insert(payload);
    setSavingCard(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(editingCardId ? "Cartão atualizado." : "Cartão criado.");
    setCardModalOpen(false);
    await load();
  }

  function openNewTx(cardId: string) {
    setTxForm(emptyTxForm(cardId || cards[0]?.id || ""));
    setTxModalOpen(true);
  }
  function buildInstallmentRows(): {
    purchase_date: string;
    amount: number;
    description: string;
    installment_number: number;
    installment_total: number;
  }[] {
    const count = txForm.installments
      ? Math.max(2, Math.min(24, Math.trunc(Number(txForm.installment_count || 2))))
      : 1;
    const totalCents = Math.round(Number(txForm.amount || 0) * 100);
    const base = Math.floor(totalCents / count);
    const remainder = totalCents - base * count;
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(`${txForm.purchase_date}T12:00:00`);
      date.setMonth(date.getMonth() + i);
      const cents = base + (i === count - 1 ? remainder : 0);
      return {
        purchase_date: date.toISOString().slice(0, 10),
        amount: cents / 100,
        description: count > 1 ? `${txForm.description} (${i + 1}/${count})` : txForm.description,
        installment_number: i + 1,
        installment_total: count,
      };
    });
  }
  async function saveTx(e: React.FormEvent) {
    e.preventDefault();
    setSavingTx(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId || !txForm.card_id) {
      setSavingTx(false);
      return;
    }
    const rows = buildInstallmentRows();
    const { error } = await supabase.from("credit_card_transactions").insert(
      rows.map((r) => ({
        user_id: userId,
        card_id: txForm.card_id,
        category_id: txForm.category_id || null,
        cost_center_id: txForm.cost_center_id || null,
        description: r.description,
        amount: r.amount,
        purchase_date: r.purchase_date,
        installment_number: r.installment_number,
        installment_total: r.installment_total,
        source: "manual",
      })),
    );
    setSavingTx(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(rows.length > 1 ? `${rows.length} parcelas lançadas.` : "Lançamento criado.");
    setTxModalOpen(false);
    await load();
  }

  function confirmDeleteCard(card: CreditCardRow) {
    setPendingDelete({ type: "card", id: card.id, label: card.name });
  }
  function confirmDeleteTx(tx: CardTransaction) {
    setPendingDelete({ type: "transaction", id: tx.id, label: tx.description });
  }
  async function performDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const table = pendingDelete.type === "card" ? "credit_cards" : "credit_card_transactions";
    const { error } = await supabase.from(table).delete().eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(pendingDelete.type === "card" ? "Cartão excluído." : "Lançamento excluído.");
    setPendingDelete(null);
    await load();
  }

  function openPayInvoice(cardId: string, invoiceKey: string, label: string, total: number) {
    setPayTarget({ cardId, invoiceKey, label, total });
    setPayAccountId(accounts[0]?.id ?? "");
  }
  async function confirmPayInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget || !payAccountId) return;
    const card = cards.find((c) => c.id === payTarget.cardId);
    if (!card) return;
    setPayingInvoice(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setPayingInvoice(false);
      return;
    }
    const ids = txs
      .filter((t) => t.card_id === payTarget.cardId && !t.paid_at)
      .filter(
        (t) =>
          invoiceInfo(t.purchase_date, card.closing_day, card.due_day).key === payTarget.invoiceKey,
      )
      .map((t) => t.id);
    const { error: txError } = await supabase.from("transactions").insert({
      user_id: userId,
      transaction_type: "expense",
      account_id: payAccountId,
      amount: payTarget.total,
      transaction_date: new Date().toISOString().slice(0, 10),
      description: `Pagamento fatura ${card.name} — ${payTarget.label}`,
      source: "manual",
    });
    if (txError) {
      setPayingInvoice(false);
      toast.error(txError.message);
      return;
    }
    const { error } = await supabase
      .from("credit_card_transactions")
      .update({ paid_at: new Date().toISOString() })
      .in("id", ids);
    setPayingInvoice(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Fatura paga e lançada na conta.");
    setPayTarget(null);
    await load();
  }

  const cardOptions = useMemo(
    () =>
      [...cards]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((c) => ({ id: c.id, label: c.name })),
    [cards],
  );
  const categoryOptions = useMemo(
    () => [
      { id: "", label: "Sem categoria" },
      ...[...categories]
        .filter((c) => c.category_type === "expense")
        .sort((a, b) => categoryPath(a.id).localeCompare(categoryPath(b.id), "pt-BR"))
        .map((c) => ({ id: c.id, label: categoryPath(c.id) })),
    ],
    [categories, categoryPath],
  );
  const costCenterOptions = useMemo(
    () => [
      { id: "", label: "Sem centro de custo" },
      ...[...costCenters]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((c) => ({ id: c.id, label: c.name })),
    ],
    [costCenters],
  );
  const hasActiveFilters =
    cardIds.size > 0 ||
    categoryIds.size > 0 ||
    costCenterIds.size > 0 ||
    !!period.from ||
    !!period.to;
  function clearFilters() {
    setCardIds(new Set());
    setCategoryIds(new Set());
    setCostCenterIds(new Set());
    setPeriod({ from: "", to: "" });
  }

  // Cada fatura depende do dia de fechamento/vencimento do próprio cartão,
  // então agrupamos cartão por cartão (com os filtros já aplicados nos
  // lançamentos) e só depois juntamos tudo numa lista só, ordenada.
  const groups = useMemo(() => {
    const visibleCards = cardIds.size ? cards.filter((c) => cardIds.has(c.id)) : cards;
    const result: {
      key: string;
      label: string;
      dueDate: string;
      card: CreditCardRow;
      items: CardTransaction[];
    }[] = [];
    for (const card of visibleCards) {
      const cardTxs = txs.filter((t) => {
        if (t.card_id !== card.id) return false;
        if (categoryIds.size && !categoryIds.has(t.category_id ?? "")) return false;
        if (costCenterIds.size && !costCenterIds.has(t.cost_center_id ?? "")) return false;
        if (period.from && t.purchase_date < period.from) return false;
        if (period.to && t.purchase_date > period.to) return false;
        return true;
      });
      const byKey = new Map<
        string,
        { key: string; label: string; dueDate: string; items: CardTransaction[] }
      >();
      for (const tx of cardTxs) {
        const info = invoiceInfo(tx.purchase_date, card.closing_day, card.due_day);
        const group = byKey.get(info.key) ?? { ...info, items: [] };
        group.items.push(tx);
        byKey.set(info.key, group);
      }
      for (const group of byKey.values()) result.push({ ...group, card });
    }
    return result.sort((a, b) =>
      a.key === b.key ? a.card.name.localeCompare(b.card.name, "pt-BR") : a.key < b.key ? 1 : -1,
    );
  }, [cards, txs, cardIds, categoryIds, costCenterIds, period]);

  const visibleTxIds = useMemo(() => groups.flatMap((g) => g.items.map((t) => t.id)), [groups]);

  function toggleSelectTx(id: string, checked: boolean) {
    setSelectedTxIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleSelectAllTx(checked: boolean) {
    setSelectedTxIds(checked ? new Set(visibleTxIds) : new Set());
  }
  async function applyBulkCategory(categoryId: string) {
    const ids = Array.from(selectedTxIds);
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("credit_card_transactions")
      .update({ category_id: categoryId || null })
      .in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Categoria aplicada a ${ids.length} lançamento${ids.length === 1 ? "" : "s"}.`);
    setSelectedTxIds(new Set());
    await load();
  }
  async function applyBulkCostCenter(costCenterId: string) {
    const ids = Array.from(selectedTxIds);
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("credit_card_transactions")
      .update({ cost_center_id: costCenterId || null })
      .in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `Centro de custo aplicado a ${ids.length} lançamento${ids.length === 1 ? "" : "s"}.`,
    );
    setSelectedTxIds(new Set());
    await load();
  }

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando cartões…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Seus cartões</h2>
          <div className="flex items-center gap-2">
            {cards.length > 0 && (
              <select
                className={selectClass + " h-9 w-auto"}
                value={statusFilter}
                onChange={(e) =>
                  onStatusFilterChange(e.target.value as "all" | "active" | "inactive")
                }
              >
                <option value="all">Todos os cartões</option>
                <option value="active">Só ativos</option>
                <option value="inactive">Só inativos</option>
              </select>
            )}
            <Button size="sm" onClick={openNewCard}>
              <Plus />
              Novo cartão
            </Button>
          </div>
        </div>
        {!cards.length ? (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum cartão cadastrado ainda. Crie o primeiro para começar a lançar as compras.
          </div>
        ) : !filteredCards.length ? (
          <p className="mt-3 py-10 text-center text-sm text-muted-foreground">
            Nenhum cartão encontrado com esse filtro.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCards.map((card) => {
              const used = usedByCard.get(card.id) ?? 0;
              const limit = card.credit_limit || 0;
              const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
              return (
                <div
                  key={card.id}
                  className={cn(
                    "rounded-lg border border-border bg-card p-4",
                    !card.is_active && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 flex-none place-items-center overflow-hidden rounded-md text-xs [&_svg]:size-4">
                      <CardBadge institution={card.institution} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{card.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Fecha dia {card.closing_day} · vence dia {card.due_day}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditCard(card)}
                        aria-label="Editar cartão"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirmDeleteCard(card)}
                        aria-label="Excluir cartão"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          pct > 90 ? "bg-destructive" : pct > 70 ? "bg-amber-500" : "bg-primary",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">Limite</p>
                        <p className="text-xs font-medium">{money.format(limit)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">Usado</p>
                        <p className="text-xs font-medium text-expense">{money.format(used)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">Disponível</p>
                        <p className="text-xs font-medium text-income">
                          {money.format(Math.max(0, limit - used))}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => openNewTx(card.id)}
                  >
                    <Plus />
                    Nova despesa
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {cards.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Lançamentos</span>
              <MultiSelectFilter
                label="Cartão"
                options={cardOptions}
                selected={cardIds}
                onChange={setCardIds}
                searchPlaceholder="Buscar cartão…"
              />
              <MultiSelectFilter
                label="Categoria"
                options={categoryOptions}
                selected={categoryIds}
                onChange={setCategoryIds}
                searchPlaceholder="Buscar categoria…"
              />
              <MultiSelectFilter
                label="Centro de custo"
                options={costCenterOptions}
                selected={costCenterIds}
                onChange={setCostCenterIds}
                searchPlaceholder="Buscar centro de custo…"
              />
              <PeriodFilter from={period.from} to={period.to} onChange={setPeriod} />
              {hasActiveFilters && (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              )}
              <SortSelect value={sortKey} onChange={setSortKey} />
            </div>
            <Button size="sm" onClick={() => openNewTx(cards[0]!.id)}>
              <Plus />
              Nova despesa
            </Button>
          </div>
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={
                  visibleTxIds.length > 0 && visibleTxIds.every((id) => selectedTxIds.has(id))
                }
                onChange={(e) => toggleSelectAllTx(e.target.checked)}
                aria-label="Selecionar todos"
              />
              {selectedTxIds.size > 0 ? (
                <>
                  <span>
                    {selectedTxIds.size} selecionado{selectedTxIds.size === 1 ? "" : "s"}
                  </span>
                  <CategoryCombobox
                    categories={categories}
                    categoryPath={categoryPath}
                    value=""
                    onValueChange={(id) => void applyBulkCategory(id)}
                    placeholder="Aplicar categoria aos selecionados"
                    filter={(c) => c.category_type === "expense"}
                    disabled={bulkBusy}
                  />
                  <select
                    className={selectClass}
                    defaultValue=""
                    disabled={bulkBusy}
                    onChange={(e) => void applyBulkCostCenter(e.target.value)}
                  >
                    <option value="">Aplicar centro de custo aos selecionados</option>
                    {costCenters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span>Selecionar todos</span>
              )}
            </div>
          )}
          {!groups.length ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {hasActiveFilters
                ? "Nenhum lançamento encontrado com esses filtros."
                : "Nenhum lançamento em cartão ainda."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {groups.map((group) => {
                const total = group.items.reduce((sum, t) => sum + t.amount, 0);
                const allPaid = group.items.every((t) => t.paid_at);
                return (
                  <div key={`${group.card.id}-${group.key}`} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium capitalize">
                          Fatura de {group.label} · {group.card.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Vencimento {group.dueDate.split("-").reverse().join("/")} ·{" "}
                          {money.format(total)}
                        </p>
                      </div>
                      {allPaid ? (
                        <span className="rounded-full bg-income-soft px-3 py-1 text-xs font-medium text-income">
                          Paga
                        </span>
                      ) : group.card.bank_connection_id ? (
                        <span className="text-xs text-muted-foreground">
                          Pagamento conciliado automaticamente pela integração bancária
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openPayInvoice(group.card.id, group.key, group.label, total)
                          }
                        >
                          <Check />
                          Marcar fatura como paga
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 space-y-2">
                      {sortByKey(group.items, sortKey, {
                        date: (t) => t.purchase_date,
                        settlementDate: (t) => t.paid_at ?? t.purchase_date,
                        amount: (t) => t.amount,
                        description: (t) => t.description,
                      }).map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="size-4 flex-none accent-[var(--primary)]"
                            checked={selectedTxIds.has(tx.id)}
                            onChange={(e) => toggleSelectTx(tx.id, e.target.checked)}
                            aria-label={`Selecionar ${tx.description}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {tx.purchase_date.split("-").reverse().join("/")}
                              {tx.installment_total > 1
                                ? ` · parcela ${tx.installment_number}/${tx.installment_total}`
                                : ""}
                              {" · "}
                              {categoryPath(tx.category_id)}
                              {tx.cost_center_id ? ` · ${centerName(tx.cost_center_id)}` : ""}
                            </p>
                          </div>
                          <span className="font-mono text-sm tabular-nums text-expense">
                            {money.format(tx.amount)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDeleteTx(tx)}
                            aria-label="Excluir lançamento"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <Dialog open={cardModalOpen} onOpenChange={setCardModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCardId ? "Editar cartão" : "Novo cartão"}</DialogTitle>
            <DialogDescription>
              Defina o limite e as datas de fechamento e vencimento da fatura.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveCard} className="space-y-4">
            <Field label="Nome do cartão">
              <Input
                required
                value={cardForm.name}
                onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Nubank Ultravioleta"
              />
            </Field>
            <Field label="Instituição">
              <select
                className={selectClass}
                value={cardForm.institution}
                onChange={(e) => setCardForm((f) => ({ ...f, institution: e.target.value }))}
              >
                <option value="">Nenhuma</option>
                {BANKS.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Limite total">
              <CurrencyInput
                value={cardForm.credit_limit}
                onChange={(v) => setCardForm((f) => ({ ...f, credit_limit: v }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia de fechamento">
                <Input
                  required
                  type="number"
                  min={1}
                  max={28}
                  value={cardForm.closing_day}
                  onChange={(e) => setCardForm((f) => ({ ...f, closing_day: e.target.value }))}
                />
              </Field>
              <Field label="Dia de vencimento">
                <Input
                  required
                  type="number"
                  min={1}
                  max={28}
                  value={cardForm.due_day}
                  onChange={(e) => setCardForm((f) => ({ ...f, due_day: e.target.value }))}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={cardActive}
                onChange={(e) => setCardActive(e.target.checked)}
              />
              Cartão ativo
            </label>
            <Button type="submit" className="w-full" disabled={savingCard}>
              {savingCard ? <Loader2 className="animate-spin" /> : null}
              {editingCardId ? "Salvar" : "Criar cartão"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={txModalOpen} onOpenChange={setTxModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova despesa no cartão</DialogTitle>
            <DialogDescription>Lance uma compra, à vista ou parcelada.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTx} className="space-y-4">
            <Field label="Cartão">
              <select
                className={selectClass}
                value={txForm.card_id}
                onChange={(e) => setTxForm((f) => ({ ...f, card_id: e.target.value }))}
              >
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descrição">
              <Input
                required
                value={txForm.description}
                onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field label="Valor da compra">
              <CurrencyInput
                value={txForm.amount}
                onChange={(v) => setTxForm((f) => ({ ...f, amount: v }))}
              />
            </Field>
            <Field label="Data da compra">
              <Input
                required
                type="date"
                value={txForm.purchase_date}
                onChange={(e) => setTxForm((f) => ({ ...f, purchase_date: e.target.value }))}
              />
            </Field>
            <Field label="Categoria">
              <CategoryCombobox
                categories={categories}
                categoryPath={categoryPath}
                value={txForm.category_id}
                onValueChange={(id) => setTxForm((f) => ({ ...f, category_id: id }))}
                placeholder="Sem categoria"
                emptyOptionLabel="Sem categoria"
                filter={(c) => c.category_type === "expense"}
              />
            </Field>
            <Field label="Centro de custo">
              <select
                className={selectClass}
                value={txForm.cost_center_id}
                onChange={(e) => setTxForm((f) => ({ ...f, cost_center_id: e.target.value }))}
              >
                <option value="">Sem centro de custo</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={txForm.installments}
                onChange={(e) => setTxForm((f) => ({ ...f, installments: e.target.checked }))}
              />
              Parcelar esta compra
            </label>
            {txForm.installments && (
              <Field label="Número de parcelas">
                <Input
                  required
                  type="number"
                  min={2}
                  max={24}
                  value={txForm.installment_count}
                  onChange={(e) => setTxForm((f) => ({ ...f, installment_count: e.target.value }))}
                />
              </Field>
            )}
            <Button type="submit" className="w-full" disabled={savingTx || !txForm.card_id}>
              {savingTx ? <Loader2 className="animate-spin" /> : null}
              Lançar despesa
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar fatura</DialogTitle>
            <DialogDescription>
              De qual conta saiu o pagamento de {payTarget && money.format(payTarget.total)}
              {payTarget ? ` (fatura de ${payTarget.label})` : ""}?
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmPayInvoice} className="space-y-4">
            <Field label="Conta de pagamento">
              <select
                className={selectClass}
                value={payAccountId}
                onChange={(e) => setPayAccountId(e.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" className="w-full" disabled={payingInvoice || !payAccountId}>
              {payingInvoice ? <Loader2 className="animate-spin" /> : null}
              Confirmar pagamento
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.type === "card" ? "Excluir cartão" : "Excluir lançamento"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === "card"
                ? `Isso vai excluir o cartão "${pendingDelete?.label}" e todos os lançamentos dele. Essa ação não pode ser desfeita.`
                : `Tem certeza que deseja excluir "${pendingDelete?.label}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
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
