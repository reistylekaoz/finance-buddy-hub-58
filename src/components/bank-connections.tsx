import { useEffect, useState } from "react";
import { Landmark, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  createPluggyConnectToken,
  deleteBankConnection,
  registerBankConnection,
  syncBankConnection,
} from "@/lib/pluggy.functions";
import type { Database } from "@/integrations/supabase/types";

type BankConnection = Database["public"]["Tables"]["bank_connections"]["Row"];

// Widget oficial da Pluggy, versão fixada conforme o exemplo publicado pela
// própria Pluggy (github.com/pluggyai/quickstart). Não é um pacote npm deste
// projeto para não depender de instalar dependência nova.
const PLUGGY_WIDGET_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js";

type PluggyConnectInstance = { init: () => void };
type PluggyConnectOptions = {
  connectToken: string;
  includeSandbox?: boolean;
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

export function BankConnections({ onSynced }: { onSynced: () => void }) {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankConnection | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("bank_connections")
      .select("*")
      .order("created_at", { ascending: false });
    setConnections(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function registerExistingItem(pluggyItemId: string) {
    try {
      await registerBankConnection({ data: { pluggyItemId } });
      toast.success("Conexão existente reaproveitada! Sincronizando lançamentos…");
      await load();
      onSynced();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao reaproveitar conexão existente.",
      );
    }
  }

  async function connectNewBank() {
    setConnecting(true);
    try {
      await loadPluggyWidget();
      const { connectToken } = await createPluggyConnectToken({
        data: { oauthRedirectUrl: window.location.href },
      });
      if (!window.PluggyConnect) throw new Error("Widget da Pluggy indisponível.");
      const widget = new window.PluggyConnect({
        connectToken,
        // Mostra também os conectores de teste da Pluggy; troque para false
        // ao usar credenciais de produção com usuários reais.
        includeSandbox: true,
        onSuccess: (itemData) => {
          void (async () => {
            try {
              await registerBankConnection({ data: { pluggyItemId: itemData.item.id } });
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
          // mesmas credenciais (ITEM_USER_ALREADY_EXISTS) e devolve os ids
          // dos itens existentes; em vez de falhar, reaproveitamos um deles.
          const details = error as { message?: string; data?: { items?: string[] } };
          const existingItemId = details?.data?.items?.at(-1);
          if (details?.message === "ITEM_USER_ALREADY_EXISTS" && existingItemId) {
            void registerExistingItem(existingItemId).finally(() => setConnecting(false));
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

  const [manualItemId, setManualItemId] = useState("");
  const [registeringManual, setRegisteringManual] = useState(false);
  async function registerManualItem() {
    if (!manualItemId.trim()) return;
    setRegisteringManual(true);
    await registerExistingItem(manualItemId.trim());
    setRegisteringManual(false);
    setManualItemId("");
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Conexão automática com o banco</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Conecte sua conta ou cartão via Open Finance (Pluggy) e os lançamentos entram
              automaticamente em Contas e Cartões de crédito, sem precisar importar arquivo.
            </p>
          </div>
          <Button onClick={() => void connectNewBank()} disabled={connecting}>
            {connecting ? <Loader2 className="animate-spin" /> : <Plus />}
            Conectar novo banco
          </Button>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Já tem um item existente na Pluggy (erro "ITEM_USER_ALREADY_EXISTS")?
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-[260px] flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">ID do item</span>
              <Input
                value={manualItemId}
                onChange={(e) => setManualItemId(e.target.value)}
                placeholder="ex.: a5922b13-8b65-4726-9b2a-434a0b36af97"
              />
            </label>
            <Button
              variant="outline"
              onClick={() => void registerManualItem()}
              disabled={registeringManual || !manualItemId.trim()}
            >
              {registeringManual ? <Loader2 className="animate-spin" /> : null}
              Registrar item existente
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
                ? (Date.now() - new Date(connection.last_synced_at).getTime()) / (60 * 60 * 1000)
                : null;
              const hoursRemaining = hoursSinceSync !== null ? Math.ceil(12 - hoursSinceSync) : 0;
              const throttled = hoursRemaining > 0;
              return (
                <div key={connection.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <Landmark className="size-8 flex-none text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {connection.connector_name || "Banco conectado"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {connection.last_synced_at
                        ? `Última sincronização ${new Date(connection.last_synced_at).toLocaleString("pt-BR")}`
                        : "Ainda não sincronizado"}
                      {" · atualiza automaticamente todo dia à 01:00"}
                    </p>
                    {connection.status_detail && (
                      <p className="mt-0.5 text-xs text-destructive">{connection.status_detail}</p>
                    )}
                  </div>
                  <span
                    className={cn("rounded-full px-3 py-1 text-xs font-medium", status.className)}
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
