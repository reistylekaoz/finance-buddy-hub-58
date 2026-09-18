import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRightLeft,
  Building2,
  Check,
  CreditCard,
  FileUp,
  ChevronRight,
  CircleDollarSign,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Send,
  Settings as SettingsIcon,
  Trash2,
  Shapes,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { StatementImport } from "@/components/statement-import";
import { CreditCards } from "@/components/credit-cards";
import { BankConnections } from "@/components/bank-connections";
import { getDailyRates } from "@/lib/rates.functions";
import { BANKS, bankByName, initialsFor } from "@/lib/banks";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import type { Database } from "@/integrations/supabase/types";
import lightLogo from "@/assets/fluxora-logo-light-transparent.png.asset.json";

type Account = Database["public"]["Tables"]["accounts"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
type Asset = Database["public"]["Tables"]["assets"]["Row"];
type CostCenter = Database["public"]["Tables"]["cost_centers"]["Row"];
type View =
  | "dashboard"
  | "accounts"
  | "transactions"
  | "import"
  | "credit_cards"
  | "bank_connections"
  | "categories"
  | "cost_centers"
  | "assets"
  | "settings";
type Modal = "account" | "transaction" | "category" | "asset" | "cost_center" | null;
type FormState = {
  name: string;
  institution: string;
  account_type: string;
  initial_balance: string;
  currency: string;
  category_type: string;
  parent_id: string;
  asset_type: string;
  asset_class: string;
  value: string;
  notes: string;
  transaction_type: string;
  account_id: string;
  destination_account_id: string;
  category_id: string;
  amount: string;
  transaction_date: string;
  description: string;
  center_type: string;
  cost_center_id: string;
  status: string;
  recurrence: string;
  installmentTotal: string;
  installmentCount: string;
  installmentFrequencyDays: string;
  fixedMonths: string;
};
const emptyForm = (): FormState => ({
  name: "",
  institution: "",
  account_type: "checking",
  initial_balance: "0.00",
  currency: "BRL",
  category_type: "expense",
  parent_id: "",
  asset_type: "asset",
  asset_class: "",
  value: "0.00",
  notes: "",
  transaction_type: "expense",
  account_id: "",
  destination_account_id: "",
  category_id: "",
  amount: "0.00",
  transaction_date: new Date().toISOString().slice(0, 10),
  description: "",
  center_type: "property",
  cost_center_id: "",
  status: "confirmed",
  recurrence: "none",
  installmentTotal: "0.00",
  installmentCount: "2",
  installmentFrequencyDays: "30",
  fixedMonths: "12",
});
const centerTypeLabel: Record<string, string> = {
  property: "Imóvel",
  business: "Negócio",
  personal: "Pessoal",
  other: "Outro",
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const currencyOptions = [
  { code: "BRL", label: "Real (R$)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "Dólar (US$)" },
];
const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const nav = [
  { id: "dashboard" as const, label: "Visão geral", icon: LayoutDashboard },
  { id: "accounts" as const, label: "Contas", icon: WalletCards },
  { id: "transactions" as const, label: "Lançamentos", icon: ArrowRightLeft },
  { id: "import" as const, label: "Conciliação e extrato", icon: FileUp },
  { id: "credit_cards" as const, label: "Cartões de crédito", icon: CreditCard },
  { id: "bank_connections" as const, label: "Conexões bancárias", icon: Landmark },
  { id: "categories" as const, label: "Categorias", icon: Shapes },
  { id: "cost_centers" as const, label: "Centros de custo", icon: Building2 },
  { id: "assets" as const, label: "Patrimônio", icon: TrendingUp },
  { id: "settings" as const, label: "Configurações", icon: SettingsIcon },
];
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function FinanceApp() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Olá");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [accountActive, setAccountActive] = useState(true);

  async function load() {
    setLoading(true);
    const [profile, accountRows, categoryRows, transactionsData, assetRows, centerRows] =
      await Promise.all([
        supabase.from("profiles").select("display_name").maybeSingle(),
        supabase.from("accounts").select("*").order("created_at"),
        supabase.from("categories").select("*").order("name"),
        fetchAllRows<Transaction>((from, to) =>
          supabase
            .from("transactions")
            .select("*")
            .order("transaction_date", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to),
        ),
        supabase.from("assets").select("*").order("created_at", { ascending: false }),
        supabase.from("cost_centers").select("*").order("name"),
      ]);
    setName(profile.data?.display_name || "Olá");
    setAccounts(accountRows.data ?? []);
    setCategories(categoryRows.data ?? []);
    setTransactions(transactionsData);
    setAssets(assetRows.data ?? []);
    setCostCenters(centerRows.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const [rates, setRates] = useState<Record<string, number>>({ BRL: 1 });
  const [rateDate, setRateDate] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const data = await getDailyRates();
        setRates({ BRL: 1, ...data.rates });
        setRateDate(data.date);
      } catch {
        /* mantém somente o real */
      }
    })();
  }, []);

  const accountCurrency = useMemo(
    () =>
      Object.fromEntries(accounts.map((a) => [a.id, a.currency || "BRL"])) as Record<
        string,
        string
      >,
    [accounts],
  );
  // sem cotação real, não inventamos 1:1 — melhor excluir do total do que mostrar valor errado.
  const rateOf = (currency: string): number | null =>
    rates[currency] ?? (currency === "BRL" ? 1 : null);
  const currencyOf = (accountId: string | null) =>
    accountId ? (accountCurrency[accountId] ?? "BRL") : "BRL";
  const reportableAccountIds = useMemo(
    () => new Set(accounts.filter((a) => a.is_active).map((a) => a.id)),
    [accounts],
  );
  // provisões (previsões ainda não confirmadas) não afetam saldo nem relatórios.
  const confirmedTransactions = useMemo(
    () => transactions.filter((t) => t.status !== "provisioned"),
    [transactions],
  );
  // contas marcadas para não entrar nos relatórios ficam de fora do dashboard.
  const reportableTransactions = useMemo(
    () => confirmedTransactions.filter((t) => reportableAccountIds.has(t.account_id)),
    [confirmedTransactions, reportableAccountIds],
  );
  const sortCurrencies = (keys: string[]) =>
    [...keys].sort((a, b) => (a === "BRL" ? -1 : b === "BRL" ? 1 : a.localeCompare(b)));
  function sumByCurrency(items: Transaction[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of items) {
      const c = currencyOf(t.account_id);
      out[c] = (out[c] ?? 0) + Number(t.amount);
    }
    return out;
  }

  const balanceByAccount = useMemo(
    () =>
      accounts.map((account) => {
        const delta = confirmedTransactions.reduce((sum, tx) => {
          if (tx.transaction_type === "income" && tx.account_id === account.id)
            return sum + Number(tx.amount);
          if (tx.transaction_type === "expense" && tx.account_id === account.id)
            return sum - Number(tx.amount);
          if (tx.transaction_type === "transfer" && tx.account_id === account.id)
            return sum - Number(tx.amount);
          if (tx.transaction_type === "transfer" && tx.destination_account_id === account.id)
            return sum + Number(tx.amount);
          return sum;
        }, 0);
        const balance = Number(account.initial_balance) + delta;
        const currency = account.currency || "BRL";
        const rate = rateOf(currency);
        return {
          ...account,
          balance,
          currency,
          balanceBRL: rate !== null ? balance * rate : null,
        };
      }),
    [accounts, confirmedTransactions, rates],
  );

  const totals = useMemo(() => {
    const current = new Date();
    const monthly = reportableTransactions.filter((tx) => {
      const d = new Date(`${tx.transaction_date}T12:00:00`);
      return d.getMonth() === current.getMonth() && d.getFullYear() === current.getFullYear();
    });
    const income = sumByCurrency(monthly.filter((t) => t.transaction_type === "income"));
    const expense = sumByCurrency(monthly.filter((t) => t.transaction_type === "expense"));
    const currencies = sortCurrencies(
      Array.from(
        new Set([
          ...Object.keys(income),
          ...Object.keys(expense),
          ...accounts.filter((a) => a.is_active).map((a) => a.currency || "BRL"),
        ]),
      ),
    );
    const byCurrency = currencies.map((currency) => ({
      currency,
      income: income[currency] ?? 0,
      expense: expense[currency] ?? 0,
      result: (income[currency] ?? 0) - (expense[currency] ?? 0),
    }));
    const assetTotal = assets
      .filter((a) => a.asset_type === "asset")
      .reduce((s, a) => s + Number(a.value), 0);
    const liabilityTotal = assets
      .filter((a) => a.asset_type === "liability")
      .reduce((s, a) => s + Number(a.value), 0);
    const reportableBalances = balanceByAccount.filter((a) => a.is_active);
    const balanceCurrencies = sortCurrencies(
      Array.from(new Set(reportableBalances.map((a) => a.currency))),
    );
    // saldo por moeda de origem das contas, sem converter — só o total geral é convertido para BRL.
    // contas fora dos relatórios não entram em nenhum desses totais.
    // sem cotação do dia, a moeda fica de fora do total em vez de entrar com um valor errado.
    const missingRateCurrencies: string[] = [];
    const balanceByCurrency = balanceCurrencies.map((currency) => {
      const accountsInCurrency = reportableBalances.filter((a) => a.currency === currency);
      const rateAvailable = accountsInCurrency.every((a) => a.balanceBRL !== null);
      if (!rateAvailable && currency !== "BRL") missingRateCurrencies.push(currency);
      return {
        currency,
        balance: accountsInCurrency.reduce((s, a) => s + a.balance, 0),
        balanceBRL: rateAvailable
          ? accountsInCurrency.reduce((s, a) => s + (a.balanceBRL ?? 0), 0)
          : null,
      };
    });
    // balance é o único total convertido para BRL — é o "saldo atual", não um histórico de transações.
    return {
      byCurrency,
      balanceByCurrency,
      missingRateCurrencies,
      balance: reportableBalances.reduce((s, a) => s + (a.balanceBRL ?? 0), 0),
      assetTotal,
      liabilityTotal,
    };
  }, [reportableTransactions, assets, balanceByAccount, accounts]);

  const chartDataByCurrency = useMemo(() => {
    const currencies = sortCurrencies(
      Array.from(new Set(accounts.filter((a) => a.is_active).map((a) => a.currency || "BRL"))),
    );
    if (!currencies.length) currencies.push("BRL");
    return currencies.map((currency) => ({
      currency,
      data: Array.from({ length: 6 }, (_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - index));
        const rows = reportableTransactions.filter((tx) => {
          const d = new Date(`${tx.transaction_date}T12:00:00`);
          return (
            d.getMonth() === date.getMonth() &&
            d.getFullYear() === date.getFullYear() &&
            currencyOf(tx.account_id) === currency
          );
        });
        return {
          month: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
          receita: rows
            .filter((t) => t.transaction_type === "income")
            .reduce((s, t) => s + Number(t.amount), 0),
          despesa: rows
            .filter((t) => t.transaction_type === "expense")
            .reduce((s, t) => s + Number(t.amount), 0),
        };
      }),
    }));
  }, [reportableTransactions, accounts]);

  const centerSummary = useMemo(() => {
    const rows = costCenters.map((center) => {
      const own = reportableTransactions.filter(
        (t) => t.cost_center_id === center.id && t.transaction_type !== "transfer",
      );
      const income = sumByCurrency(own.filter((t) => t.transaction_type === "income"));
      const expense = sumByCurrency(own.filter((t) => t.transaction_type === "expense"));
      const currencies = sortCurrencies(
        Array.from(new Set([...Object.keys(income), ...Object.keys(expense)])),
      );
      return { ...center, income, expense, currencies, count: own.length };
    });
    const orphan = reportableTransactions.filter(
      (t) => !t.cost_center_id && t.transaction_type !== "transfer",
    );
    if (orphan.length) {
      const income = sumByCurrency(orphan.filter((t) => t.transaction_type === "income"));
      const expense = sumByCurrency(orphan.filter((t) => t.transaction_type === "expense"));
      const currencies = sortCurrencies(
        Array.from(new Set([...Object.keys(income), ...Object.keys(expense)])),
      );
      rows.push({
        id: "none",
        user_id: "",
        name: "Sem centro de custo",
        center_type: "other",
        description: null,
        color: "orange",
        is_active: true,
        created_at: "",
        updated_at: "",
        income,
        expense,
        currencies,
        count: orphan.length,
      } as (typeof rows)[number]);
    }
    return rows.sort((a, b) => b.count - a.count);
  }, [costCenters, reportableTransactions]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    type: Exclude<Modal, null>;
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingTx, setConfirmingTx] = useState<Transaction | null>(null);
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmAmount, setConfirmAmount] = useState("0.00");
  const [confirming, setConfirming] = useState(false);
  function openConfirmProvision(tx: Transaction) {
    setConfirmingTx(tx);
    setConfirmDate(tx.transaction_date);
    setConfirmAmount(String(tx.amount));
  }
  async function confirmProvision(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmingTx) return;
    setConfirming(true);
    const { error: err } = await supabase
      .from("transactions")
      .update({
        status: "confirmed",
        transaction_date: confirmDate,
        amount: Number(confirmAmount),
      })
      .eq("id", confirmingTx.id);
    setConfirming(false);
    if (err) toast.error(`Não foi possível confirmar: ${err.message}`);
    else {
      toast.success("Lançamento confirmado.");
      setConfirmingTx(null);
      await load();
    }
  }
  function open(type: Exclude<Modal, null>) {
    setError("");
    setForm(emptyForm());
    setAccountActive(true);
    setEditingId(null);
    setModal(type);
  }
  function edit(type: Exclude<Modal, null>, row: any) {
    setError("");
    setEditingId(row.id);
    setAccountActive(type === "account" ? (row.is_active ?? true) : true);
    const base = emptyForm();
    if (type === "account")
      setForm({
        ...base,
        name: row.name,
        institution: row.institution ?? "",
        account_type: row.account_type,
        currency: row.currency || "BRL",
        initial_balance: String(row.initial_balance ?? "0.00"),
      });
    else if (type === "category")
      setForm({
        ...base,
        name: row.name,
        category_type: row.category_type,
        parent_id: row.parent_id ?? "",
      });
    else if (type === "asset")
      setForm({
        ...base,
        name: row.name,
        asset_type: row.asset_type,
        asset_class: row.asset_class,
        value: String(row.value ?? "0.00"),
        notes: row.notes ?? "",
      });
    else if (type === "cost_center")
      setForm({
        ...base,
        name: row.name,
        center_type: row.center_type,
        description: row.description ?? "",
      });
    else
      setForm({
        ...base,
        transaction_type: row.transaction_type,
        account_id: row.account_id,
        destination_account_id: row.destination_account_id ?? "",
        category_id: row.category_id ?? "",
        cost_center_id: row.cost_center_id ?? "",
        amount: String(row.amount ?? "0.00"),
        transaction_date: row.transaction_date,
        description: row.description,
        notes: row.notes ?? "",
        status: row.status ?? "confirmed",
      });
    setModal(type);
  }
  const tableOf: Record<
    Exclude<Modal, null>,
    "accounts" | "categories" | "assets" | "cost_centers" | "transactions"
  > = {
    account: "accounts",
    category: "categories",
    asset: "assets",
    cost_center: "cost_centers",
    transaction: "transactions",
  };
  function remove(type: Exclude<Modal, null>, id: string, label: string) {
    setPendingDelete({ type, id, label });
  }
  async function confirmPendingDelete() {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    setDeleting(true);
    if (type === "account") {
      const { error: txError } = await supabase
        .from("transactions")
        .delete()
        .or(`account_id.eq.${id},destination_account_id.eq.${id}`);
      if (txError) {
        setDeleting(false);
        toast.error(`Não foi possível excluir os lançamentos da conta: ${txError.message}`);
        return;
      }
    }
    const { error: delError } = await supabase.from(tableOf[type]).delete().eq("id", id);
    setDeleting(false);
    if (delError) toast.error(`Não foi possível excluir: ${delError.message}`);
    else {
      setPendingDelete(null);
      await load();
    }
  }
  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  function buildRecurrenceRows(): {
    transaction_date: string;
    amount: number;
    description: string;
  }[] {
    if (form.recurrence === "installments") {
      const count = Math.max(2, Math.trunc(Number(form.installmentCount || 2)));
      const freq = Math.max(1, Math.trunc(Number(form.installmentFrequencyDays || 30)));
      const totalCents = Math.round(Number(form.installmentTotal || 0) * 100);
      const base = Math.floor(totalCents / count);
      const remainder = totalCents - base * count;
      return Array.from({ length: count }, (_, i) => {
        const date = new Date(`${form.transaction_date}T12:00:00`);
        date.setDate(date.getDate() + i * freq);
        const cents = base + (i === count - 1 ? remainder : 0);
        return {
          transaction_date: date.toISOString().slice(0, 10),
          amount: cents / 100,
          description: `${form.description} (${i + 1}/${count})`,
        };
      });
    }
    if (form.recurrence === "fixed") {
      const months = Math.max(1, Math.trunc(Number(form.fixedMonths || 12)));
      const amount = Number(form.amount || 0);
      return Array.from({ length: months }, (_, i) => {
        const date = new Date(`${form.transaction_date}T12:00:00`);
        date.setMonth(date.getMonth() + i);
        return {
          transaction_date: date.toISOString().slice(0, 10),
          amount,
          description: `${form.description} (${i + 1}/${months})`,
        };
      });
    }
    return [];
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const continueAfter = submitter?.dataset["action"] === "continue";
    setSaving(true);
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId || !modal) {
      setError("Sua sessão expirou. Entre novamente.");
      setSaving(false);
      return;
    }
    let result: { error: { message: string } | null };
    if (modal === "transaction" && !editingId && form.recurrence !== "none") {
      const rows = buildRecurrenceRows();
      result = await supabase.from("transactions").insert(
        rows.map((r) => ({
          user_id: userId,
          transaction_type: form.transaction_type as Transaction["transaction_type"],
          account_id: form.account_id,
          category_id: form.category_id || null,
          cost_center_id: form.cost_center_id || null,
          notes: form.notes || null,
          status: "provisioned",
          transaction_date: r.transaction_date,
          amount: r.amount,
          description: r.description,
        })),
      );
      if (result.error) setError(result.error.message);
      else {
        toast.success(`${rows.length} provisões criadas.`);
        setModal(null);
        setEditingId(null);
        await load();
      }
      setSaving(false);
      return;
    }
    const payload: Record<string, unknown> =
      modal === "account"
        ? {
            name: form.name,
            institution: form.institution || null,
            account_type: form.account_type,
            currency: form.currency,
            initial_balance: Number(form.initial_balance || 0),
            is_active: accountActive,
          }
        : modal === "category"
          ? {
              name: form.name,
              category_type: form.category_type,
              parent_id: form.parent_id || null,
            }
          : modal === "asset"
            ? {
                name: form.name,
                asset_type: form.asset_type,
                asset_class: form.asset_class,
                value: Number(form.value || 0),
                notes: form.notes || null,
              }
            : modal === "cost_center"
              ? {
                  name: form.name,
                  center_type: form.center_type,
                  description: form.description || null,
                }
              : {
                  transaction_type: form.transaction_type,
                  account_id: form.account_id,
                  destination_account_id:
                    form.transaction_type === "transfer" ? form.destination_account_id : null,
                  category_id:
                    form.transaction_type === "transfer" ? null : form.category_id || null,
                  cost_center_id:
                    form.transaction_type === "transfer" ? null : form.cost_center_id || null,
                  amount: Number(form.amount),
                  transaction_date: form.transaction_date,
                  description: form.description,
                  notes: form.notes || null,
                  status: form.transaction_type === "transfer" ? "confirmed" : form.status,
                };
    const table = tableOf[modal];
    if (editingId) result = await (supabase.from(table) as any).update(payload).eq("id", editingId);
    else result = await (supabase.from(table) as any).insert({ user_id: userId, ...payload });
    if (result.error) setError(result.error.message);
    else if (continueAfter && !editingId) {
      toast.success("Salvo. Pronto para o próximo.");
      setForm(emptyForm());
      await load();
    } else {
      setModal(null);
      setEditingId(null);
      await load();
    }
    setSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  const categoryPath = (id: string | null): string => {
    if (!id) return "Sem categoria";
    const c = categories.find((item) => item.id === id);
    if (!c) return "Sem categoria";
    return c.parent_id ? `${categoryPath(c.parent_id)} › ${c.name}` : c.name;
  };
  const centerName = (id: string | null): string =>
    costCenters.find((c) => c.id === id)?.name ?? "Sem centro de custo";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-sidebar p-4 transition-transform md:sticky md:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-2 py-2">
            <img
              src={lightLogo.url}
              alt="Fluxora — Gestão financeira inteligente"
              className="h-auto w-40"
            />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
            >
              <X />
            </Button>
          </div>
          <nav className="mt-7 space-y-1">
            {nav.map((item) => (
              <Button
                key={item.id}
                variant={view === item.id ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => {
                  setView(item.id);
                  setMobileOpen(false);
                }}
              >
                <item.icon />
                {item.label}
              </Button>
            ))}
          </nav>
          <div className="mt-8 border-t border-border pt-5">
            <p className="px-3 text-xs font-medium uppercase text-muted-foreground">Contas</p>
            <div className="mt-2 space-y-1">
              {balanceByAccount.slice(0, 4).map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <div className="grid size-5 flex-none place-items-center overflow-hidden rounded-sm text-[9px] [&_svg]:size-3">
                    <BankBadge institution={a.institution} />
                  </div>
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(a.balance, a.currency)}
                  </span>
                </div>
              ))}
              {!accounts.length && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma conta cadastrada</p>
              )}
            </div>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <div className="rounded-md bg-foreground p-4 text-background">
              <p className="text-xs opacity-70">Saldo consolidado</p>
              <p className="mt-1 font-mono text-lg">{money.format(totals.balance)}</p>
            </div>
            <Button
              variant="ghost"
              className="mt-2 w-full justify-start text-muted-foreground"
              onClick={signOut}
            >
              <LogOut />
              Sair
            </Button>
          </div>
        </aside>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-overlay md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
          <header className="mb-7 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu"
              >
                <Menu />
              </Button>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">{name}</p>
                <h1 className="font-display text-2xl font-semibold md:text-3xl">
                  {nav.find((n) => n.id === view)?.label}
                </h1>
              </div>
            </div>
            {view !== "import" && view !== "credit_cards" && view !== "bank_connections" && (
              <Button
                onClick={() =>
                  open(
                    view === "accounts"
                      ? "account"
                      : view === "categories"
                        ? "category"
                        : view === "assets"
                          ? "asset"
                          : view === "cost_centers"
                            ? "cost_center"
                            : "transaction",
                  )
                }
              >
                <Plus />
                {view === "accounts"
                  ? "Nova conta"
                  : view === "categories"
                    ? "Nova categoria"
                    : view === "assets"
                      ? "Novo item"
                      : view === "cost_centers"
                        ? "Novo centro de custo"
                        : "Novo lançamento"}
              </Button>
            )}
          </header>
          {loading ? (
            <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
              Carregando seu controle financeiro…
            </div>
          ) : (
            <>
              {view === "dashboard" && (
                <Dashboard
                  totals={totals}
                  rateDate={rateDate}
                  chartDataByCurrency={chartDataByCurrency}
                  transactions={reportableTransactions}
                  accounts={accounts}
                  categoryPath={categoryPath}
                  centerName={centerName}
                  centerSummary={centerSummary}
                  onEditTx={(tx: Transaction) => edit("transaction", tx)}
                  onDeleteTx={(tx: Transaction) => remove("transaction", tx.id, tx.description)}
                />
              )}
              {view === "accounts" && (
                <Accounts
                  accounts={balanceByAccount}
                  onAdd={() => open("account")}
                  rateDate={rateDate}
                  onEdit={(a: Account) => edit("account", a)}
                  onDelete={(a: Account) => remove("account", a.id, a.name)}
                />
              )}
              {view === "transactions" && (
                <Transactions
                  transactions={transactions}
                  accounts={accounts}
                  categoryPath={categoryPath}
                  centerName={centerName}
                  onAdd={() => open("transaction")}
                  onEditTx={(tx: Transaction) => edit("transaction", tx)}
                  onDeleteTx={(tx: Transaction) => remove("transaction", tx.id, tx.description)}
                  onConfirmTx={openConfirmProvision}
                />
              )}
              {view === "import" && (
                <StatementImport
                  accounts={accounts}
                  categories={categories}
                  costCenters={costCenters}
                  categoryPath={categoryPath}
                  provisions={transactions.filter((t) => t.status === "provisioned")}
                  pendingBankTransactions={transactions.filter(
                    (t) => t.source === "api" && !t.reviewed_at,
                  )}
                  onImported={load}
                />
              )}
              {view === "credit_cards" && (
                <CreditCards
                  categories={categories}
                  costCenters={costCenters}
                  categoryPath={categoryPath}
                  centerName={centerName}
                  accounts={accounts}
                />
              )}
              {view === "bank_connections" && <BankConnections onSynced={load} />}
              {view === "categories" && (
                <Categories
                  categories={categories}
                  onAdd={() => open("category")}
                  onEdit={(c: Category) => edit("category", c)}
                  onDelete={(c: Category) => remove("category", c.id, c.name)}
                />
              )}
              {view === "cost_centers" && (
                <CostCenters
                  rows={centerSummary}
                  onAdd={() => open("cost_center")}
                  onEdit={(c: CostCenter) => edit("cost_center", c)}
                  onDelete={(c: CostCenter) => remove("cost_center", c.id, c.name)}
                />
              )}
              {view === "assets" && (
                <Assets
                  assets={assets}
                  totals={totals}
                  onAdd={() => open("asset")}
                  onEdit={(a: Asset) => edit("asset", a)}
                  onDelete={(a: Asset) => remove("asset", a.id, a.name)}
                />
              )}
              {view === "settings" && <Settings />}
            </>
          )}
        </main>
      </div>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(openState) => !openState && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {pendingDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === "account"
                ? `Isso vai excluir a conta "${pendingDelete?.label}" e todos os lançamentos dela (incluindo transferências de/para ela). Essa ação não pode ser desfeita.`
                : "Essa ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmPendingDelete();
              }}
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={confirmingTx !== null}
        onOpenChange={(openState) => !openState && setConfirmingTx(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar lançamento</DialogTitle>
            <DialogDescription>
              Informe a data e o valor que de fato afetarão a conta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmProvision} className="space-y-4">
            <Field label="Data de confirmação">
              <Input
                required
                type="date"
                value={confirmDate}
                onChange={(e) => setConfirmDate(e.target.value)}
              />
            </Field>
            <Field label="Valor confirmado">
              <CurrencyInput value={confirmAmount} onChange={setConfirmAmount} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmingTx(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={confirming}>
                {confirming ? "Confirmando…" : "Confirmar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={modal !== null} onOpenChange={(openState) => !openState && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {(editingId ? "Editar " : "Novo ") +
                (modal === "account"
                  ? "conta"
                  : modal === "category"
                    ? "categoria"
                    : modal === "asset"
                      ? "item patrimonial"
                      : modal === "cost_center"
                        ? "centro de custo"
                        : "lançamento")}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados para manter seus números atualizados.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {modal === "account" && (
              <>
                <Field label="Nome">
                  <Input required {...field("name")} placeholder="Conta principal" />
                </Field>
                <InstitutionField
                  value={form.institution}
                  onChange={(v) => setForm((f) => ({ ...f, institution: v }))}
                />
                <Field label="Tipo">
                  <select className={selectClass} {...field("account_type")}>
                    <option value="checking">Conta corrente</option>
                    <option value="savings">Poupança</option>
                    <option value="cash">Dinheiro</option>
                    <option value="investment">Investimento</option>
                    <option value="credit">Cartão de crédito</option>
                  </select>
                </Field>
                <Field label="Moeda">
                  <select className={selectClass} {...field("currency")}>
                    {currencyOptions.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {form.currency !== "BRL" && (
                    <p className="text-xs text-muted-foreground">
                      Só o saldo atual desta conta é convertido para reais (cotação do dia
                      anterior). Lançamentos continuam na moeda original.
                    </p>
                  )}
                </Field>
                <Field label="Saldo inicial">
                  <CurrencyInput
                    value={form.initial_balance}
                    onChange={(v) => setForm((f) => ({ ...f, initial_balance: v }))}
                    allowNegative
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={accountActive}
                    onChange={(e) => setAccountActive(e.target.checked)}
                  />
                  Considerar nos relatórios e no dashboard
                </label>
              </>
            )}
            {modal === "category" && (
              <>
                <Field label="Nome">
                  <Input required {...field("name")} />
                </Field>
                <Field label="Tipo">
                  <select className={selectClass} {...field("category_type")}>
                    <option value="expense">Despesa</option>
                    <option value="income">Receita</option>
                  </select>
                </Field>
                <Field label="Categoria superior (opcional)">
                  <select className={selectClass} {...field("parent_id")}>
                    <option value="">Nenhuma</option>
                    {categories
                      .filter((c) => c.category_type === form.category_type)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {categoryPath(c.id)}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            )}
            {modal === "asset" && (
              <>
                <Field label="Nome">
                  <Input
                    required
                    {...field("name")}
                    placeholder="Apartamento, veículo, financiamento…"
                  />
                </Field>
                <Field label="Natureza">
                  <select className={selectClass} {...field("asset_type")}>
                    <option value="asset">Ativo</option>
                    <option value="liability">Passivo</option>
                  </select>
                </Field>
                <Field label="Classe">
                  <Input
                    required
                    {...field("asset_class")}
                    placeholder="Imóvel, veículo, dívida…"
                  />
                </Field>
                <Field label="Valor atual">
                  <CurrencyInput
                    value={form.value}
                    onChange={(v) => setForm((f) => ({ ...f, value: v }))}
                  />
                </Field>
              </>
            )}
            {modal === "cost_center" && (
              <>
                <Field label="Nome">
                  <Input
                    required
                    {...field("name")}
                    placeholder="Studio 01, Apto Airbnb, Pessoal…"
                  />
                </Field>
                <Field label="Tipo">
                  <select className={selectClass} {...field("center_type")}>
                    <option value="property">Imóvel</option>
                    <option value="business">Negócio</option>
                    <option value="personal">Pessoal</option>
                    <option value="other">Outro</option>
                  </select>
                </Field>
                <Field label="Descrição (opcional)">
                  <Input
                    {...field("description")}
                    placeholder="Locação por temporada no Airbnb e Booking"
                  />
                </Field>
              </>
            )}
            {modal === "transaction" && (
              <>
                <Field label="Tipo">
                  <select
                    className={selectClass}
                    value={form.transaction_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        transaction_type: e.target.value,
                        ...(e.target.value === "transfer"
                          ? { status: "confirmed", recurrence: "none" }
                          : {}),
                      }))
                    }
                  >
                    <option value="expense">Despesa</option>
                    <option value="income">Receita</option>
                    <option value="transfer">Transferência</option>
                  </select>
                </Field>
                <Field label="Descrição">
                  <Input required {...field("description")} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valor">
                    <CurrencyInput
                      value={form.amount}
                      onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
                    />
                  </Field>
                  <Field label={form.status === "provisioned" ? "Data prevista" : "Data"}>
                    <Input required type="date" {...field("transaction_date")} />
                  </Field>
                </div>
                {form.transaction_type !== "transfer" && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input"
                        disabled={form.recurrence !== "none"}
                        checked={form.status === "provisioned" || form.recurrence !== "none"}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            status: e.target.checked ? "provisioned" : "confirmed",
                          }))
                        }
                      />
                      Provisão (previsão futura, ainda não executada)
                    </label>
                    <div className="space-y-3 rounded-md border border-dashed border-border p-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={form.recurrence === "installments"}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              recurrence: e.target.checked ? "installments" : "none",
                            }))
                          }
                        />
                        Provisão parcelada
                      </label>
                      {form.recurrence === "installments" && (
                        <div className="grid grid-cols-3 gap-2">
                          <Field label="Valor total">
                            <CurrencyInput
                              value={form.installmentTotal}
                              onChange={(v) => setForm((f) => ({ ...f, installmentTotal: v }))}
                            />
                          </Field>
                          <Field label="Parcelas">
                            <Input type="number" min="2" step="1" {...field("installmentCount")} />
                          </Field>
                          <Field label="A cada (dias)">
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              {...field("installmentFrequencyDays")}
                            />
                          </Field>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={form.recurrence === "fixed"}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              recurrence: e.target.checked ? "fixed" : "none",
                            }))
                          }
                        />
                        Despesa fixa (repete todo mês)
                      </label>
                      {form.recurrence === "fixed" && (
                        <Field label="Gerar quantos meses">
                          <Input type="number" min="1" step="1" {...field("fixedMonths")} />
                        </Field>
                      )}
                    </div>
                  </>
                )}
                <Field label={form.transaction_type === "transfer" ? "Conta de origem" : "Conta"}>
                  <select required className={selectClass} {...field("account_id")}>
                    <option value="">Selecione</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {form.transaction_type === "transfer" ? (
                  <Field label="Conta de destino">
                    <select required className={selectClass} {...field("destination_account_id")}>
                      <option value="">Selecione</option>
                      {accounts
                        .filter((a) => a.id !== form.account_id)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="Categoria">
                    <select className={selectClass} {...field("category_id")}>
                      <option value="">Sem categoria</option>
                      {categories
                        .filter((c) => c.category_type === form.transaction_type)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {categoryPath(c.id)}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <Field label="Centro de custo">
                  <select className={selectClass} {...field("cost_center_id")}>
                    <option value="">Sem centro de custo</option>
                    {costCenters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {!costCenters.length && (
                    <p className="text-xs text-muted-foreground">
                      Cadastre um centro de custo para separar por imóvel, plataforma ou área
                      pessoal.
                    </p>
                  )}
                </Field>
              </>
            )}
            {error && (
              <p className="rounded-md bg-destructive-soft p-3 text-sm text-destructive">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              {!editingId && (
                <Button type="submit" variant="outline" disabled={saving} data-action="continue">
                  {saving ? "Salvando…" : "Incluir e continuar"}
                </Button>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Editar" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Excluir"
        className="text-expense"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
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
function CurrencyInput({
  value,
  onChange,
  allowNegative = false,
}: {
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
}) {
  const num = Number(value || 0);
  const negative = allowNegative && num < 0;
  const cents = Math.round(Math.abs(num) * 100);
  const display =
    (negative ? "-" : "") +
    (cents / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return (
    <Input
      required
      type="text"
      inputMode={allowNegative ? "decimal" : "numeric"}
      value={display}
      onChange={(e) => {
        const raw = e.target.value;
        const isNegative = allowNegative && raw.trim().startsWith("-");
        const digits = raw.replace(/\D/g, "");
        const nextCents = digits ? parseInt(digits, 10) : 0;
        onChange((((isNegative ? -1 : 1) * nextCents) / 100).toFixed(2));
      }}
    />
  );
}
function InstitutionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const knownBank = bankByName(value) !== undefined;
  const [customMode, setCustomMode] = useState(!knownBank && value !== "");
  return (
    <Field label="Instituição">
      <select
        className={selectClass}
        value={customMode ? "Outro" : value}
        onChange={(e) => {
          if (e.target.value === "Outro") {
            setCustomMode(true);
            onChange("");
          } else {
            setCustomMode(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Nenhuma</option>
        {BANKS.map((b) => (
          <option key={b.name} value={b.name}>
            {b.name}
          </option>
        ))}
        <option value="Outro">Outro</option>
      </select>
      {customMode && (
        <Input
          className="mt-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nome do banco"
        />
      )}
    </Field>
  );
}
function BankBadge({ institution }: { institution: string | null }) {
  if (!institution) return <Landmark className="text-primary" />;
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
function Empty({ title, text, onAdd }: { title: string; text: string; onAdd: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <div>
        <CircleDollarSign className="mx-auto size-9 text-primary" />
        <h2 className="mt-3 font-display text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
        <Button className="mt-4" onClick={onAdd}>
          <Plus />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  tone,
  currency = "BRL",
  note,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
  currency?: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-medium tabular-nums",
          tone === "positive" && "text-income",
          tone === "negative" && "text-expense",
        )}
      >
        {formatCurrency(value, currency)}
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
function Dashboard({
  totals,
  rateDate,
  chartDataByCurrency,
  transactions,
  accounts,
  categoryPath,
  centerName,
  centerSummary,
  onEditTx,
  onDeleteTx,
}: any) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Saldo total"
          value={totals.balance}
          {...(totals.missingRateCurrencies.length
            ? {
                note: `Cotação indisponível hoje para ${totals.missingRateCurrencies.join(", ")} — saldo dessas contas não incluído`,
              }
            : {})}
        />
        {totals.balanceByCurrency
          .filter((c: any) => c.currency !== "BRL")
          .map((c: any) => (
            <Metric
              key={`balance-${c.currency}`}
              label={`Saldo em ${c.currency}`}
              value={c.balance}
              currency={c.currency}
              note={
                c.balanceBRL === null
                  ? "Cotação indisponível hoje — não incluído no saldo total"
                  : `${money.format(c.balanceBRL)} pela cotação${rateDate ? ` de ${dateFmt.format(new Date(`${rateDate}T12:00:00`))}` : " do dia anterior"}`
              }
            />
          ))}
        {totals.byCurrency.map((c: any) => (
          <div key={c.currency} className="contents">
            <Metric
              label={`Receitas do mês${c.currency !== "BRL" ? ` (${c.currency})` : ""}`}
              value={c.income}
              tone="positive"
              currency={c.currency}
            />
            <Metric
              label={`Despesas do mês${c.currency !== "BRL" ? ` (${c.currency})` : ""}`}
              value={c.expense}
              tone="negative"
              currency={c.currency}
            />
            <Metric
              label={`Resultado do mês${c.currency !== "BRL" ? ` (${c.currency})` : ""}`}
              value={c.result}
              tone={c.result >= 0 ? "positive" : "negative"}
              currency={c.currency}
            />
          </div>
        ))}
      </div>
      {chartDataByCurrency.map((cd: any) => (
        <div key={cd.currency} className="grid gap-4 xl:grid-cols-5">
          <section className="rounded-lg border border-border bg-card p-5 xl:col-span-3">
            <div>
              <h2 className="font-semibold">
                Receita × despesa{cd.currency !== "BRL" ? ` — ${cd.currency}` : ""}
              </h2>
              <p className="text-xs text-muted-foreground">Últimos seis meses</p>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cd.data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={55} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v), cd.currency)} />
                  <Bar dataKey="receita" fill="var(--income)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="despesa" fill="var(--expense)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-lg border border-border bg-card p-5 xl:col-span-2">
            <h2 className="font-semibold">
              Fluxo de caixa{cd.currency !== "BRL" ? ` — ${cd.currency}` : ""}
            </h2>
            <p className="text-xs text-muted-foreground">Resultado mensal</p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cd.data.map((d: any) => ({ ...d, fluxo: d.receita - d.despesa }))}>
                  <defs>
                    <linearGradient id={`cash-${cd.currency}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => formatCurrency(Number(v), cd.currency)} />
                  <Area
                    type="monotone"
                    dataKey="fluxo"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill={`url(#cash-${cd.currency})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      ))}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Movimentações recentes</h2>
        </div>
        <TransactionRows
          transactions={transactions.slice(0, 6)}
          accounts={accounts}
          categoryPath={categoryPath}
          centerName={centerName}
          onEditTx={onEditTx}
          onDeleteTx={onDeleteTx}
        />
      </section>
      {centerSummary.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Resultado por centro de custo</h2>
            <p className="text-xs text-muted-foreground">Receitas e despesas alocadas, por moeda</p>
          </div>
          <div className="divide-y divide-border">
            {centerSummary.map((r: any) => (
              <div key={r.id} className="px-5 py-3">
                <p className="text-sm font-medium">{r.name}</p>
                <div className="mt-1 space-y-1">
                  {r.currencies.length ? (
                    r.currencies.map((c: string) => (
                      <div
                        key={c}
                        className="grid grid-cols-2 items-center gap-3 text-xs sm:grid-cols-4"
                      >
                        <span className="text-muted-foreground">{c}</span>
                        <span className="hidden font-mono tabular-nums text-income sm:block">
                          {formatCurrency(r.income[c] ?? 0, c)}
                        </span>
                        <span className="hidden font-mono tabular-nums text-expense sm:block">
                          {formatCurrency(r.expense[c] ?? 0, c)}
                        </span>
                        <span
                          className={cn(
                            "text-right font-mono tabular-nums",
                            (r.income[c] ?? 0) - (r.expense[c] ?? 0) >= 0
                              ? "text-income"
                              : "text-expense",
                          )}
                        >
                          {formatCurrency((r.income[c] ?? 0) - (r.expense[c] ?? 0), c)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem lançamentos</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
function Accounts({
  accounts,
  onAdd,
  rateDate,
  onEdit,
  onDelete,
}: {
  accounts: (Account & { balance: number; currency: string; balanceBRL: number | null })[];
  onAdd: () => void;
  rateDate: string;
  onEdit: (a: Account) => void;
  onDelete: (a: Account) => void;
}) {
  if (!accounts.length)
    return (
      <Empty
        title="Comece pelas suas contas"
        text="Cadastre bancos, carteiras e investimentos."
        onAdd={onAdd}
      />
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((a) => (
        <div key={a.id} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div className="grid size-10 place-items-center overflow-hidden rounded-md bg-primary-soft text-primary">
              <BankBadge institution={a.institution} />
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {a.is_active ? "Ativa" : "Inativa"}
              </span>
              <RowActions onEdit={() => onEdit(a)} onDelete={() => onDelete(a)} />
            </div>
          </div>
          <h2 className="mt-5 font-semibold">{a.name}</h2>
          <p className="text-sm text-muted-foreground">{a.institution || "Conta pessoal"}</p>
          <p className="mt-4 font-mono text-2xl tabular-nums">
            {formatCurrency(a.balance, a.currency)}
          </p>
          {a.currency !== "BRL" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {a.balanceBRL === null
                ? "Cotação indisponível hoje"
                : `${money.format(a.balanceBRL)} pela cotação${
                    rateDate
                      ? ` de ${dateFmt.format(new Date(`${rateDate}T12:00:00`))}`
                      : " do dia anterior"
                  }`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
function TransactionRows({
  transactions,
  accounts,
  categoryPath,
  centerName,
  onEditTx,
  onDeleteTx,
  onConfirmTx,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
  onEditTx?: (tx: Transaction) => void;
  onDeleteTx?: (tx: Transaction) => void;
  onConfirmTx?: (tx: Transaction) => void;
}) {
  return (
    <div className="divide-y divide-border">
      {transactions.map((tx) => {
        const positive = tx.transaction_type === "income";
        const provisioned = tx.status === "provisioned";
        const account = accounts.find((a) => a.id === tx.account_id);
        const currency = account?.currency || "BRL";
        return (
          <div
            key={tx.id}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[110px_1fr_1fr_auto_auto]",
              provisioned && "bg-muted/20",
            )}
          >
            <span className="hidden text-xs text-muted-foreground sm:block">
              {dateFmt.format(new Date(`${tx.transaction_date}T12:00:00`))}
            </span>
            <div>
              <p className="text-sm font-medium">
                {tx.description}
                {provisioned && (
                  <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-normal text-amber-600">
                    Previsto
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground sm:hidden">
                {dateFmt.format(new Date(`${tx.transaction_date}T12:00:00`))}
              </p>
            </div>
            <div className="hidden text-xs text-muted-foreground sm:block">
              {tx.transaction_type === "transfer" ? "Transferência" : categoryPath(tx.category_id)}{" "}
              · {account?.name}
              {tx.transaction_type !== "transfer" && (
                <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary">
                  {centerName(tx.cost_center_id)}
                </span>
              )}
            </div>
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                positive
                  ? "text-income"
                  : tx.transaction_type === "expense"
                    ? "text-expense"
                    : "text-foreground",
              )}
            >
              {positive ? "+" : tx.transaction_type === "expense" ? "−" : ""}
              {formatCurrency(Number(tx.amount), currency)}
            </span>
            <div className="flex items-center gap-1">
              {provisioned && onConfirmTx && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Confirmar"
                  className="text-income"
                  onClick={() => onConfirmTx(tx)}
                >
                  <Check className="size-4" />
                </Button>
              )}
              {onEditTx && onDeleteTx && (
                <RowActions onEdit={() => onEditTx(tx)} onDelete={() => onDeleteTx(tx)} />
              )}
            </div>
          </div>
        );
      })}
      {!transactions.length && (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Nenhum lançamento neste período.
        </p>
      )}
    </div>
  );
}
function Transactions({
  transactions,
  accounts,
  categoryPath,
  centerName,
  onAdd,
  onEditTx,
  onDeleteTx,
  onConfirmTx,
}: any) {
  if (!transactions.length)
    return (
      <Empty
        title="Registre a primeira movimentação"
        text="Adicione receitas, despesas ou transferências."
        onAdd={onAdd}
      />
    );
  const pendingCount = transactions.filter((t: Transaction) => t.status === "provisioned").length;
  return (
    <div className="space-y-3">
      {pendingCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {pendingCount} provisão{pendingCount === 1 ? "" : "ões"} aguardando confirmação.
        </p>
      )}
      <section className="rounded-lg border border-border bg-card">
        <TransactionRows
          transactions={transactions}
          accounts={accounts}
          categoryPath={categoryPath}
          centerName={centerName}
          onEditTx={onEditTx}
          onDeleteTx={onDeleteTx}
          onConfirmTx={onConfirmTx}
        />
      </section>
    </div>
  );
}
function CostCenters({ rows, onAdd, onEdit, onDelete }: any) {
  if (!rows.length)
    return (
      <Empty
        title="Separe por centro de custo"
        text="Crie centros como Studio 01, Apto Airbnb ou Pessoal e saiba de onde vem e para onde vai cada valor."
        onAdd={onAdd}
      />
    );
  const allCurrencies: string[] = Array.from(
    new Set<string>(rows.flatMap((r: any) => r.currencies as string[])),
  ).sort((a: string, b: string) => (a === "BRL" ? -1 : b === "BRL" ? 1 : a.localeCompare(b)));
  const totalsByCurrency = allCurrencies.map((c) => ({
    currency: c,
    income: rows.reduce((s: number, r: any) => s + (r.income[c] ?? 0), 0),
    expense: rows.reduce((s: number, r: any) => s + (r.expense[c] ?? 0), 0),
  }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {totalsByCurrency.map((t) => (
          <div key={t.currency} className="contents">
            <Metric
              label={`Receitas alocadas${t.currency !== "BRL" ? ` (${t.currency})` : ""}`}
              value={t.income}
              tone="positive"
              currency={t.currency}
            />
            <Metric
              label={`Despesas alocadas${t.currency !== "BRL" ? ` (${t.currency})` : ""}`}
              value={t.expense}
              tone="negative"
              currency={t.currency}
            />
            <Metric
              label={`Resultado${t.currency !== "BRL" ? ` (${t.currency})` : ""}`}
              value={t.income - t.expense}
              tone={t.income - t.expense >= 0 ? "positive" : "negative"}
              currency={t.currency}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r: any) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary">
                <Building2 />
              </div>
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {centerTypeLabel[r.center_type] ?? "Outro"}
                </span>
                {r.id !== "none" && (
                  <RowActions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />
                )}
              </div>
            </div>
            <h2 className="mt-5 font-semibold">{r.name}</h2>
            <p className="text-xs text-muted-foreground">
              {r.description || `${r.count} lançamento${r.count === 1 ? "" : "s"}`}
            </p>
            <div className="mt-4 space-y-2 text-sm">
              {r.currencies.length ? (
                r.currencies.map((c: string) => (
                  <dl
                    key={c}
                    className="space-y-1 border-t border-border pt-2 first:border-0 first:pt-0"
                  >
                    {r.currencies.length > 1 && (
                      <p className="text-xs font-medium text-muted-foreground">{c}</p>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Receitas</dt>
                      <dd className="font-mono tabular-nums text-income">
                        {formatCurrency(r.income[c] ?? 0, c)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Despesas</dt>
                      <dd className="font-mono tabular-nums text-expense">
                        {formatCurrency(r.expense[c] ?? 0, c)}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1">
                      <dt className="text-muted-foreground">Resultado</dt>
                      <dd
                        className={cn(
                          "font-mono tabular-nums",
                          (r.income[c] ?? 0) - (r.expense[c] ?? 0) >= 0
                            ? "text-income"
                            : "text-expense",
                        )}
                      >
                        {formatCurrency((r.income[c] ?? 0) - (r.expense[c] ?? 0), c)}
                      </dd>
                    </div>
                  </dl>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Sem lançamentos</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Categories({
  categories,
  onAdd,
  onEdit,
  onDelete,
}: {
  categories: Category[];
  onAdd: () => void;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  if (!categories.length)
    return (
      <Empty
        title="Organize seus lançamentos"
        text="Crie grupos e subgrupos sem limite de níveis."
        onAdd={onAdd}
      />
    );
  const roots = categories.filter((c) => !c.parent_id);
  const Branch = ({ c, depth = 0 }: { c: Category; depth?: number }) => (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          {Array.from({ length: depth }).map((_, index) => (
            <span key={index} className="w-3" />
          ))}
          <ChevronRight className="size-4 text-muted-foreground" />
          {c.name}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-xs",
            c.category_type === "income"
              ? "bg-income-soft text-income"
              : "bg-expense-soft text-expense",
          )}
        >
          {c.category_type === "income" ? "Receita" : "Despesa"}
        </span>
        <RowActions onEdit={() => onEdit(c)} onDelete={() => onDelete(c)} />
      </div>
      {categories
        .filter((x) => x.parent_id === c.id)
        .map((child) => (
          <Branch key={child.id} c={child} depth={depth + 1} />
        ))}
    </>
  );
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {roots.map((c) => (
        <Branch key={c.id} c={c} />
      ))}
    </div>
  );
}
function Assets({ assets, totals, onAdd, onEdit, onDelete }: any) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Ativos" value={totals.assetTotal} tone="positive" />
        <Metric label="Passivos" value={totals.liabilityTotal} tone="negative" />
        <Metric label="Patrimônio líquido" value={totals.assetTotal - totals.liabilityTotal} />
      </div>
      {assets.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {assets.map((a: Asset) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-5"
            >
              <div>
                <p className="font-semibold">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.asset_class}</p>
              </div>
              <div className="ml-auto text-right">
                <p
                  className={cn(
                    "font-mono tabular-nums",
                    a.asset_type === "asset" ? "text-income" : "text-expense",
                  )}
                >
                  {money.format(Number(a.value))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.asset_type === "asset" ? "Ativo" : "Passivo"}
                </p>
              </div>
              <RowActions onEdit={() => onEdit(a)} onDelete={() => onDelete(a)} />
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Monte seu balanço patrimonial"
          text="Cadastre seus bens, investimentos e dívidas."
          onAdd={onAdd}
        />
      )}
    </div>
  );
}

function Settings() {
  const [telegramUsername, setTelegramUsername] = useState("");
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("telegram_username, telegram_chat_id")
        .maybeSingle();
      setTelegramUsername(data?.telegram_username ?? "");
      setLinked(!!data?.telegram_chat_id);
      setLoading(false);
    })();
  }, []);

  async function saveTelegramUsername() {
    setSaving(true);
    const clean = telegramUsername.trim().replace(/^@/, "");
    const { error } = await supabase
      .from("profiles")
      .update({ telegram_username: clean || null })
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTelegramUsername(clean);
    toast.success("Usuário do Telegram salvo. Agora mande uma mensagem para o bot pra vincular.");
  }

  async function setupWebhook() {
    setRegistering(true);
    try {
      const { registerTelegramWebhook } = await import("@/lib/telegram.functions");
      const { webhookUrl } = await registerTelegramWebhook();
      toast.success(`Webhook registrado: ${webhookUrl}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao registrar o webhook.");
    } finally {
      setRegistering(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando configurações…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <Send className="size-6 text-primary" />
          <div>
            <h2 className="font-semibold">Notificações por Telegram</h2>
            <p className="text-xs text-muted-foreground">
              Todo dia de manhã o bot manda os gastos detectados no dia anterior — responda a
              mensagem descrevendo as categorias e eu categorizo pra você.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Seu usuário no Telegram
            </span>
            <Input
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder="@seu_usuario"
            />
          </label>
          <Button onClick={() => void saveTelegramUsername()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}Salvar
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Status: {linked ? "✅ vinculado ao Telegram" : "⏳ ainda não vinculado"}
          {!linked &&
            " — depois de salvar o usuário, abra o bot no Telegram e mande qualquer mensagem pra vincular."}
        </p>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Administração (uma vez, após configurar o bot)
          </summary>
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void setupWebhook()}
              disabled={registering}
            >
              {registering ? <Loader2 className="animate-spin" /> : null}Registrar webhook do
              Telegram
            </Button>
          </div>
        </details>
      </section>
    </div>
  );
}
