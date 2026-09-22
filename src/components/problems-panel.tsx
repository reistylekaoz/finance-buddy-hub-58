import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveProfile } from "@/components/active-profile";
import type { Database } from "@/integrations/supabase/types";

type TicketRow = Database["public"]["Tables"]["support_tickets"]["Row"];

const SOURCE_LABELS: Record<string, string> = {
  bank_sync: "Sincronização bancária",
  balance_check: "Divergência de saldo",
};

export function ProblemsPanel({ onCountChange }: { onCountChange?: (openCount: number) => void }) {
  const { activeProfile } = useActiveProfile();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", activeProfile.ownerUserId)
      .order("created_at", { ascending: false });
    const rows = data ?? [];
    setTickets(rows);
    onCountChange?.(rows.filter((t) => t.status !== "resolved").length);
    setLoading(false);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile.ownerUserId]);

  async function resolve(id: string) {
    setResolvingId(id);
    setTickets((current) => {
      const next = current.map((t) => (t.id === id ? { ...t, status: "resolved" } : t));
      onCountChange?.(next.filter((t) => t.status !== "resolved").length);
      return next;
    });
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: "resolved" })
      .eq("id", id);
    setResolvingId(null);
    if (error) {
      toast.error(error.message);
      await load();
    }
  }

  const openTickets = tickets.filter((t) => t.status !== "resolved");
  const visible = showResolved ? tickets : openTickets;

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando problemas…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {openTickets.length
            ? `${openTickets.length} problema${openTickets.length === 1 ? "" : "s"} em aberto.`
            : "Nenhum problema em aberto — tudo certo por aqui."}
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? "Só abertos" : "Ver resolvidos também"}
        </Button>
      </div>

      {!visible.length ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum problema por aqui.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((t) => (
            <div
              key={t.id}
              className={cn(
                "rounded-lg border p-4",
                t.status === "resolved"
                  ? "border-border bg-card opacity-60"
                  : "border-destructive/40 bg-destructive-soft/40",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {t.status === "resolved" ? (
                    <CheckCircle2 className="mt-0.5 size-5 flex-none text-income" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-5 flex-none text-destructive" />
                  )}
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {SOURCE_LABELS[t.source] ?? t.source} ·{" "}
                      {new Date(t.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                {t.status !== "resolved" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resolvingId === t.id}
                    onClick={() => void resolve(t.id)}
                  >
                    Marcar como resolvido
                  </Button>
                )}
              </div>
              {t.description && (
                <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                  {t.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
