import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, Loader2, TriangleAlert } from "lucide-react";
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

// LGPD art. 18: exportar (portabilidade) e excluir (eliminação) os
// próprios dados, self-service, sem precisar pedir para um humano.
//
// Isso sempre age sobre a conta de LOGIN de quem está clicando (o
// context.userId do token, em account.functions.ts) — não sobre "a conta
// ativa" que a pessoa esteja vendo no momento via perfil compartilhado.
// Por isso aparece igual pra dono e pra membro convidado: cada um só
// mexe no próprio login, nunca no de quem compartilhou a conta com ele.
export function AccountDataSection() {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const { exportUserData } = await import("@/lib/account.functions");
      const data = await exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fluxora-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Seus dados foram baixados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao exportar seus dados.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { deleteAccount } = await import("@/lib/account.functions");
      await deleteAccount();
      await supabase.auth.signOut();
      navigate({ to: "/auth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir a conta.");
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-lg border border-destructive/40 bg-card p-5">
      <div className="flex items-center gap-3">
        <TriangleAlert className="size-6 text-destructive" />
        <div>
          <h2 className="font-semibold">Sua conta de login</h2>
          <p className="text-xs text-muted-foreground">
            Exporte uma cópia de tudo que você cadastrou ou exclua permanentemente seu login do
            Fluxora — isso vale pro seu próprio acesso, mesmo se você estiver vendo uma conta
            compartilhada por outra pessoa no momento.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          Exportar meus dados
        </Button>
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          Excluir minha conta
        </Button>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sua conta permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga seu login e todos os dados que você é dono — contas, cartões, lançamentos,
              categorias, patrimônio, investimentos, orçamentos, conexões bancárias e perfis do
              Telegram — sem volta. Se você é dono de uma conta compartilhada, os membros perdem o
              acesso a ela. Se quiser guardar uma cópia antes, use "Exportar meus dados".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Digite EXCLUIR para confirmar
            </span>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || confirmText !== "EXCLUIR"}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="animate-spin" /> : null}Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
