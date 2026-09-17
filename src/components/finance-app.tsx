import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRightLeft, Building2, ChevronRight, CircleDollarSign, Landmark, LayoutDashboard, LogOut, Menu, Plus, Shapes, TrendingUp, WalletCards, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Account = Database["public"]["Tables"]["accounts"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
type Asset = Database["public"]["Tables"]["assets"]["Row"];
type CostCenter = Database["public"]["Tables"]["cost_centers"]["Row"];
type View = "dashboard" | "accounts" | "transactions" | "categories" | "cost_centers" | "assets";
type Modal = "account" | "transaction" | "category" | "asset" | "cost_center" | null;
type FormState = {
  name: string; institution: string; account_type: string; initial_balance: string;
  category_type: string; parent_id: string; asset_type: string; asset_class: string;
  value: string; notes: string; transaction_type: string; account_id: string;
  destination_account_id: string; category_id: string; amount: string;
  transaction_date: string; description: string; center_type: string; cost_center_id: string;
};
const emptyForm = (): FormState => ({
  name: "", institution: "", account_type: "checking", initial_balance: "",
  category_type: "expense", parent_id: "", asset_type: "asset", asset_class: "",
  value: "", notes: "", transaction_type: "expense", account_id: "",
  destination_account_id: "", category_id: "", amount: "",
  transaction_date: new Date().toISOString().slice(0, 10), description: "",
  center_type: "property", cost_center_id: "",
});
const centerTypeLabel: Record<string, string> = { property: "Imóvel", business: "Negócio", personal: "Pessoal", other: "Outro" };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const nav = [
  { id: "dashboard" as const, label: "Visão geral", icon: LayoutDashboard },
  { id: "accounts" as const, label: "Contas", icon: WalletCards },
  { id: "transactions" as const, label: "Lançamentos", icon: ArrowRightLeft },
  { id: "categories" as const, label: "Categorias", icon: Shapes },
  { id: "cost_centers" as const, label: "Centros de custo", icon: Building2 },
  { id: "assets" as const, label: "Patrimônio", icon: TrendingUp },
];
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

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
    const [profile, accountRows, categoryRows, transactionRows, assetRows, centerRows] = await Promise.all([
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

  useEffect(() => { void load(); }, []);

  const balanceByAccount = useMemo(() => accounts.map((account) => {
    const delta = transactions.reduce((sum, tx) => {
      if (tx.transaction_type === "income" && tx.account_id === account.id) return sum + Number(tx.amount);
      if (tx.transaction_type === "expense" && tx.account_id === account.id) return sum - Number(tx.amount);
      if (tx.transaction_type === "transfer" && tx.account_id === account.id) return sum - Number(tx.amount);
      if (tx.transaction_type === "transfer" && tx.destination_account_id === account.id) return sum + Number(tx.amount);
      return sum;
    }, 0);
    return { ...account, balance: Number(account.initial_balance) + delta };
  }), [accounts, transactions]);

  const totals = useMemo(() => {
    const current = new Date();
    const monthly = transactions.filter((tx) => {
      const d = new Date(`${tx.transaction_date}T12:00:00`);
      return d.getMonth() === current.getMonth() && d.getFullYear() === current.getFullYear();
    });
    const income = monthly.filter((t) => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = monthly.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const assetTotal = assets.filter((a) => a.asset_type === "asset").reduce((s, a) => s + Number(a.value), 0);
    const liabilityTotal = assets.filter((a) => a.asset_type === "liability").reduce((s, a) => s + Number(a.value), 0);
    return { income, expense, result: income - expense, balance: balanceByAccount.reduce((s, a) => s + a.balance, 0), assetTotal, liabilityTotal };
  }, [transactions, assets, balanceByAccount]);

  const chartData = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setMonth(date.getMonth() - (5 - index));
    const rows = transactions.filter((tx) => { const d = new Date(`${tx.transaction_date}T12:00:00`); return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear(); });
    return { month: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), receita: rows.filter((t) => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0), despesa: rows.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0) };
  }), [transactions]);

  const centerSummary = useMemo(() => {
    const rows = costCenters.map((center) => {
      const own = transactions.filter((t) => t.cost_center_id === center.id);
      const income = own.filter((t) => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = own.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      return { ...center, income, expense, result: income - expense, count: own.length };
    });
    const orphan = transactions.filter((t) => !t.cost_center_id && t.transaction_type !== "transfer");
    if (orphan.length) {
      const income = orphan.filter((t) => t.transaction_type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = orphan.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      rows.push({ id: "none", user_id: "", name: "Sem centro de custo", center_type: "other", description: null, color: "orange", is_active: true, created_at: "", updated_at: "", income, expense, result: income - expense, count: orphan.length } as (typeof rows)[number]);
    }
    return rows.sort((a, b) => b.income + b.expense - (a.income + a.expense));
  }, [costCenters, transactions]);

  function open(type: Exclude<Modal, null>) { setError(""); setForm(emptyForm()); setModal(type); }
  function field(key: keyof FormState) { return { value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value })) }; }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId || !modal) { setError("Sua sessão expirou. Entre novamente."); setSaving(false); return; }
    let result: { error: { message: string } | null };
    if (modal === "account") result = await supabase.from("accounts").insert({ user_id: userId, name: form.name, institution: form.institution || null, account_type: form.account_type as Account["account_type"], initial_balance: Number(form.initial_balance || 0) });
    else if (modal === "category") result = await supabase.from("categories").insert({ user_id: userId, name: form.name, category_type: form.category_type as Category["category_type"], parent_id: form.parent_id || null });
    else if (modal === "asset") result = await supabase.from("assets").insert({ user_id: userId, name: form.name, asset_type: form.asset_type as Asset["asset_type"], asset_class: form.asset_class, value: Number(form.value || 0), notes: form.notes || null });
    else if (modal === "cost_center") result = await supabase.from("cost_centers").insert({ user_id: userId, name: form.name, center_type: form.center_type as CostCenter["center_type"], description: form.description || null });
    else result = await supabase.from("transactions").insert({ user_id: userId, transaction_type: form.transaction_type as Transaction["transaction_type"], account_id: form.account_id, destination_account_id: form.transaction_type === "transfer" ? form.destination_account_id : null, category_id: form.transaction_type === "transfer" ? null : (form.category_id || null), cost_center_id: form.cost_center_id || null, amount: Number(form.amount), transaction_date: form.transaction_date, description: form.description, notes: form.notes || null });
    if (result.error) setError(result.error.message); else { setModal(null); await load(); }
    setSaving(false);
  }

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }
  const categoryPath = (id: string | null): string => { if (!id) return "Sem categoria"; const c = categories.find((item) => item.id === id); if (!c) return "Sem categoria"; return c.parent_id ? `${categoryPath(c.parent_id)} › ${c.name}` : c.name; };
  const centerName = (id: string | null): string => costCenters.find((c) => c.id === id)?.name ?? "Sem centro de custo";

  return <div className="min-h-screen bg-background text-foreground">
    <div className="flex min-h-screen">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-sidebar p-4 transition-transform md:sticky md:translate-x-0", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between px-2 py-2"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-md bg-primary font-display text-lg font-semibold text-primary-foreground">C</div><div><p className="font-display text-lg font-semibold">Cobre</p><p className="text-xs text-muted-foreground">Finanças pessoais</p></div></div><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X /></Button></div>
        <nav className="mt-7 space-y-1">{nav.map((item) => <Button key={item.id} variant={view === item.id ? "secondary" : "ghost"} className={cn("w-full justify-start", view === item.id && "text-primary")} onClick={() => { setView(item.id); setMobileOpen(false); }}><item.icon />{item.label}</Button>)}</nav>
        <div className="mt-8 border-t border-border pt-5"><p className="px-3 text-xs font-medium uppercase text-muted-foreground">Contas</p><div className="mt-2 space-y-1">{balanceByAccount.slice(0,4).map((a) => <div key={a.id} className="flex items-center justify-between px-3 py-2 text-xs"><span className="truncate">{a.name}</span><span className="font-mono tabular-nums">{money.format(a.balance)}</span></div>)}{!accounts.length && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma conta cadastrada</p>}</div></div>
        <div className="absolute bottom-4 left-4 right-4"><div className="rounded-md bg-foreground p-4 text-background"><p className="text-xs opacity-70">Saldo consolidado</p><p className="mt-1 font-mono text-lg">{money.format(totals.balance)}</p></div><Button variant="ghost" className="mt-2 w-full justify-start text-muted-foreground" onClick={signOut}><LogOut />Sair</Button></div>
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-overlay md:hidden" onClick={() => setMobileOpen(false)} />}
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
        <header className="mb-7 flex items-center justify-between"><div className="flex items-center gap-3"><Button variant="outline" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu /></Button><div><p className="text-xs font-medium uppercase text-muted-foreground">{name}</p><h1 className="font-display text-2xl font-semibold md:text-3xl">{nav.find((n) => n.id === view)?.label}</h1></div></div><Button onClick={() => open(view === "accounts" ? "account" : view === "categories" ? "category" : view === "assets" ? "asset" : view === "cost_centers" ? "cost_center" : "transaction")}><Plus />{view === "accounts" ? "Nova conta" : view === "categories" ? "Nova categoria" : view === "assets" ? "Novo item" : view === "cost_centers" ? "Novo centro de custo" : "Novo lançamento"}</Button></header>
        {loading ? <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Carregando seu controle financeiro…</div> : <>
          {view === "dashboard" && <Dashboard totals={totals} chartData={chartData} transactions={transactions} accounts={accounts} categoryPath={categoryPath} centerName={centerName} centerSummary={centerSummary} />}
          {view === "accounts" && <Accounts accounts={balanceByAccount} onAdd={() => open("account")} />}
          {view === "transactions" && <Transactions transactions={transactions} accounts={accounts} categoryPath={categoryPath} centerName={centerName} onAdd={() => open("transaction")} />}
          {view === "categories" && <Categories categories={categories} onAdd={() => open("category")} />}
          {view === "cost_centers" && <CostCenters rows={centerSummary} onAdd={() => open("cost_center")} />}
          {view === "assets" && <Assets assets={assets} totals={totals} onAdd={() => open("asset")} />}
        </>}
      </main>
    </div>
    <Dialog open={modal !== null} onOpenChange={(openState) => !openState && setModal(null)}><DialogContent><DialogHeader><DialogTitle>{modal === "account" ? "Nova conta" : modal === "category" ? "Nova categoria" : modal === "asset" ? "Novo item patrimonial" : "Novo lançamento"}</DialogTitle><DialogDescription>Preencha os dados para manter seus números atualizados.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">{modal === "account" && <><Field label="Nome"><Input required {...field("name")} placeholder="Conta principal" /></Field><Field label="Instituição"><Input {...field("institution")} placeholder="Nome do banco" /></Field><Field label="Tipo"><select className={selectClass} {...field("account_type")}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro</option><option value="investment">Investimento</option><option value="credit">Cartão de crédito</option></select></Field><Field label="Saldo inicial"><Input required type="number" step="0.01" {...field("initial_balance")} /></Field></>}{modal === "category" && <><Field label="Nome"><Input required {...field("name")} /></Field><Field label="Tipo"><select className={selectClass} {...field("category_type")}><option value="expense">Despesa</option><option value="income">Receita</option></select></Field><Field label="Categoria superior (opcional)"><select className={selectClass} {...field("parent_id")}><option value="">Nenhuma</option>{categories.filter(c => c.category_type === form.category_type).map(c => <option key={c.id} value={c.id}>{categoryPath(c.id)}</option>)}</select></Field></>}{modal === "asset" && <><Field label="Nome"><Input required {...field("name")} placeholder="Apartamento, veículo, financiamento…" /></Field><Field label="Natureza"><select className={selectClass} {...field("asset_type")}><option value="asset">Ativo</option><option value="liability">Passivo</option></select></Field><Field label="Classe"><Input required {...field("asset_class")} placeholder="Imóvel, veículo, dívida…" /></Field><Field label="Valor atual"><Input required type="number" min="0" step="0.01" {...field("value")} /></Field></>}{modal === "transaction" && <><Field label="Tipo"><select className={selectClass} {...field("transaction_type")}><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência</option></select></Field><Field label="Descrição"><Input required {...field("description")} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Valor"><Input required type="number" min="0.01" step="0.01" {...field("amount")} /></Field><Field label="Data"><Input required type="date" {...field("transaction_date")} /></Field></div><Field label={form.transaction_type === "transfer" ? "Conta de origem" : "Conta"}><select required className={selectClass} {...field("account_id")}><option value="">Selecione</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>{form.transaction_type === "transfer" ? <Field label="Conta de destino"><select required className={selectClass} {...field("destination_account_id")}><option value="">Selecione</option>{accounts.filter(a => a.id !== form.account_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field> : <Field label="Categoria"><select className={selectClass} {...field("category_id")}><option value="">Sem categoria</option>{categories.filter(c => c.category_type === form.transaction_type).map(c => <option key={c.id} value={c.id}>{categoryPath(c.id)}</option>)}</select></Field>}</>}{error && <p className="rounded-md bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></div></form></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Empty({ title, text, onAdd }: { title: string; text: string; onAdd: () => void }) { return <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-border bg-card p-8 text-center"><div><CircleDollarSign className="mx-auto size-9 text-primary"/><h2 className="mt-3 font-display text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{text}</p><Button className="mt-4" onClick={onAdd}><Plus />Adicionar</Button></div></div>; }
function Metric({ label, value, tone }: { label: string; value: number; tone?: "positive" | "negative" }) { return <div className="rounded-lg border border-border bg-card p-5"><p className="text-xs font-medium uppercase text-muted-foreground">{label}</p><p className={cn("mt-2 font-mono text-2xl font-medium tabular-nums", tone === "positive" && "text-income", tone === "negative" && "text-expense")}>{money.format(value)}</p></div>; }
function Dashboard({ totals, chartData, transactions, accounts, categoryPath }: any) { return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Saldo total" value={totals.balance}/><Metric label="Receitas do mês" value={totals.income} tone="positive"/><Metric label="Despesas do mês" value={totals.expense} tone="negative"/><Metric label="Resultado do mês" value={totals.result} tone={totals.result >= 0 ? "positive" : "negative"}/></div><div className="grid gap-4 xl:grid-cols-5"><section className="rounded-lg border border-border bg-card p-5 xl:col-span-3"><div><h2 className="font-semibold">Receita × despesa</h2><p className="text-xs text-muted-foreground">Últimos seis meses</p></div><div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)"/><XAxis dataKey="month" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} width={55}/><Tooltip formatter={(v) => money.format(Number(v))}/><Bar dataKey="receita" fill="var(--income)" radius={[3,3,0,0]}/><Bar dataKey="despesa" fill="var(--expense)" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></section><section className="rounded-lg border border-border bg-card p-5 xl:col-span-2"><h2 className="font-semibold">Fluxo de caixa</h2><p className="text-xs text-muted-foreground">Resultado mensal</p><div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData.map((d:any)=>({...d, fluxo:d.receita-d.despesa}))}><defs><linearGradient id="cash" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={.32}/><stop offset="100%" stopColor="var(--primary)" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)"/><XAxis dataKey="month" tickLine={false} axisLine={false}/><YAxis hide/><Tooltip formatter={(v) => money.format(Number(v))}/><Area type="monotone" dataKey="fluxo" stroke="var(--primary)" strokeWidth={2} fill="url(#cash)"/></AreaChart></ResponsiveContainer></div></section></div><section className="rounded-lg border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Movimentações recentes</h2></div><TransactionRows transactions={transactions.slice(0,6)} accounts={accounts} categoryPath={categoryPath}/></section></div>; }
function Accounts({ accounts, onAdd }: { accounts: (Account & { balance: number })[]; onAdd: () => void }) { if (!accounts.length) return <Empty title="Comece pelas suas contas" text="Cadastre bancos, carteiras e investimentos." onAdd={onAdd}/>; return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{accounts.map(a => <div key={a.id} className="rounded-lg border border-border bg-card p-5"><div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary"><Landmark /></div><span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{a.is_active ? "Ativa" : "Inativa"}</span></div><h2 className="mt-5 font-semibold">{a.name}</h2><p className="text-sm text-muted-foreground">{a.institution || "Conta pessoal"}</p><p className="mt-4 font-mono text-2xl tabular-nums">{money.format(a.balance)}</p></div>)}</div>; }
function TransactionRows({ transactions, accounts, categoryPath }: { transactions: Transaction[]; accounts: Account[]; categoryPath: (id:string|null)=>string }) { return <div className="divide-y divide-border">{transactions.map(tx => { const positive=tx.transaction_type==="income"; return <div key={tx.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[110px_1fr_1fr_auto]"><span className="hidden text-xs text-muted-foreground sm:block">{dateFmt.format(new Date(`${tx.transaction_date}T12:00:00`))}</span><div><p className="text-sm font-medium">{tx.description}</p><p className="text-xs text-muted-foreground sm:hidden">{dateFmt.format(new Date(`${tx.transaction_date}T12:00:00`))}</p></div><div className="hidden text-xs text-muted-foreground sm:block">{tx.transaction_type === "transfer" ? "Transferência" : categoryPath(tx.category_id)} · {accounts.find(a=>a.id===tx.account_id)?.name}</div><span className={cn("font-mono text-sm tabular-nums", positive ? "text-income" : tx.transaction_type === "expense" ? "text-expense" : "text-foreground")}>{positive ? "+" : tx.transaction_type === "expense" ? "−" : ""}{money.format(Number(tx.amount))}</span></div>})}{!transactions.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento neste período.</p>}</div>; }
function Transactions({ transactions, accounts, categoryPath, onAdd }: any) { if (!transactions.length) return <Empty title="Registre a primeira movimentação" text="Adicione receitas, despesas ou transferências." onAdd={onAdd}/>; return <section className="rounded-lg border border-border bg-card"><TransactionRows transactions={transactions} accounts={accounts} categoryPath={categoryPath}/></section>; }
function Categories({ categories, onAdd }: { categories: Category[]; onAdd:()=>void }) { if(!categories.length) return <Empty title="Organize seus lançamentos" text="Crie grupos e subgrupos sem limite de níveis." onAdd={onAdd}/>; const roots=categories.filter(c=>!c.parent_id); const Branch=({c,depth=0}:{c:Category;depth?:number})=><><div className="flex items-center justify-between border-b border-border px-4 py-3"><span className="flex items-center gap-2 text-sm">{Array.from({length:depth}).map((_,index)=><span key={index} className="w-3"/>)}<ChevronRight className="size-4 text-muted-foreground"/>{c.name}</span><span className={cn("rounded-full px-2 py-1 text-xs", c.category_type==="income"?"bg-income-soft text-income":"bg-expense-soft text-expense")}>{c.category_type==="income"?"Receita":"Despesa"}</span></div>{categories.filter(x=>x.parent_id===c.id).map(child=><Branch key={child.id} c={child} depth={depth+1}/>)}</>; return <div className="overflow-hidden rounded-lg border border-border bg-card">{roots.map(c=><Branch key={c.id} c={c}/>)}</div>; }
function Assets({ assets, totals, onAdd }: any) { return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Ativos" value={totals.assetTotal} tone="positive"/><Metric label="Passivos" value={totals.liabilityTotal} tone="negative"/><Metric label="Patrimônio líquido" value={totals.assetTotal-totals.liabilityTotal}/></div>{assets.length ? <div className="grid gap-3 sm:grid-cols-2">{assets.map((a:Asset)=><div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-5"><div><p className="font-semibold">{a.name}</p><p className="text-xs text-muted-foreground">{a.asset_class}</p></div><div className="text-right"><p className={cn("font-mono tabular-nums",a.asset_type==="asset"?"text-income":"text-expense")}>{money.format(Number(a.value))}</p><p className="text-xs text-muted-foreground">{a.asset_type==="asset"?"Ativo":"Passivo"}</p></div></div>)}</div> : <Empty title="Monte seu balanço patrimonial" text="Cadastre seus bens, investimentos e dívidas." onAdd={onAdd}/>}</div>; }
