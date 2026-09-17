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
  FileUp,
  ChevronRight,
  CircleDollarSign,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Shapes,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { StatementImport } from "@/components/statement-import";
import { getDailyRates } from "@/lib/rates.functions";
import type { Database } from "@/integrations/supabase/types";
import lightLogo from "@/assets/fluxora-logo-light-transparent.png.asset.json";

type Account = Database["public"]["Tables"]["accounts"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
type Asset = Database["public"]["Tables"]["assets"]["Row"];
type CostCenter = Database["public"]["Tables"]["cost_centers"]["Row"];
type View =
  "dashboard" | "accounts" | "transactions" | "import" | "categories" | "cost_centers" | "assets";
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
};
const emptyForm = (): FormState => ({
  name: "",
  institution: "",
  account_type: "checking",
  initial_balance: "",
  currency: "BRL",
  category_type: "expense",
  parent_id: "",
  asset_type: "asset",
  asset_class: "",
  value: "",
  notes: "",
  transaction_type: "expense",
  account_id: "",
  destination_account_id: "",
  category_id: "",
  amount: "",
  transaction_date: new Date().toISOString().slice(0, 10),
  description: "",
  center_type: "property",
  cost_center_id: "",
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
  { id: "import" as const, label: "Importar extrato", icon: FileUp },
  { id: "categories" as const, label: "Categorias", icon: Shapes },
  { id: "cost_centers" as const, label: "Centros de custo", icon: Building2 },
  { id: "assets" as const, label: "Patrimônio", icon: TrendingUp },
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

  async function load() {
    setLoading(true);
    const [profile, accountRows, categoryRows, transactionRows, assetRows, centerRows] =
      await Promise.all([
        supabase.from("profiles").select("display_name").maybeSingle(),
        supabase.from("accounts").select("*").order("created_at"),
        supabase.from("categories").select("*").order("name"),
        supabase.from("transactions").select("*").order("transaction_date", { ascending: false }),
        supabase.from("assets").select("*").order("created_at", { ascending: false }),
        supabase.from("cost_centers").select("*").order("name"),
      ]);
    setName(profile.data?.display_name || "Olá");
    setAccounts(accountRows.data ?? []);
    setCategories(categoryRows.data ?? []);
    setTransactions(transactionRows.data ?? []);
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
  const rateOf = (currency: string) => rates[currency] ?? 1;
  const currencyOf = (accountId: string | null) =>
    accountId ? (accountCurrency[accountId] ?? "BRL") : "BRL";
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
        const delta = transactions.reduce((sum, tx) => {
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
        return { ...account, balance, currency, balanceBRL: balance * rateOf(currency) };
      }),
    [accounts, transactions, rates],
  );

  const totals = useMemo(() => {
    const current = new Date();
    const monthly = transactions.filter((tx) => {
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
          ...accounts.map((a) => a.currency || "BRL"),
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
    // balance é o único total convertido para BRL — é o "saldo atual", não um histórico de transações.
    return {
      byCurrency,
      balance: balanceByAccount.reduce((s, a) => s + a.balanceBRL, 0),
      assetTotal,
      liabilityTotal,
    };
  }, [transactions, assets, balanceByAccount, accounts, accountCurrency]);

  const chartDataByCurrency = useMemo(() => {
    const currencies = sortCurrencies(
      Array.from(new Set(accounts.map((a) => a.currency || "BRL"))),
    );
    if (!currencies.length) currencies.push("BRL");
    return currencies.map((currency) => ({
      currency,
      data: Array.from({ length: 6 }, (_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - index));
        const rows = transactions.filter((tx) => {
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
  }, [transactions, accounts, accountCurrency]);

  const centerSummary = useMemo(() => {
    const rows = costCenters.map((center) => {
      const own = transactions.filter(
        (t) => t.cost_center_id === center.id && t.transaction_type !== "transfer",
      );
      const income = sumByCurrency(own.filter((t) => t.transaction_type === "income"));
      const expense = sumByCurrency(own.filter((t) => t.transaction_type === "expense"));
      const currencies = sortCurrencies(
        Array.from(new Set([...Object.keys(income), ...Object.keys(expense)])),
      );
      return { ...center, income, expense, currencies, count: own.length };
    });
    const orphan = transactions.filter(
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
  }, [costCenters, transactions, accountCurrency]);

  function open(type: Exclude<Modal, null>) {
    setError("");
    setForm(emptyForm());
    setModal(type);
  }
  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
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
    if (modal === "account")
      result = await supabase
        .from("accounts")
        .insert({
          user_id: userId,
          name: form.name,
          institution: form.institution || null,
          account_type: form.account_type as Account["account_type"],
          currency: form.currency,
          initial_balance: Number(form.initial_balance || 0),
        });
    else if (modal === "category")
      result = await supabase
        .from("categories")
        .insert({
          user_id: userId,
          name: form.name,
          category_type: form.category_type as Category["category_type"],
          parent_id: form.parent_id || null,
        });
    else if (modal === "asset")
      result = await supabase
        .from("assets")
        .insert({
          user_id: userId,
          name: form.name,
          asset_type: form.asset_type as Asset["asset_type"],
          asset_class: form.asset_class,
          value: Number(form.value || 0),
          notes: form.notes || null,
        });
    else if (modal === "cost_center")
      result = await supabase
        .from("cost_centers")
        .insert({
          user_id: userId,
          name: form.name,
          center_type: form.center_type as CostCenter["center_type"],
          description: form.description || null,
        });
    else
      result = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          transaction_type: form.transaction_type as Transaction["transaction_type"],
          account_id: form.account_id,
          destination_account_id:
            form.transaction_type === "transfer" ? form.destination_account_id : null,
          category_id: form.transaction_type === "transfer" ? null : form.category_id || null,
          cost_center_id: form.cost_center_id || null,
          amount: Number(form.amount),
          transaction_date: form.transaction_date,
          description: form.description,
          notes: form.notes || null,
        });
    if (result.error) setError(result.error.message);
    else {
      setModal(null);
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
                <div key={a.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="truncate">{a.name}</span>
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
            {view !== "import" && (
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
                  chartDataByCurrency={chartDataByCurrency}
                  transactions={transactions}
                  accounts={accounts}
                  categoryPath={categoryPath}
                  centerName={centerName}
                  centerSummary={centerSummary}
                />
              )}
              {view === "accounts" && (
                <Accounts
                  accounts={balanceByAccount}
                  onAdd={() => open("account")}
                  rateDate={rateDate}
                />
              )}
              {view === "transactions" && (
                <Transactions
                  transactions={transactions}
                  accounts={accounts}
                  categoryPath={categoryPath}
                  centerName={centerName}
                  onAdd={() => open("transaction")}
                />
              )}
              {view === "import" && (
                <StatementImport
                  accounts={accounts}
                  categories={categories}
                  costCenters={costCenters}
                  categoryPath={categoryPath}
                  onImported={load}
                />
              )}
              {view === "categories" && (
                <Categories categories={categories} onAdd={() => open("category")} />
              )}
              {view === "cost_centers" && (
                <CostCenters rows={centerSummary} onAdd={() => open("cost_center")} />
              )}
              {view === "assets" && (
                <Assets assets={assets} totals={totals} onAdd={() => open("asset")} />
              )}
            </>
          )}
        </main>
      </div>
      <Dialog open={modal !== null} onOpenChange={(openState) => !openState && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal === "account"
                ? "Nova conta"
                : modal === "category"
                  ? "Nova categoria"
                  : modal === "asset"
                    ? "Novo item patrimonial"
                    : modal === "cost_center"
                      ? "Novo centro de custo"
                      : "Novo lançamento"}
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
                <Field label="Instituição">
                  <Input {...field("institution")} placeholder="Nome do banco" />
                </Field>
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
                  <Input required type="number" step="0.01" {...field("initial_balance")} />
                </Field>
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
                  <Input required type="number" min="0" step="0.01" {...field("value")} />
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
                  <select className={selectClass} {...field("transaction_type")}>
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
                    <Input required type="number" min="0.01" step="0.01" {...field("amount")} />
                  </Field>
                  <Field label="Data">
                    <Input required type="date" {...field("transaction_date")} />
                  </Field>
                </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
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
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
  currency?: string;
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
    </div>
  );
}
function Dashboard({
  totals,
  chartDataByCurrency,
  transactions,
  accounts,
  categoryPath,
  centerName,
  centerSummary,
}: any) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Saldo total" value={totals.balance} />
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
}: {
  accounts: (Account & { balance: number; currency: string; balanceBRL: number })[];
  onAdd: () => void;
  rateDate: string;
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
            <div className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary">
              <Landmark />
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
              {a.is_active ? "Ativa" : "Inativa"}
            </span>
          </div>
          <h2 className="mt-5 font-semibold">{a.name}</h2>
          <p className="text-sm text-muted-foreground">{a.institution || "Conta pessoal"}</p>
          <p className="mt-4 font-mono text-2xl tabular-nums">
            {formatCurrency(a.balance, a.currency)}
          </p>
          {a.currency !== "BRL" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {money.format(a.balanceBRL)} pela cotação
              {rateDate
                ? ` de ${dateFmt.format(new Date(`${rateDate}T12:00:00`))}`
                : " do dia anterior"}
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
}: {
  transactions: Transaction[];
  accounts: Account[];
  categoryPath: (id: string | null) => string;
  centerName: (id: string | null) => string;
}) {
  return (
    <div className="divide-y divide-border">
      {transactions.map((tx) => {
        const positive = tx.transaction_type === "income";
        const account = accounts.find((a) => a.id === tx.account_id);
        const currency = account?.currency || "BRL";
        return (
          <div
            key={tx.id}
            className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[110px_1fr_1fr_auto]"
          >
            <span className="hidden text-xs text-muted-foreground sm:block">
              {dateFmt.format(new Date(`${tx.transaction_date}T12:00:00`))}
            </span>
            <div>
              <p className="text-sm font-medium">{tx.description}</p>
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
function Transactions({ transactions, accounts, categoryPath, centerName, onAdd }: any) {
  if (!transactions.length)
    return (
      <Empty
        title="Registre a primeira movimentação"
        text="Adicione receitas, despesas ou transferências."
        onAdd={onAdd}
      />
    );
  return (
    <section className="rounded-lg border border-border bg-card">
      <TransactionRows
        transactions={transactions}
        accounts={accounts}
        categoryPath={categoryPath}
        centerName={centerName}
      />
    </section>
  );
}
function CostCenters({ rows, onAdd }: any) {
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
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {centerTypeLabel[r.center_type] ?? "Outro"}
              </span>
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
function Categories({ categories, onAdd }: { categories: Category[]; onAdd: () => void }) {
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
function Assets({ assets, totals, onAdd }: any) {
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
              className="flex items-center justify-between rounded-lg border border-border bg-card p-5"
            >
              <div>
                <p className="font-semibold">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.asset_class}</p>
              </div>
              <div className="text-right">
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
