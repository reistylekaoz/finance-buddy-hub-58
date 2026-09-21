import { useEffect, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  createPluggyConnectToken,
  deleteBankConnection,
  discoverPluggyItems,
  fetchPluggyItemsInfo,
  registerBankConnection,
  savePluggyCredentials,
  syncBankConnection,
  type PluggyItemInfo,
} from "@/lib/pluggy.functions";
import type { Database } from "@/integrations/supabase/types";

type BankConnection = Database["public"]["Tables"]["bank_connections"]["Row"];
type ConnectedAccountInfo = Pick<
  Database["public"]["Tables"]["accounts"]["Row"],
  "bank_connection_id" | "institution" | "owner_name" | "branch_number" | "account_number"
>;

// Mostra só os últimos dígitos (agência/conta) para não expor o dado
// completo na tela — o valor cheio fica no banco, isso é só exibição.
function maskTail(value: string | null, keep: number): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.length <= keep) return v;
  return `${"•".repeat(Math.min(4, v.length - keep))}${v.slice(-keep)}`;
}

function firstName(value: string | null): string | null {
  const v = value?.trim();
  return v ? (v.split(/\s+/)[0] ?? null) : null;
}

// Widget oficial da Pluggy, versão fixada conforme o exemplo publicado pela
// própria Pluggy (github.com/pluggyai/quickstart). Não é um pacote npm deste
// projeto para não depender de instalar dependência nova.
const PLUGGY_WIDGET_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js";

type PluggyConnectInstance = { init: () => void };
type PluggyConnectOptions = {
  connectToken: string;
  includeSandbox?: boolean;
  // Faz o próprio widget (não só o connect_token) saber que é um modo
  // atualização — sem isso ele se comporta como "criar item novo" mesmo
  // com um connect_token pedido em modo update, e ainda esbarra no
  // ITEM_USER_ALREADY_EXISTS.
  updateItem?: string;
  onSuccess: (itemData: { item: { id: string } }) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
};
declare global {
  interface Window {
    PluggyConnect?: new (options: PluggyConnectOptions) => PluggyConnectInstance;
  }
}

let widgetLoadPromise: Promise<void> | null = null;
function loadPluggyWidget(): Promise<void> {
  if (typeof window !== "undefined" && window.PluggyConnect) return Promise.resolve();
  if (!widgetLoadPromise) {
    widgetLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PLUGGY_WIDGET_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Não foi possível carregar o widget da Pluggy."));
      document.body.appendChild(script);
    });
  }
  return widgetLoadPromise;
}

const statusLabel: Record<string, { label: string; className: string }> = {
  connecting: { label: "Conectando…", className: "bg-muted text-muted-foreground" },
  updating: { label: "Atualizando…", className: "bg-amber-100 text-amber-700" },
  updated: { label: "Sincronizado", className: "bg-income-soft text-income" },
  login_error: {
    label: "Erro de login — reconecte",
    className: "bg-destructive-soft text-destructive",
  },
  outdated: { label: "Desatualizado", className: "bg-destructive-soft text-destructive" },
  error: { label: "Erro", className: "bg-destructive-soft text-destructive" },
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function BankConnections({ onSynced }: { onSynced: () => void }) {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [accountByConnection, setAccountByConnection] = useState<Map<string, ConnectedAccountInfo>>(
    new Map(),
  );
  const [hasCredentials, setHasCredentials] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankConnection | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    // As credenciais Pluggy (client id e secret) ficam numa tabela isolada que
    // o navegador não consegue ler — só o backend, com service role. Aqui o
    // perfil traz apenas o indicador booleano "configurado ou não".
    const [
      { data: profile, error: profileError },
      { data: connectionRows },
      { data: accountRows },
    ] = await Promise.all([
      supabase.from("profiles").select("pluggy_configured").maybeSingle(),
      supabase.from("bank_connections").select("*").order("created_at", { ascending: false }),
      supabase
        .from("accounts")
        .select("bank_connection_id, institution, owner_name, branch_number, account_number")
        .not("bank_connection_id", "is", null),
    ]);
    if (profileError) {
      toast.error(`Falha ao carregar suas credenciais: ${profileError.message}`);
    }
    setHasCredentials(profile?.pluggy_configured === true);
    setConnections(connectionRows ?? []);
    setAccountByConnection(
      new Map(
        (accountRows ?? [])
          .filter((a) => a.bank_connection_id)
          .map((a) => [a.bank_connection_id as string, a]),
      ),
    );
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function saveCredentials() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSavingCredentials(true);
    try {
      await savePluggyCredentials({
        data: { clientId: clientId.trim(), clientSecret: clientSecret.trim() },
      });
      toast.success("Credenciais salvas! Agora você já pode conectar seus bancos.");
      setClientSecret("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar as credenciais.");
    } finally {
      setSavingCredentials(false);
    }
  }

  async function registerExistingItem(pluggyItemId: string) {
    await registerBankConnection({ data: { pluggyItemId } });
  }

  // Tela de escolha (Conectar novo banco → item já existe / Buscar itens
  // automaticamente): mostra os itens encontrados pra marcar quais conectar,
  // pré-marcando só os que ainda não estão na lista de conexões.
  const [picker, setPicker] = useState<{ items: PluggyItemInfo[]; selected: Set<string> } | null>(
    null,
  );
  const [connectProgress, setConnectProgress] = useState<{
    current: number;
    total: number;
    results: { id: string; name: string; ok: boolean; error?: string }[];
  } | null>(null);

  function openPicker(items: PluggyItemInfo[]) {
    setPicker({
      items,
      selected: new Set(items.filter((i) => !i.alreadyConnected).map((i) => i.id)),
    });
  }
  function toggleItem(id: string, checked: boolean) {
    setPicker((p) => {
      if (!p) return p;
      const next = new Set(p.selected);
      if (checked) next.add(id);
      else next.delete(id);
      return { ...p, selected: next };
    });
  }
  function closePicker() {
    setPicker(null);
    setConnectProgress(null);
  }
  async function connectSelected() {
    if (!picker) return;
    const chosen = picker.items.filter((i) => picker.selected.has(i.id));
    if (!chosen.length) return;
    setConnectProgress({ current: 0, total: chosen.length, results: [] });
    for (let i = 0; i < chosen.length; i++) {
      const item = chosen[i]!;
      try {
        await registerExistingItem(item.id);
        setConnectProgress((p) =>
          p
            ? {
                ...p,
                current: i + 1,
                results: [...p.results, { id: item.id, name: item.name, ok: true }],
              }
            : p,
        );
      } catch (error) {
        setConnectProgress((p) =>
          p
            ? {
                ...p,
                current: i + 1,
                results: [
                  ...p.results,
                  {
                    id: item.id,
                    name: item.name,
                    ok: false,
                    error: error instanceof Error ? error.message : "falha desconhecida",
                  },
                ],
              }
            : p,
        );
      }
    }
    await load();
    onSynced();
  }

  // Função única do fluxo do widget: sem itemId, pede o connect_token em
  // modo "criar item novo" (Conectar novo banco); com itemId, pede em modo
  // "atualizar item existente" (Teste de update) — só muda o que é passado
  // pra createPluggyConnectToken, o resto (onSuccess/onError/onClose) é
  // idêntico nos dois casos.
  async function openPluggyWidget(itemId?: string) {
    setConnecting(true);
    try {
      await loadPluggyWidget();
      const { connectToken } = await createPluggyConnectToken({
        data: { oauthRedirectUrl: window.location.href, ...(itemId ? { itemId } : {}) },
      });
      if (!window.PluggyConnect) throw new Error("Widget da Pluggy indisponível.");
      const widget = new window.PluggyConnect({
        connectToken,
        // Mostra também os conectores de teste da Pluggy; troque para false
        // ao usar credenciais de produção com usuários reais.
        includeSandbox: true,
        // O próprio widget precisa saber que é atualização, não só o
        // connect_token — sem isso ele mostra a tela normal de "criar item
        // novo" mesmo com um token pedido em modo update.
        ...(itemId ? { updateItem: itemId } : {}),
        onSuccess: (itemData) => {
          void (async () => {
            try {
              await registerExistingItem(itemData.item.id);
              toast.success("Banco conectado! Sincronizando lançamentos…");
              await load();
              onSynced();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Falha ao registrar conexão.");
            } finally {
              setConnecting(false);
            }
          })();
        },
        onError: (error) => {
          // A Pluggy recusa criar um item novo quando já existe outro com as
          // mesmas credenciais (ITEM_USER_ALREADY_EXISTS) e devolve só os ids
          // dos itens existentes, sem nome — busca os detalhes de cada um e
          // deixa o usuário escolher quais conectar, em vez de escolher por
          // ele.
          const details = error as { message?: string; data?: { items?: string[] } };
          const existingIds = details?.data?.items ?? [];
          if (details?.message === "ITEM_USER_ALREADY_EXISTS" && existingIds.length) {
            void (async () => {
              try {
                const { items } = await fetchPluggyItemsInfo({ data: { itemIds: existingIds } });
                if (items.length) {
                  openPicker(items);
                  // Preenche o campo manual com os ids encontrados, pra
                  // "Teste de update" já ter o que usar sem precisar caçar
                  // o Item ID em outro lugar.
                  setManualItemIds(items.map((item) => item.id).join("\n"));
                } else {
                  // Nenhum detalhe disponível (ids podem ter expirado) —
                  // ainda assim tenta reaproveitar o mais recente.
                  const lastId = existingIds.at(-1);
                  if (lastId) {
                    await registerExistingItem(lastId);
                    toast.success("Conexão existente reaproveitada! Sincronizando lançamentos…");
                    await load();
                    onSynced();
                  }
                }
              } catch (fetchError) {
                console.error(fetchError);
                toast.error(
                  "Já existe uma conexão com essas credenciais, mas não consegui listar os itens existentes.",
                );
              } finally {
                setConnecting(false);
              }
            })();
            return;
          }
          console.error(error);
          toast.error("Não foi possível conectar ao banco.");
          setConnecting(false);
        },
        onClose: () => setConnecting(false),
      });
      widget.init();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao iniciar a conexão.");
      setConnecting(false);
    }
  }

  async function connectNewBank() {
    await openPluggyWidget();
  }

  // Botão de teste: usa a MESMA função acima, só que passando um itemId —
  // o que muda é só a chamada ao createPluggyConnectToken (modo update em
  // vez de criação). Sempre ativo (não depende de já ter uma conexão
  // registrada): usa a mais recente se existir, senão cai pro primeiro ID
  // colado no campo manual — útil justamente quando o registro normal nunca
  // chegou a completar (o cenário do ITEM_USER_ALREADY_EXISTS).
  async function testUpdateConnect() {
    const pastedIds = manualItemIds
      .split(/[\n,]/)
      .map((id) => id.trim())
      .filter(Boolean);
    const targetItemId = connections[0]?.pluggy_item_id || pastedIds[0];
    if (!targetItemId) {
      toast.error(
        "Cole ao menos um Item ID no campo abaixo (ou conecte um banco) pra poder testar o modo de atualização.",
      );
      return;
    }
    await openPluggyWidget(targetItemId);
  }

  const [manualItemIds, setManualItemIds] = useState("");
  const [registeringManual, setRegisteringManual] = useState(false);
  async function registerManualItems() {
    const ids = manualItemIds
      .split(/[\n,]/)
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids.length) return;
    setRegisteringManual(true);
    let succeeded = 0;
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await registerExistingItem(id);
        succeeded += 1;
      } catch (error) {
        failures.push(`${id}: ${error instanceof Error ? error.message : "falha desconhecida"}`);
      }
    }
    setRegisteringManual(false);
    if (succeeded) {
      setManualItemIds(failures.length ? failures.map((f) => f.split(":")[0]).join("\n") : "");
      toast.success(`${succeeded} item(ns) registrado(s) e sincronizando.`);
      await load();
      onSynced();
    }
    if (failures.length) {
      toast.error(`Falhou em ${failures.length}: ${failures.join(" · ")}`);
    }
  }

  const [discovering, setDiscovering] = useState(false);
  async function discoverItems() {
    setDiscovering(true);
    try {
      const { items } = await discoverPluggyItems();
      setDiscovering(false);
      if (!items.length) {
        toast.error("Nenhum item encontrado na Pluggy pra essas credenciais.");
        return;
      }
      openPicker(items);
    } catch (error) {
      setDiscovering(false);
      const message = error instanceof Error ? error.message : "";
      // GET /v2/items é opt-in na Pluggy e nem toda conta tem habilitado —
      // quando essa listagem falha por isso, a única forma de descobrir os
      // itens já existentes é tentando conectar de novo: a Pluggy recusa
      // com ITEM_USER_ALREADY_EXISTS e devolve os ids existentes, que o
      // onError do widget (abaixo) já sabe transformar no mesmo seletor.
      if (message.includes("opt-in")) {
        toast.info(
          "Listagem automática não habilitada nessa conta Pluggy — abrindo o conector pra localizar os itens existentes por aí.",
        );
        await connectNewBank();
        return;
      }
      toast.error(message || "Falha ao buscar itens automaticamente.");
    }
  }

  async function syncNow(connection: BankConnection) {
    setSyncingId(connection.id);
    try {
      const result = await syncBankConnection({ data: { connectionId: connection.id } });
      toast.success(
        result.importedCount
          ? `${result.importedCount} lançamento(s) sincronizado(s).`
          : "Tudo já estava atualizado.",
      );
      await load();
      onSynced();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar.");
    } finally {
      setSyncingId(null);
    }
  }

  async function performDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteBankConnection({ data: { connectionId: pendingDelete.id } });
      toast.success("Conexão removida.");
      setPendingDelete(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover conexão.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando conexões…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <KeyRound className="size-6 flex-none text-primary" />
          <div>
            <h2 className="font-semibold">Suas credenciais da Pluggy</h2>
            <p className="text-xs text-muted-foreground">
              Cada usuário conecta com a própria aplicação Pluggy — assim cada um tem seu próprio
              limite de uso, sem depender das credenciais de mais ninguém.
            </p>
          </div>
          <span
            className={cn(
              "ml-auto rounded-full px-3 py-1 text-xs font-medium",
              hasCredentials ? "bg-income-soft text-income" : "bg-muted text-muted-foreground",
            )}
          >
            {hasCredentials ? "✅ configurado" : "⏳ não configurado"}
          </span>
        </div>

        <ol className="mt-4 list-decimal space-y-1 rounded-md bg-muted/50 p-3 pl-8 text-xs text-muted-foreground">
          <li>
            Acesse{" "}
            <a
              className="underline"
              href="https://dashboard.pluggy.ai/applications"
              target="_blank"
              rel="noreferrer"
            >
              dashboard.pluggy.ai/applications
            </a>
            , entre (ou crie sua conta) e abra sua aplicação — se não tiver uma, crie uma nova ali
            mesmo.
          </li>
          <li>Copie o Client ID e o Client Secret dessa aplicação e cole nos campos abaixo.</li>
          <li>
            Pra conectar um banco, use o botão "Conectar novo banco" logo abaixo — ele já abre o
            conector da Pluggy com a sua aplicação.
          </li>
          <li>
            Prefere conectar direto pela Pluggy? Acesse{" "}
            <a className="underline" href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">
              meu.pluggy.ai
            </a>{" "}
            e conecte suas contas por lá. Depois, na sua aplicação em dashboard.pluggy.ai, clique no
            ▶ (play) pra testar a conexão e conecte a todas as contas que quiser, buscando por "Meu
            Pluggy" no lugar do nome do banco.
          </li>
          <li>
            Pra cada conta conectada assim, copie o Item ID mostrado na Pluggy e cole no campo "IDs
            de itens existentes" mais abaixo — um por linha se forem vários.
          </li>
        </ol>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium uppercase text-muted-foreground">Client ID</span>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="ex.: 3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Client Secret
            </span>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={hasCredentials ? "•••••••••••••••• (já salvo)" : "cole aqui"}
            />
          </label>
          <Button
            onClick={() => void saveCredentials()}
            disabled={savingCredentials || !clientId.trim() || !clientSecret.trim()}
          >
            {savingCredentials ? <Loader2 className="animate-spin" /> : null}Salvar credenciais
          </Button>
        </div>
      </section>

      {!hasCredentials ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Landmark className="mx-auto mb-3 size-8 text-muted-foreground" />
          Salve suas credenciais da Pluggy acima pra liberar a conexão bancária automática.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Conexão automática com o banco</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Conecte sua conta ou cartão via Open Finance (Pluggy) e os lançamentos entram
                  automaticamente em Contas e Cartões de crédito, sem precisar importar arquivo.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void connectNewBank()} disabled={connecting}>
                  {connecting ? <Loader2 className="animate-spin" /> : <Plus />}
                  Conectar novo banco
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void testUpdateConnect()}
                  disabled={connecting}
                  title="Experimental: pede o connect_token em modo atualização (itemId da conexão mais recente, ou do campo manual abaixo) em vez de criar um item novo"
                >
                  {connecting ? <Loader2 className="animate-spin" /> : <KeyRound />}
                  Teste de update
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-3">
              <div className="flex-1 text-xs text-muted-foreground">
                Já existem itens conectados direto pela Pluggy (dashboard deles, sandbox etc.)?
                Busca todos automaticamente e deixa você escolher quais conectar, sem colar ID por
                ID — se a listagem direta não estiver habilitada pra sua conta, abre o conector pra
                localizar do mesmo jeito.
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void discoverItems()}
                disabled={discovering}
              >
                {discovering ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Buscar itens automaticamente
              </Button>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Não funcionou? Cole os IDs manualmente (a busca automática é um recurso opt-in da
                Pluggy — pode não estar habilitado pra sua conta)
              </summary>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="min-w-[260px] flex-1 space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Um ID por linha (ou separados por vírgula)
                  </span>
                  <textarea
                    className={cn(selectClass, "h-20 resize-y py-2")}
                    value={manualItemIds}
                    onChange={(e) => setManualItemIds(e.target.value)}
                    placeholder={
                      "a5922b13-8b65-4726-9b2a-434a0b36af97\nb6a33c24-9c76-4837-8a3b-545b1c47bg08"
                    }
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={() => void registerManualItems()}
                  disabled={registeringManual || !manualItemIds.trim()}
                >
                  {registeringManual ? <Loader2 className="animate-spin" /> : null}
                  Registrar itens
                </Button>
              </div>
            </details>
          </section>

          {!connections.length ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum banco conectado ainda.
            </div>
          ) : (
            <section className="rounded-lg border border-border bg-card">
              <div className="divide-y divide-border">
                {connections.map((connection) => {
                  const status = statusLabel[connection.status] ?? statusLabel["connecting"]!;
                  const hoursSinceSync = connection.last_synced_at
                    ? (Date.now() - new Date(connection.last_synced_at).getTime()) /
                      (60 * 60 * 1000)
                    : null;
                  const hoursRemaining =
                    hoursSinceSync !== null ? Math.ceil(12 - hoursSinceSync) : 0;
                  const throttled = hoursRemaining > 0;
                  const account = accountByConnection.get(connection.id);
                  const branch = maskTail(account?.branch_number ?? null, 2);
                  const accountNumber = maskTail(account?.account_number ?? null, 3);
                  const owner = firstName(account?.owner_name ?? null);
                  return (
                    <div
                      key={connection.id}
                      className="flex flex-wrap items-center gap-3 px-5 py-4"
                    >
                      <Landmark className="size-8 flex-none text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {connection.connector_name || "Banco conectado"}
                        </p>
                        {(account?.institution || branch || accountNumber || owner) && (
                          <p className="text-xs text-muted-foreground">
                            {[
                              account?.institution,
                              owner,
                              branch && `Ag. ${branch}`,
                              accountNumber && `Conta ${accountNumber}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {connection.last_synced_at
                            ? `Última sincronização ${new Date(connection.last_synced_at).toLocaleString("pt-BR")}`
                            : "Ainda não sincronizado"}
                          {" · atualiza automaticamente todo dia às 18:00"}
                        </p>
                        {connection.status_detail && (
                          <p className="mt-0.5 text-xs text-destructive">
                            {connection.status_detail}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium",
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void syncNow(connection)}
                        disabled={syncingId === connection.id || throttled}
                        title={throttled ? `Disponível em ${hoursRemaining}h` : undefined}
                      >
                        {syncingId === connection.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RefreshCw />
                        )}
                        {throttled ? `Disponível em ${hoursRemaining}h` : "Sincronizar agora"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(connection)}
                        aria-label="Remover conexão"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <Dialog
        open={!!picker}
        onOpenChange={(open) => {
          if (open) return;
          // Trava o fechamento enquanto tá conectando um por um, pra não
          // perder o acompanhamento no meio.
          if (connectProgress && connectProgress.current < connectProgress.total) return;
          closePicker();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {!connectProgress ? (
            <>
              <DialogHeader>
                <DialogTitle>Escolha o que conectar</DialogTitle>
                <DialogDescription>
                  Encontramos {picker?.items.length ?? 0} item(ns) na Pluggy. Marque os que quiser
                  conectar — os já conectados vêm desmarcados.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {picker?.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={picker.selected.has(item.id)}
                      onChange={(e) => toggleItem(item.id, e.target.checked)}
                    />
                    <span className="flex-1">{item.name}</span>
                    {item.alreadyConnected && (
                      <span className="text-xs text-muted-foreground">já conectado</span>
                    )}
                  </label>
                ))}
              </div>
              <Button onClick={() => void connectSelected()} disabled={!picker?.selected.size}>
                Conectar {picker?.selected.size ?? 0} selecionado(s)
              </Button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {connectProgress.current >= connectProgress.total
                    ? `Concluído — ${connectProgress.results.filter((r) => r.ok).length} de ${connectProgress.total} conectado(s)`
                    : `Conectando ${connectProgress.current + 1} de ${connectProgress.total}`}
                </DialogTitle>
              </DialogHeader>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(connectProgress.current / connectProgress.total) * 100}%` }}
                />
              </div>
              <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto text-sm">
                {(picker?.items.filter((i) => picker.selected.has(i.id)) ?? []).map((item, idx) => {
                  const result = connectProgress.results.find((r) => r.id === item.id);
                  return (
                    <li key={item.id} className="flex items-center gap-2">
                      {result ? (
                        result.ok ? (
                          <CheckCircle2 className="size-4 flex-none text-income" />
                        ) : (
                          <XCircle className="size-4 flex-none text-destructive" />
                        )
                      ) : idx === connectProgress.current ? (
                        <Loader2 className="size-4 flex-none animate-spin text-muted-foreground" />
                      ) : (
                        <span className="size-4 flex-none" />
                      )}
                      <span className="flex-1">{item.name}</span>
                      {result && !result.ok && (
                        <span className="text-xs text-destructive">{result.error}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {connectProgress.current >= connectProgress.total && (
                <Button onClick={closePicker}>Concluir</Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão bancária</AlertDialogTitle>
            <AlertDialogDescription>
              Isso revoga o acesso da Pluggy a "{pendingDelete?.connector_name || "este banco"}" e
              para as sincronizações automáticas. As contas, cartões e lançamentos já importados
              continuam no seu histórico normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={() => void performDelete()}>
              {deleting ? <Loader2 className="animate-spin" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
