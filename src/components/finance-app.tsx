import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  CalendarClock,
  Check,
  CreditCard,
  Download,
  FileUp,
  ChevronRight,
  CircleDollarSign,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Send,
  Settings as SettingsIcon,
  Smartphone,
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
import {
  MultiSelectFilter,
  PeriodFilter,
  type Period,
  type PeriodPreset,
} from "@/components/ui/filters";
import { CategoryCombobox } from "@/components/ui/category-combobox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { StatementImport } from "@/components/statement-import";
import { CreditCards } from "@/components/credit-cards";
import { BankConnections } from "@/components/bank-connections";
import { getDailyRates } from "@/lib/rates.functions";
import { BANKS, bankByName, initialsFor } from "@/lib/banks";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
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
const sortCurrencyKeys = (keys: string[]) =>
  [...keys].sort((a, b) => (a === "BRL" ? -1 : b === "BRL" ? 1 : a.localeCompare(b)));
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

function sumTransactionsByCurrency(
  items: Transaction[],
  currencyOf: (accountId: string | null) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of items) {
    const c = currencyOf(t.account_id);
    out[c] = (out[c] ?? 0) + Number(t.amount);
  }
  return out;
}

// Usado tanto pela aba de Centro de custo (todo o histórico) quanto pelo
// dashboard (recalculado a cada troca do filtro de período).
function buildCenterSummary(
  costCenters: CostCenter[],
  transactions: Transaction[],
  currencyOf: (accountId: string | null) => string,
) {
  const rows = costCenters.map((center) => {
    const own = transactions.filter(
      (t) => t.cost_center_id === center.id && t.transaction_type !== "transfer",
    );
    const income = sumTransactionsByCurrency(
      own.filter((t) => t.transaction_type === "income"),
      currencyOf,
    );
    const expense = sumTransactionsByCurrency(
      own.filter((t) => t.transaction_type === "expense"),
      currencyOf,
    );
    const currencies = sortCurrencyKeys(
      Array.from(new Set([...Object.keys(income), ...Object.keys(expense)])),
    );
    return { ...center, income, expense, currencies, count: own.length };
  });
  const orphan = transactions.filter((t) => !t.cost_center_id && t.transaction_type !== "transfer");
  if (orphan.length) {
    const income = sumTransactionsByCurrency(
      orphan.filter((t) => t.transaction_type === "income"),
      currencyOf,
    );
    const expense = sumTransactionsByCurrency(
      orphan.filter((t) => t.transaction_type === "expense"),
      currencyOf,
    );
    const currencies = sortCurrencyKeys(
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
}

// Árvore de categorias com totais por moeda: cada nó soma seus próprios
// lançamentos ("own") e, separadamente, o total acumulado com os filhos
// ("total") — é o que permite expandir uma categoria-pai e ver o total dela
// se abrir em subcategorias, sem perder o valor lançado direto nela.
// Recalculado pelo dashboard a cada troca do filtro de período.
function buildCategoryReport(
  categories: Category[],
  transactions: Transaction[],
  currencyOf: (accountId: string | null) => string,
): { roots: CategoryNode[]; uncategorized: CategoryNode["own"] } {
  const byId = new Map<string, CategoryNode>();
  for (const c of categories) {
    byId.set(c.id, {
      id: c.id,
      name: c.name,
      category_type: c.category_type,
      own: { income: {}, expense: {}, count: 0 },
      total: { income: {}, expense: {}, count: 0 },
      children: [],
    });
  }
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
  for (const t of transactions) {
    if (t.transaction_type === "transfer" || !t.category_id) continue;
    const node = byId.get(t.category_id);
    if (!node) continue;
    const bucket = t.transaction_type === "income" ? node.own.income : node.own.expense;
    const currency = currencyOf(t.account_id);
    bucket[currency] = (bucket[currency] ?? 0) + Number(t.amount);
    node.own.count += 1;
  }
  for (const [id, node] of byId) {
    const parentId = parentOf.get(id);
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    }
  }
  const computed = new Set<string>();
  function computeTotal(node: CategoryNode) {
    if (computed.has(node.id)) return;
    computed.add(node.id);
    const total = {
      income: { ...node.own.income },
      expense: { ...node.own.expense },
      count: node.own.count,
    };
    for (const child of node.children) {
      computeTotal(child);
      for (const [cur, val] of Object.entries(child.total.income))
        total.income[cur] = (total.income[cur] ?? 0) + val;
      for (const [cur, val] of Object.entries(child.total.expense))
        total.expense[cur] = (total.expense[cur] ?? 0) + val;
      total.count += child.total.count;
    }
    node.total = total;
  }
  for (const node of byId.values()) computeTotal(node);
  const roots = Array.from(byId.values())
    .filter((n) => {
      const parentId = parentOf.get(n.id);
      return !parentId || !byId.has(parentId);
    })
    .sort((a, b) => b.total.count - a.total.count);

  const uncategorizedTx = transactions.filter(
    (t) => !t.category_id && t.transaction_type !== "transfer",
  );
  const uncategorized = {
    income: sumTransactionsByCurrency(
      uncategorizedTx.filter((t) => t.transaction_type === "income"),
      currencyOf,
    ),
    expense: sumTransactionsByCurrency(
      uncategorizedTx.filter((t) => t.transaction_type === "expense"),
      currencyOf,
    ),
    count: uncategorizedTx.length,
  };

  return { roots, uncategorized };
}
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
  const continueAfterRef = useRef(false);
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
        supabase.from("profiles").select("display_name, dashboard_filters").maybeSingle(),
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
    const savedFilters = profile.data?.dashboard_filters as {
      currency?: string;
      period?: Period;
    } | null;
    if (savedFilters) {
      setDashboardCurrencyFilterRaw(savedFilters.currency ?? "all");
      setDashboardPeriodRaw(savedFilters.period ?? { from: "", to: "" });
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const [rates, setRates] = useState<Record<string, number>>({ BRL: 1 });
  const [rateDate, setRateDate] = useState("");

  // Filtro de moeda/período do dashboard: persistido em profiles.dashboard_filters
  // pra reaparecer sozinho na próxima sessão, em vez de sempre voltar pro
  // padrão ("Todas as moedas" / "Todo o período").
  const [dashboardCurrencyFilter, setDashboardCurrencyFilterRaw] = useState<string>("all");
  const [dashboardPeriod, setDashboardPeriodRaw] = useState<Period>({ from: "", to: "" });
  async function persistDashboardFilters(next: { currency: string; period: Period }) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    await supabase.from("profiles").update({ dashboard_filters: next }).eq("id", userId);
  }
  function setDashboardCurrencyFilter(value: string) {
    setDashboardCurrencyFilterRaw(value);
    void persistDashboardFilters({ currency: value, period: dashboardPeriod });
  }
  function setDashboardPeriod(value: Period) {
    setDashboardPeriodRaw(value);
    void persistDashboardFilters({ currency: dashboardCurrencyFilter, period: value });
  }
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
  // provisões (previsões ainda não confirmadas) de contas reportáveis — usadas
  // só pelo dashboard de previsão (saldo projetado), nunca no saldo/relatórios.
  const reportableProvisions = useMemo(
    () =>
      transactions.filter(
        (t) => t.status === "provisioned" && reportableAccountIds.has(t.account_id),
      ),
    [transactions, reportableAccountIds],
  );
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
    const assetTotal = assets
      .filter((a) => a.asset_type === "asset")
      .reduce((s, a) => s + Number(a.value), 0);
    const liabilityTotal = assets
      .filter((a) => a.asset_type === "liability")
      .reduce((s, a) => s + Number(a.value), 0);
    const reportableBalances = balanceByAccount.filter((a) => a.is_active);
    const balanceCurrencies = sortCurrencyKeys(
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
      balanceByCurrency,
      missingRateCurrencies,
      balance: reportableBalances.reduce((s, a) => s + (a.balanceBRL ?? 0), 0),
      assetTotal,
      liabilityTotal,
    };
  }, [assets, balanceByAccount]);

  const chartDataByCurrency = useMemo(() => {
    const currencies = sortCurrencyKeys(
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

  // Usada pela aba de Centro de custo (todo o histórico); o dashboard tem a
  // sua própria versão recalculada a cada troca do filtro de período.
  const centerSummary = useMemo(
    () => buildCenterSummary(costCenters, reportableTransactions, currencyOf),
    [costCenters, reportableTransactions],
  );

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
    continueAfterRef.current = false;
    setModal(type);
  }
  function edit(type: Exclude<Modal, null>, row: any) {
    setError("");
    continueAfterRef.current = false;
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
    // Detectar o botão clicado via SubmitEvent.submitter é frágil entre
    // navegadores; o onClick de cada botão (que roda antes do submit) marca
    // a intenção aqui de forma explícita.
    const continueAfter = continueAfterRef.current;
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
      else if (continueAfter) {
        toast.success(`${rows.length} provisões criadas. Pronto para o próximo.`);
        setForm(emptyForm());
        await load();
      } else {
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
                  provisions={reportableProvisions}
                  accounts={accounts}
                  categories={categories}
                  costCenters={costCenters}
                  categoryPath={categoryPath}
                  centerName={centerName}
                  currencyOf={currencyOf}
                  currencyFilter={dashboardCurrencyFilter}
                  onCurrencyFilterChange={setDashboardCurrencyFilter}
                  period={dashboardPeriod}
                  onPeriodChange={setDashboardPeriod}
                  onEditTx={(tx: Transaction) => edit("transaction", tx)}
                  onDeleteTx={(tx: Transaction) => remove("transaction", tx.id, tx.description)}
                  onConfirmTx={openConfirmProvision}
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
                  categories={categories}
                  costCenters={costCenters}
                  categoryPath={categoryPath}
                  centerName={centerName}
                  onAdd={() => open("transaction")}
                  onEditTx={(tx: Transaction) => edit("transaction", tx)}
                  onDeleteTx={(tx: Transaction) => remove("transaction", tx.id, tx.description)}
                  onConfirmTx={openConfirmProvision}
                  onBulkUpdated={load}
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
              {view === "settings" && <Settings accounts={accounts} />}
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
                    <CategoryCombobox
                      categories={categories}
                      categoryPath={categoryPath}
                      value={form.category_id}
                      onValueChange={(id) => setForm((f) => ({ ...f, category_id: id }))}
                      placeholder="Sem categoria"
                      emptyOptionLabel="Sem categoria"
                      filter={(c) => c.category_type === form.transaction_type}
                    />
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
                <Button
                  type="submit"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    continueAfterRef.current = true;
                  }}
                >
                  {saving ? "Salvando…" : "Incluir e continuar"}
                </Button>
              )}
              <Button
                type="submit"
                disabled={saving}
                onClick={() => {
                  continueAfterRef.current = false;
                }}
              >
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
  provisions,
  accounts,
  categories,
  costCenters,
  categoryPath,
  centerName,
  currencyOf,
  currencyFilter,
  onCurrencyFilterChange,
  period,
  onPeriodChange,
  onEditTx,
  onDeleteTx,
  onConfirmTx,
}: {
  totals: {
    balanceByCurrency: { currency: string; balance: number; balanceBRL: number | null }[];
    missingRateCurrencies: string[];
    balance: number;
    assetTotal: number;
    liabilityTotal: number;
  };
  rateDate: string;
  chartDataByCurrency: {
    currency: string;
    data: { month: string; receita: number; despesa: number }[];
  }[];
  transactions: Transaction[];
  provisions: Transaction[];
  accounts: Account[];
  categories: Category[];
  costCenters: CostCenter[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
  currencyOf: (accountId: string | null) => string;
  currencyFilter: string;
  onCurrencyFilterChange: (value: string) => void;
  period: Period;
  onPeriodChange: (value: Period) => void;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
  onConfirmTx: (tx: Transaction) => void;
}) {
  const periodPresets: PeriodPreset[] = [
    {
      label: "Hoje",
      range: () => {
        const d = isoDate(new Date());
        return { from: d, to: d };
      },
    },
    {
      label: "Essa semana",
      range: () => {
        const today = new Date();
        const day = today.getDay();
        const start = new Date(today);
        start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
        return { from: isoDate(start), to: isoDate(today) };
      },
    },
    {
      label: "Esse mês",
      range: () => {
        const today = new Date();
        return {
          from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
          to: isoDate(today),
        };
      },
    },
    {
      label: "Esse ano",
      range: () => {
        const today = new Date();
        return { from: isoDate(new Date(today.getFullYear(), 0, 1)), to: isoDate(today) };
      },
    },
  ];

  // Todas as seções que somam receita/despesa (cards, gráfico de tendência
  // continua fixo em 6 meses, mas o resto sim) recalculam a partir daqui —
  // o saldo (ponto no tempo) fica de fora, não faz sentido "saldo de hoje" vs.
  // "saldo do ano" no jeito que o app modela conta.
  const periodTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        if (period.from && tx.transaction_date < period.from) return false;
        if (period.to && tx.transaction_date > period.to) return false;
        return true;
      }),
    [transactions, period],
  );

  const periodByCurrency = useMemo(() => {
    const income = sumTransactionsByCurrency(
      periodTransactions.filter((t) => t.transaction_type === "income"),
      currencyOf,
    );
    const expense = sumTransactionsByCurrency(
      periodTransactions.filter((t) => t.transaction_type === "expense"),
      currencyOf,
    );
    const currencies = sortCurrencyKeys(
      Array.from(
        new Set([
          ...Object.keys(income),
          ...Object.keys(expense),
          ...accounts.filter((a) => a.is_active).map((a) => a.currency || "BRL"),
        ]),
      ),
    );
    return currencies.map((currency) => ({
      currency,
      income: income[currency] ?? 0,
      expense: expense[currency] ?? 0,
      result: (income[currency] ?? 0) - (expense[currency] ?? 0),
    }));
  }, [periodTransactions, accounts]);

  const periodCenterSummary = useMemo(
    () => buildCenterSummary(costCenters, periodTransactions, currencyOf),
    [costCenters, periodTransactions],
  );

  const periodCategoryReport = useMemo(
    () => buildCategoryReport(categories, periodTransactions, currencyOf),
    [categories, periodTransactions],
  );

  const availableCurrencies = sortCurrencyKeys(
    Array.from(
      new Set<string>([
        ...totals.balanceByCurrency.map((c) => c.currency),
        ...periodByCurrency.map((c) => c.currency),
      ]),
    ),
  );
  const showCurrency = (c: string) => currencyFilter === "all" || currencyFilter === c;
  const isAll = currencyFilter === "all";

  const filteredBalanceByCurrency = totals.balanceByCurrency.filter((c) =>
    showCurrency(c.currency),
  );
  const filteredByCurrency = periodByCurrency.filter((c) => showCurrency(c.currency));
  const filteredChartData = chartDataByCurrency.filter((cd) => showCurrency(cd.currency));
  const filteredTransactions = periodTransactions.filter(
    (tx) =>
      isAll || (accounts.find((a) => a.id === tx.account_id)?.currency || "BRL") === currencyFilter,
  );
  const filteredCenterSummary = periodCenterSummary
    .map((r) => ({ ...r, currencies: r.currencies.filter(showCurrency) }))
    .filter((r) => r.currencies.length > 0);

  // Saldo projetado: saldo atual de cada moeda + soma acumulada das
  // provisões (previsões ainda não confirmadas) de hoje em diante, um ponto
  // por data com provisão — dá pra ver pra onde o saldo tende a ir.
  const projectedBalanceByCurrency = useMemo(() => {
    const todayIso = isoDate(new Date());
    const future = provisions
      .filter((t) => t.transaction_date >= todayIso && t.transaction_type !== "transfer")
      .map((t) => ({
        date: t.transaction_date,
        currency: currencyOf(t.account_id),
        delta: t.transaction_type === "income" ? Number(t.amount) : -Number(t.amount),
      }));
    const currencies = sortCurrencyKeys(
      Array.from(
        new Set([
          ...totals.balanceByCurrency.map((c) => c.currency),
          ...future.map((f) => f.currency),
        ]),
      ),
    );
    return currencies
      .map((currency) => {
        const startBalance =
          totals.balanceByCurrency.find((c) => c.currency === currency)?.balance ?? 0;
        const byDate = new Map<string, number>();
        for (const ev of future.filter((f) => f.currency === currency)) {
          byDate.set(ev.date, (byDate.get(ev.date) ?? 0) + ev.delta);
        }
        const dates = Array.from(byDate.keys()).sort();
        let running = startBalance;
        const points = [{ date: "Hoje", balance: running }];
        for (const date of dates) {
          running += byDate.get(date)!;
          points.push({ date: date.split("-").reverse().join("/"), balance: running });
        }
        return { currency, points, hasFuture: dates.length > 0 };
      })
      .filter((p) => p.hasFuture);
  }, [provisions, totals.balanceByCurrency, currencyOf]);
  const filteredProjectedBalance = projectedBalanceByCurrency.filter((p) =>
    showCurrency(p.currency),
  );

  // Painel de previsões: "vencidas" (data já passou e ainda não foi
  // confirmada — precisa de atenção) e "este mês" (todas as previsões com
  // data dentro do mês corrente, incluindo as já vencidas que caem nele).
  const [expandedForecast, setExpandedForecast] = useState<"overdue" | "month" | null>(null);
  const matchesCurrency = (t: Transaction) =>
    isAll || (accounts.find((a) => a.id === t.account_id)?.currency || "BRL") === currencyFilter;
  const forecast = useMemo(() => {
    const today = new Date();
    const todayIso = isoDate(today);
    const monthStartIso = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
    const monthEndIso = isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    const byDateAsc = (a: Transaction, b: Transaction) =>
      a.transaction_date < b.transaction_date
        ? -1
        : a.transaction_date > b.transaction_date
          ? 1
          : 0;
    const overdue = provisions.filter((t) => t.transaction_date < todayIso).sort(byDateAsc);
    const thisMonth = provisions
      .filter((t) => t.transaction_date >= monthStartIso && t.transaction_date <= monthEndIso)
      .sort(byDateAsc);
    return { overdue, thisMonth };
  }, [provisions]);
  const filteredOverdue = forecast.overdue.filter(matchesCurrency);
  const filteredThisMonth = forecast.thisMonth.filter(matchesCurrency);

  const primaryBalance = isAll
    ? {
        label: "Saldo total",
        value: totals.balance,
        currency: "BRL",
        note: totals.missingRateCurrencies.length
          ? `Cotação indisponível hoje para ${totals.missingRateCurrencies.join(", ")} — saldo dessas contas não incluído`
          : undefined,
      }
    : (() => {
        const c = totals.balanceByCurrency.find((x) => x.currency === currencyFilter);
        return {
          label: `Saldo total (${currencyFilter})`,
          value: c?.balance ?? 0,
          currency: currencyFilter,
          note: undefined,
        };
      })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <PeriodFilter
          from={period.from}
          to={period.to}
          onChange={onPeriodChange}
          presets={periodPresets}
          placeholder="Todo o período"
        />
        <select
          className={cn(selectClass, "h-9 w-auto")}
          value={currencyFilter}
          onChange={(e) => onCurrencyFilterChange(e.target.value)}
        >
          <option value="all">Todas as moedas</option>
          {availableCurrencies.map((c) => (
            <option key={c} value={c}>
              Só {c}
            </option>
          ))}
        </select>
      </div>

      {/* Saldo em destaque + receita/despesa/resultado do período num único
          painel, em vez de um card por número — é o que a maioria dos
          dashboards financeiros atuais (Mercury, Copilot, Monarch) faz pra
          não competir visualmente com o saldo, que é o número mais importante. */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {primaryBalance.label}
            </p>
            <p className="mt-1.5 font-mono text-4xl font-semibold tabular-nums">
              {formatCurrency(primaryBalance.value, primaryBalance.currency)}
            </p>
            {primaryBalance.note && (
              <p className="mt-2 max-w-sm text-xs text-muted-foreground">{primaryBalance.note}</p>
            )}
          </div>
          {filteredByCurrency.length > 0 && (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {filteredByCurrency.map((c) => (
                <div key={c.currency} className="flex gap-6">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Receita{c.currency !== "BRL" ? ` (${c.currency})` : ""}
                    </p>
                    <p className="mt-1 font-mono text-lg font-medium tabular-nums text-income">
                      {formatCurrency(c.income, c.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Despesa{c.currency !== "BRL" ? ` (${c.currency})` : ""}
                    </p>
                    <p className="mt-1 font-mono text-lg font-medium tabular-nums text-expense">
                      {formatCurrency(c.expense, c.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Resultado{c.currency !== "BRL" ? ` (${c.currency})` : ""}
                    </p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-lg font-medium tabular-nums",
                        c.result >= 0 ? "text-income" : "text-expense",
                      )}
                    >
                      {formatCurrency(c.result, c.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {isAll && filteredBalanceByCurrency.some((c) => c.currency !== "BRL") && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            {filteredBalanceByCurrency
              .filter((c) => c.currency !== "BRL")
              .map((c) => (
                <span
                  key={c.currency}
                  className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground"
                  title={
                    c.balanceBRL === null
                      ? "Cotação indisponível hoje — não incluído no saldo total"
                      : `${money.format(c.balanceBRL)} pela cotação${rateDate ? ` de ${dateFmt.format(new Date(`${rateDate}T12:00:00`))}` : " do dia anterior"}`
                  }
                >
                  Saldo {c.currency}: {formatCurrency(c.balance, c.currency)}
                  {c.balanceBRL === null && " · cotação indisponível"}
                </span>
              ))}
          </div>
        )}
      </section>

      {/* Previsões: o que já venceu (precisa de atenção) e o que ainda vem
          este mês — clicar expande a lista, e cada lançamento dá pra
          confirmar ali mesmo ou abrir pra editar. */}
      {(filteredOverdue.length > 0 || filteredThisMonth.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ForecastCard
            title="Previsões vencidas"
            tone="danger"
            items={filteredOverdue}
            expanded={expandedForecast === "overdue"}
            onToggle={() => setExpandedForecast((v) => (v === "overdue" ? null : "overdue"))}
            accounts={accounts}
            categoryPath={categoryPath}
            centerName={centerName}
            currencyOf={currencyOf}
            onEditTx={onEditTx}
            onDeleteTx={onDeleteTx}
            onConfirmTx={onConfirmTx}
          />
          <ForecastCard
            title="Previsões deste mês"
            tone="default"
            items={filteredThisMonth}
            expanded={expandedForecast === "month"}
            onToggle={() => setExpandedForecast((v) => (v === "month" ? null : "month"))}
            accounts={accounts}
            categoryPath={categoryPath}
            centerName={centerName}
            currencyOf={currencyOf}
            onEditTx={onEditTx}
            onDeleteTx={onDeleteTx}
            onConfirmTx={onConfirmTx}
          />
        </div>
      )}

      {filteredChartData.map((cd) => (
        <section key={cd.currency} className="rounded-lg border border-border bg-card p-5">
          <div>
            <h2 className="font-semibold">
              Receita × despesa{cd.currency !== "BRL" ? ` — ${cd.currency}` : ""}
            </h2>
            <p className="text-xs text-muted-foreground">Últimos seis meses</p>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={cd.data.map((d) => ({ ...d, resultado: d.receita - d.despesa }))}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={55} />
                <Tooltip formatter={(v) => formatCurrency(Number(v), cd.currency)} />
                <Bar dataKey="receita" name="Receita" fill="var(--income)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill="var(--expense)" radius={[3, 3, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="resultado"
                  name="Resultado"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      ))}

      {filteredProjectedBalance.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <div>
            <h2 className="font-semibold">Saldo projetado</h2>
            <p className="text-xs text-muted-foreground">
              Saldo atual + provisões futuras, a partir de hoje
            </p>
          </div>
          <div className="divide-y divide-border">
            {filteredProjectedBalance.map((p, index) => (
              <div key={p.currency} className={index === 0 ? "pt-2" : "pt-5"}>
                {p.currency !== "BRL" && (
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{p.currency}</p>
                )}
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={p.points}>
                      <defs>
                        <linearGradient id={`projected-${p.currency}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        interval={Math.max(0, Math.ceil(p.points.length / 8) - 1)}
                      />
                      <YAxis tickLine={false} axisLine={false} width={70} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v), p.currency)} />
                      <Area
                        type="monotone"
                        dataKey="balance"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        fill={`url(#projected-${p.currency})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Movimentações recentes</h2>
        </div>
        <TransactionRows
          transactions={filteredTransactions.slice(0, 6)}
          accounts={accounts}
          categoryPath={categoryPath}
          centerName={centerName}
          onEditTx={onEditTx}
          onDeleteTx={onDeleteTx}
          onConfirmTx={onConfirmTx}
        />
      </section>
      <CategoryBreakdown
        categoryReport={periodCategoryReport}
        currencyFilter={currencyFilter}
        transactions={periodTransactions}
        accounts={accounts}
        categoryPath={categoryPath}
        centerName={centerName}
        onEditTx={onEditTx}
        onDeleteTx={onDeleteTx}
      />
      {filteredCenterSummary.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Resultado por centro de custo</h2>
            <p className="text-xs text-muted-foreground">Receitas e despesas alocadas, por moeda</p>
          </div>
          <div className="divide-y divide-border">
            {filteredCenterSummary.map((r) => (
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

function ForecastCard({
  title,
  tone,
  items,
  expanded,
  onToggle,
  accounts,
  categoryPath,
  centerName,
  currencyOf,
  onEditTx,
  onDeleteTx,
  onConfirmTx,
}: {
  title: string;
  tone: "danger" | "default";
  items: Transaction[];
  expanded: boolean;
  onToggle: () => void;
  accounts: Account[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
  currencyOf: (accountId: string | null) => string;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
  onConfirmTx: (tx: Transaction) => void;
}) {
  const sums = sumTransactionsByCurrency(items, currencyOf);
  const currencies = sortCurrencyKeys(Object.keys(sums));
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        disabled={!items.length}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-10 flex-none place-items-center rounded-full",
              tone === "danger"
                ? "bg-destructive-soft text-destructive"
                : "bg-primary-soft text-primary",
            )}
          >
            {tone === "danger" ? (
              <AlertTriangle className="size-5" />
            ) : (
              <CalendarClock className="size-5" />
            )}
          </span>
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">
              {items.length ? (
                <>
                  {items.length} lançamento{items.length === 1 ? "" : "s"} ·{" "}
                  {currencies.map((c) => formatCurrency(sums[c] ?? 0, c)).join(" · ")}
                </>
              ) : (
                "Nada por aqui"
              )}
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <ChevronRight
            className={cn(
              "size-4 flex-none text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>
      {expanded && items.length > 0 && (
        <div className="border-t border-border">
          <TransactionRows
            transactions={items}
            accounts={accounts}
            categoryPath={categoryPath}
            centerName={centerName}
            onEditTx={onEditTx}
            onDeleteTx={onDeleteTx}
            onConfirmTx={onConfirmTx}
          />
        </div>
      )}
    </section>
  );
}

type CategoryNode = {
  id: string;
  name: string;
  category_type: "income" | "expense" | null;
  own: { income: Record<string, number>; expense: Record<string, number>; count: number };
  total: { income: Record<string, number>; expense: Record<string, number>; count: number };
  children: CategoryNode[];
};

function CategoryAmounts({
  income,
  expense,
  currencyFilter,
}: {
  income: Record<string, number>;
  expense: Record<string, number>;
  currencyFilter: string;
}) {
  const currencies = sortCurrencyKeys(
    Array.from(new Set([...Object.keys(income), ...Object.keys(expense)])).filter(
      (c) => currencyFilter === "all" || c === currencyFilter,
    ),
  );
  if (!currencies.length)
    return <span className="text-xs text-muted-foreground">Sem lançamentos</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {currencies.map((c) => (
        <span key={c} className="whitespace-nowrap font-mono text-xs tabular-nums">
          {income[c] ? <span className="text-income">+{formatCurrency(income[c], c)}</span> : null}
          {income[c] && expense[c] ? " · " : ""}
          {expense[c] ? (
            <span className="text-expense">−{formatCurrency(expense[c], c)}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

// Linha recursiva do demonstrativo: clicar expande as subcategorias e, se a
// categoria tiver lançamentos lançados direto nela (não só nos filhos),
// mostra a lista deles ali mesmo — dá pra ir "descendo" até o lançamento.
function CategoryRow({
  node,
  depth,
  currencyFilter,
  transactions,
  accounts,
  categoryPath,
  centerName,
  onEditTx,
  onDeleteTx,
}: {
  node: CategoryNode;
  depth: number;
  currencyFilter: string;
  transactions: Transaction[];
  accounts: Account[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = node.children.length > 0 || node.own.count > 0;
  const ownTransactions = useMemo(() => {
    if (!node.own.count) return [];
    return transactions.filter((t) => {
      if (t.transaction_type === "transfer") return false;
      const matchesCategory =
        node.id === "__uncategorized__" ? !t.category_id : t.category_id === node.id;
      if (!matchesCategory) return false;
      if (currencyFilter === "all") return true;
      const currency = accounts.find((a) => a.id === t.account_id)?.currency || "BRL";
      return currency === currencyFilter;
    });
  }, [transactions, accounts, node.id, node.own.count, currencyFilter]);
  const children = useMemo(
    () => [...node.children].sort((a, b) => b.total.count - a.total.count),
    [node.children],
  );

  return (
    <div>
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 py-3 pr-5 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
        style={{ paddingLeft: `${20 + depth * 20}px` }}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {canExpand ? (
            <ChevronRight
              className={cn(
                "size-4 flex-none text-muted-foreground transition-transform",
                expanded && "rotate-90",
              )}
            />
          ) : (
            <span className="w-4 flex-none" />
          )}
          <span className="truncate">{node.name}</span>
          {node.category_type && (
            <span
              className={cn(
                "flex-none rounded-full px-2 py-0.5 text-xs",
                node.category_type === "income"
                  ? "bg-income-soft text-income"
                  : "bg-expense-soft text-expense",
              )}
            >
              {node.category_type === "income" ? "Receita" : "Despesa"}
            </span>
          )}
        </span>
        <CategoryAmounts
          income={node.total.income}
          expense={node.total.expense}
          currencyFilter={currencyFilter}
        />
      </button>
      {expanded && (
        <div className="border-t border-border/60">
          {children.map((child) => (
            <CategoryRow
              key={child.id}
              node={child}
              depth={depth + 1}
              currencyFilter={currencyFilter}
              transactions={transactions}
              accounts={accounts}
              categoryPath={categoryPath}
              centerName={centerName}
              onEditTx={onEditTx}
              onDeleteTx={onDeleteTx}
            />
          ))}
          {ownTransactions.length > 0 && (
            <div style={{ paddingLeft: `${depth * 20}px` }}>
              <TransactionRows
                transactions={ownTransactions}
                accounts={accounts}
                categoryPath={categoryPath}
                centerName={centerName}
                onEditTx={onEditTx}
                onDeleteTx={onDeleteTx}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryBreakdown({
  categoryReport,
  currencyFilter,
  transactions,
  accounts,
  categoryPath,
  centerName,
  onEditTx,
  onDeleteTx,
}: {
  categoryReport: {
    roots: CategoryNode[];
    uncategorized: {
      income: Record<string, number>;
      expense: Record<string, number>;
      count: number;
    };
  };
  currencyFilter: string;
  transactions: Transaction[];
  accounts: Account[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
}) {
  const roots = useMemo(
    () => [...categoryReport.roots].sort((a, b) => b.total.count - a.total.count),
    [categoryReport.roots],
  );
  const hasAnyData = roots.some((r) => r.total.count > 0) || categoryReport.uncategorized.count > 0;
  if (!hasAnyData) return null;

  const uncategorizedNode: CategoryNode = {
    id: "__uncategorized__",
    name: "Sem categoria",
    category_type: null,
    own: categoryReport.uncategorized,
    total: categoryReport.uncategorized,
    children: [],
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">Demonstrativo por categoria</h2>
        <p className="text-xs text-muted-foreground">
          Clique numa categoria pra ver subcategorias e lançamentos
        </p>
      </div>
      <div className="divide-y divide-border">
        {roots
          .filter((r) => r.total.count > 0)
          .map((root) => (
            <CategoryRow
              key={root.id}
              node={root}
              depth={0}
              currencyFilter={currencyFilter}
              transactions={transactions}
              accounts={accounts}
              categoryPath={categoryPath}
              centerName={centerName}
              onEditTx={onEditTx}
              onDeleteTx={onDeleteTx}
            />
          ))}
        {categoryReport.uncategorized.count > 0 && (
          <CategoryRow
            node={uncategorizedNode}
            depth={0}
            currencyFilter={currencyFilter}
            transactions={transactions}
            accounts={accounts}
            categoryPath={categoryPath}
            centerName={centerName}
            onEditTx={onEditTx}
            onDeleteTx={onDeleteTx}
          />
        )}
      </div>
    </section>
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
  selectedIds,
  onToggleSelect,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
  onEditTx?: (tx: Transaction) => void;
  onDeleteTx?: (tx: Transaction) => void;
  onConfirmTx?: (tx: Transaction) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, checked: boolean) => void;
}) {
  const selectable = !!selectedIds && !!onToggleSelect;
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
              selectable && "sm:grid-cols-[auto_110px_1fr_1fr_auto_auto]",
              provisioned && "bg-muted/20",
            )}
          >
            {selectable && (
              <input
                type="checkbox"
                className="hidden size-4 accent-[var(--primary)] sm:block"
                checked={selectedIds!.has(tx.id)}
                onChange={(e) => onToggleSelect!(tx.id, e.target.checked)}
                aria-label={`Selecionar ${tx.description}`}
              />
            )}
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
  categories,
  costCenters,
  categoryPath,
  centerName,
  onAdd,
  onEditTx,
  onDeleteTx,
  onConfirmTx,
  onBulkUpdated,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  costCenters: CostCenter[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
  onAdd: () => void;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
  onConfirmTx: (tx: Transaction) => void;
  onBulkUpdated: () => void;
}) {
  const [accountIds, setAccountIds] = useState<Set<string>>(new Set());
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set());
  const [costCenterIds, setCostCenterIds] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const categoryOptions = useMemo(
    () => [
      { id: "", label: "Sem categoria" },
      ...[...categories]
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
  const accountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((a) => ({ id: a.id, label: a.name })),
    [accounts],
  );

  const filtered = useMemo(
    () =>
      transactions.filter((tx) => {
        if (
          accountIds.size &&
          !accountIds.has(tx.account_id) &&
          !(tx.destination_account_id && accountIds.has(tx.destination_account_id))
        )
          return false;
        if (categoryIds.size && !categoryIds.has(tx.category_id ?? "")) return false;
        if (costCenterIds.size && !costCenterIds.has(tx.cost_center_id ?? "")) return false;
        if (period.from && tx.transaction_date < period.from) return false;
        if (period.to && tx.transaction_date > period.to) return false;
        return true;
      }),
    [transactions, accountIds, categoryIds, costCenterIds, period],
  );

  const hasActiveFilters =
    accountIds.size > 0 ||
    categoryIds.size > 0 ||
    costCenterIds.size > 0 ||
    !!period.from ||
    !!period.to;

  function clearFilters() {
    setAccountIds(new Set());
    setCategoryIds(new Set());
    setCostCenterIds(new Set());
    setPeriod({ from: "", to: "" });
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filtered.map((t) => t.id)) : new Set());
  }
  async function applyBulkCategory(categoryId: string) {
    // Transferências não podem ter categoria (restrição do banco) — ficam de
    // fora mesmo que estejam marcadas, em vez de travar a atualização toda.
    const ids = filtered
      .filter((t) => selectedIds.has(t.id) && t.transaction_type !== "transfer")
      .map((t) => t.id);
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: categoryId || null })
      .in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Categoria aplicada a ${ids.length} lançamento${ids.length === 1 ? "" : "s"}.`);
    setSelectedIds(new Set());
    onBulkUpdated();
  }
  async function applyBulkCostCenter(costCenterId: string) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("transactions")
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
    setSelectedIds(new Set());
    onBulkUpdated();
  }

  if (!transactions.length)
    return (
      <Empty
        title="Registre a primeira movimentação"
        text="Adicione receitas, despesas ou transferências."
        onAdd={onAdd}
      />
    );
  const pendingCount = filtered.filter((t) => t.status === "provisioned").length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
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
        <MultiSelectFilter
          label="Conta"
          options={accountOptions}
          selected={accountIds}
          onChange={setAccountIds}
          searchPlaceholder="Buscar conta…"
        />
        <PeriodFilter from={period.from} to={period.to} onChange={setPeriod} />
        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        )}
      </div>
      {pendingCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {pendingCount} provisão{pendingCount === 1 ? "" : "ões"} aguardando confirmação.
        </p>
      )}
      <section className="rounded-lg border border-border bg-card">
        <div className="hidden flex-wrap items-center gap-2 border-b border-border px-5 py-2 text-xs text-muted-foreground sm:flex">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))}
            onChange={(e) => toggleSelectAll(e.target.checked)}
            aria-label="Selecionar todos"
          />
          {selectedIds.size > 0 ? (
            <>
              <span>
                {selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}
              </span>
              <CategoryCombobox
                categories={categories}
                categoryPath={categoryPath}
                value=""
                onValueChange={(id) => void applyBulkCategory(id)}
                placeholder="Aplicar categoria aos selecionados"
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
        <TransactionRows
          transactions={filtered}
          accounts={accounts}
          categoryPath={categoryPath}
          centerName={centerName}
          onEditTx={onEditTx}
          onDeleteTx={onDeleteTx}
          onConfirmTx={onConfirmTx}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
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

type TelegramRecipientRow = Database["public"]["Tables"]["telegram_recipients"]["Row"];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function HelpTip({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 flex-none items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Ajuda"
        >
          <HelpCircle className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs leading-relaxed">{text}</PopoverContent>
    </Popover>
  );
}

function InstallAppSection() {
  const { installed, canPromptInstall, promptInstall } = useInstallPrompt();
  const [showSteps, setShowSteps] = useState(false);

  async function handleClick() {
    if (canPromptInstall) {
      await promptInstall();
      return;
    }
    setShowSteps((current) => !current);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Smartphone className="size-6 flex-none text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Instalar no celular</h2>
          <p className="text-xs text-muted-foreground">
            {installed
              ? "Você já está usando o Fluxora como app no celular. 🎉"
              : "Adicione o Fluxora na tela inicial do seu iPhone ou Android — abre em tela cheia, como um app de verdade."}
          </p>
        </div>
        {!installed && (
          <Button variant="outline" onClick={() => void handleClick()}>
            <Download />
            Instalar app
          </Button>
        )}
      </div>
      {showSteps && !installed && (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">📱 iPhone (Safari)</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Toque no ícone de Compartilhar (o quadrado com a seta pra cima).</li>
              <li>Escolha "Adicionar à Tela de Início".</li>
              <li>Toque em "Adicionar".</li>
            </ol>
          </div>
          <div>
            <p className="font-medium">🤖 Android (Chrome)</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Toque no menu (os três pontinhos, no canto superior).</li>
              <li>Escolha "Instalar app" ou "Adicionar à tela inicial".</li>
              <li>Confirme.</li>
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

function Settings({ accounts }: { accounts: Account[] }) {
  const [recipients, setRecipients] = useState<TelegramRecipientRow[]>([]);
  const [cards, setCards] = useState<{ id: string; name: string }[]>([]);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: recipientRows }, { data: cardRows }] = await Promise.all([
      supabase.from("telegram_recipients").select("*").order("created_at"),
      supabase.from("credit_cards").select("id, name").order("created_at"),
    ]);
    setRecipients(recipientRows ?? []);
    setCards(cardRows ?? []);
    try {
      const { getTelegramBotUsername } = await import("@/lib/telegram.functions");
      const { botUsername: username } = await getTelegramBotUsername();
      setBotUsername(username);
    } catch {
      setBotUsername(null);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function addRecipient() {
    if (!newLabel.trim()) return;
    setAdding(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("telegram_recipients").insert({
      user_id: auth.user?.id ?? "",
      label: newLabel.trim(),
      telegram_username: newUsername.trim() ? newUsername.trim().replace(/^@/, "") : null,
    });
    if (error) {
      setAdding(false);
      toast.error(error.message);
      return;
    }
    // Garante que o webhook está registrado sempre que um perfil é salvo —
    // idempotente (só reaponta pra mesma URL), então não tem risco em
    // repetir a cada perfil criado.
    await registerWebhook({ silent: true });
    setAdding(false);
    setNewLabel("");
    setNewUsername("");
    toast.success("Perfil criado — copie o link de convite abaixo e mande pra essa pessoa.");
    await load();
  }

  async function updateRecipient(id: string, patch: Partial<TelegramRecipientRow>) {
    setRecipients((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("telegram_recipients").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function deleteRecipient(id: string) {
    const { error } = await supabase.from("telegram_recipients").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRecipients((current) => current.filter((r) => r.id !== id));
  }

  async function registerWebhook({ silent }: { silent: boolean }) {
    setRegistering(true);
    try {
      const { registerTelegramWebhook } = await import("@/lib/telegram.functions");
      const { webhookUrl } = await registerTelegramWebhook();
      if (!silent) toast.success(`Webhook registrado: ${webhookUrl}`);
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
      <InstallAppSection />

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <Send className="size-6 text-primary" />
          <div>
            <h2 className="font-semibold">Notificações por Telegram</h2>
            <p className="text-xs text-muted-foreground">
              Cadastre um perfil por pessoa que deve receber os gastos detectados automaticamente —
              cada um escolhe a frequência e quais contas/cartões acompanha.
            </p>
          </div>
        </div>

        <ol className="mt-4 list-decimal space-y-1 rounded-md bg-muted/50 p-3 pl-8 text-xs text-muted-foreground">
          <li>Preencha o nome da pessoa abaixo e clique em "Adicionar perfil".</li>
          <li>Copie o link de convite que aparece no perfil recém-criado.</li>
          <li>Mande esse link pra pessoa por WhatsApp, SMS ou qualquer outro app.</li>
          <li>Ela toca no link — o Telegram abre sozinho e já manda a mensagem inicial.</li>
          <li>
            Pronto: o perfil vira "✅ vinculado" e ela passa a receber os relatórios conforme a
            frequência escolhida.
          </li>
        </ol>

        <div className="mt-4 space-y-3">
          {recipients.map((recipient) => (
            <RecipientCard
              key={recipient.id}
              recipient={recipient}
              accounts={accounts}
              cards={cards}
              botUsername={botUsername}
              onChange={(patch) => void updateRecipient(recipient.id, patch)}
              onDelete={() => void deleteRecipient(recipient.id)}
            />
          ))}
          {!recipients.length && (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum perfil cadastrado ainda.
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1.5 text-sm">
            <span className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
              Nome
              <HelpTip text="Só um apelido pra você identificar esse perfil na lista, ex.: 'Esposa' ou 'Contador'. Não precisa ser o nome real cadastrado no Telegram." />
            </span>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex.: Esposa, Contador"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
              Usuário no Telegram (opcional)
              <HelpTip text="Só preencha se preferir vincular manualmente: a pessoa cadastra esse mesmo @usuario no Telegram e manda uma mensagem pro bot. Não é necessário se você for usar o link de convite (mais simples)." />
            </span>
            <Input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="@usuario — só se preferir não usar o link"
            />
          </label>
          <Button onClick={() => void addRecipient()} disabled={adding || !newLabel.trim()}>
            {adding ? <Loader2 className="animate-spin" /> : <Plus />}Adicionar perfil
          </Button>
        </div>

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Administração (avançado)
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              O webhook do bot é registrado sozinho toda vez que você adiciona um perfil — não
              precisa clicar aqui no dia a dia. Isso só serve como reforço manual (ex.: se o bot
              parar de responder).
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void registerWebhook({ silent: false })}
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

function RecipientCard({
  recipient,
  accounts,
  cards,
  botUsername,
  onChange,
  onDelete,
}: {
  recipient: TelegramRecipientRow;
  accounts: Account[];
  cards: { id: string; name: string }[];
  botUsername: string | null;
  onChange: (patch: Partial<TelegramRecipientRow>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(recipient.label);
  const accountIds = new Set(asStringArray(recipient.account_ids));
  const cardIds = new Set(asStringArray(recipient.card_ids));
  const inviteLink = botUsername
    ? `https://t.me/${botUsername}?start=${recipient.link_token}`
    : null;

  function toggleScopeId(kind: "account" | "card", id: string, checked: boolean) {
    const current = new Set(kind === "account" ? accountIds : cardIds);
    if (checked) current.add(id);
    else current.delete(id);
    onChange(kind === "account" ? { account_ids: [...current] } : { card_ids: [...current] });
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar — selecione o link acima e copie manualmente.");
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-[220px]"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== recipient.label && onChange({ label })}
        />
        <span
          className={cn(
            "rounded-full px-2 py-1 text-xs font-medium",
            recipient.telegram_chat_id
              ? "bg-income-soft text-income"
              : "bg-muted text-muted-foreground",
          )}
        >
          {recipient.telegram_chat_id ? "✅ vinculado" : "⏳ aguardando vínculo"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={onDelete}
          aria-label="Remover perfil"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {!recipient.telegram_chat_id && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2.5">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {inviteLink ?? "Registre o webhook do bot (abaixo) pra gerar o link de convite."}
          </p>
          {inviteLink && (
            <Button variant="outline" size="sm" onClick={() => void copyInviteLink()}>
              Copiar link de convite
            </Button>
          )}
        </div>
      )}

      <div className="mt-3">
        <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
          Frequência de relatórios financeiros
          <HelpTip text="Com que frequência essa pessoa recebe os gastos detectados pra categorizar. Dá pra marcar mais de uma: diária avisa todo dia sobre o dia anterior, semanal reúne os últimos 7 dias (toda segunda), mensal reúne o mês anterior inteiro (todo dia 1). O que já foi categorizado numa não aparece de novo na outra." />
        </p>
        <div className="mt-1.5 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={recipient.notify_daily}
              onChange={(e) => onChange({ notify_daily: e.target.checked })}
            />
            Diária
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={recipient.notify_weekly}
              onChange={(e) => onChange({ notify_weekly: e.target.checked })}
            />
            Semanal
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={recipient.notify_monthly}
              onChange={(e) => onChange({ notify_monthly: e.target.checked })}
            />
            Mensal
          </label>
        </div>
      </div>

      <div className="mt-3">
        <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
          Contas e cartões
          <HelpTip text="Quais contas e cartões essa pessoa acompanha. Com 'todas as contas', ela recebe e pode categorizar qualquer gasto detectado. Com 'contas específicas', só vê e só categoriza os gastos das contas/cartões marcados abaixo." />
        </p>
        <div className="mt-1.5 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`scope-${recipient.id}`}
              checked={recipient.all_accounts}
              onChange={() => onChange({ all_accounts: true })}
            />
            Todas as contas
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`scope-${recipient.id}`}
              checked={!recipient.all_accounts}
              onChange={() => onChange({ all_accounts: false })}
            />
            Contas específicas
          </label>
        </div>
        {!recipient.all_accounts && (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {accounts.map((account) => (
              <label key={account.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={accountIds.has(account.id)}
                  onChange={(e) => toggleScopeId("account", account.id, e.target.checked)}
                />
                {account.name}
              </label>
            ))}
            {cards.map((card) => (
              <label key={card.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={cardIds.has(card.id)}
                  onChange={(e) => toggleScopeId("card", card.id, e.target.checked)}
                />
                {card.name} (cartão)
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
