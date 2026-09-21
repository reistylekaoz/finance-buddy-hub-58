import { useEffect, useState } from "react";
import { Copy, Loader2, Trash2, UserPlus } from "lucide-react";
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
import { useActiveProfile } from "@/components/active-profile";
import type { Database } from "@/integrations/supabase/types";

type MemberRow = Database["public"]["Tables"]["account_members"]["Row"];

function inviteLink(token: string): string {
  return `${window.location.origin}/convite/${token}`;
}

export function AccessProfiles() {
  const { activeProfile } = useActiveProfile();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newCanEdit, setNewCanEdit] = useState(true);
  const [newCanManageConnections, setNewCanManageConnections] = useState(false);
  const [newCanManageMembers, setNewCanManageMembers] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("account_members")
      .select("*")
      .eq("owner_user_id", activeProfile.ownerUserId)
      .order("invited_at", { ascending: false });
    setMembers(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile.ownerUserId]);

  async function invite() {
    if (!newEmail.trim()) return;
    setInviting(true);
    const { error } = await supabase.from("account_members").insert({
      owner_user_id: activeProfile.ownerUserId,
      email: newEmail.trim(),
      can_edit: newCanEdit,
      can_manage_connections: newCanManageConnections,
      can_manage_members: newCanManageMembers,
    });
    setInviting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewEmail("");
    setNewCanEdit(true);
    setNewCanManageConnections(false);
    setNewCanManageMembers(false);
    toast.success("Convite criado — copie o link e mande pra pessoa.");
    await load();
  }

  async function updatePermission(member: MemberRow, patch: Partial<MemberRow>) {
    setSavingId(member.id);
    setMembers((current) => current.map((m) => (m.id === member.id ? { ...m, ...patch } : m)));
    const { error } = await supabase.from("account_members").update(patch).eq("id", member.id);
    setSavingId(null);
    if (error) toast.error(error.message);
  }

  async function removeMember() {
    if (!pendingRemove) return;
    setRemoving(true);
    const { error } = await supabase.from("account_members").delete().eq("id", pendingRemove.id);
    setRemoving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPendingRemove(null);
    await load();
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      toast.success("Link copiado.");
    } catch {
      toast.error("Não deu pra copiar — copie o link manualmente.");
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Carregando perfis de acesso…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <UserPlus className="size-6 text-primary" />
          <div>
            <h2 className="font-semibold">Convidar alguém</h2>
            <p className="text-xs text-muted-foreground">
              Gera um link único — mande pra pessoa por WhatsApp, e-mail ou qualquer outro meio.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium uppercase text-muted-foreground">E-mail</span>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="pessoa@email.com"
            />
          </label>
          <Button onClick={() => void invite()} disabled={inviting || !newEmail.trim()}>
            {inviting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Convidar
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={newCanEdit}
              onChange={(e) => setNewCanEdit(e.target.checked)}
            />
            Editar dados financeiros
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={newCanManageConnections}
              onChange={(e) => setNewCanManageConnections(e.target.checked)}
            />
            Gerenciar conexões bancárias
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={newCanManageMembers}
              onChange={(e) => setNewCanManageMembers(e.target.checked)}
            />
            Gerenciar outros membros
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Quem tem acesso</h2>
        </div>
        {!members.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Ninguém convidado ainda.</p>
        ) : (
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.status === "accepted"
                      ? "✅ Aceito"
                      : m.status === "revoked"
                        ? "Revogado"
                        : "⏳ Pendente"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--primary)]"
                      checked={m.can_edit}
                      disabled={savingId === m.id}
                      onChange={(e) => void updatePermission(m, { can_edit: e.target.checked })}
                    />
                    Editar
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--primary)]"
                      checked={m.can_manage_connections}
                      disabled={savingId === m.id}
                      onChange={(e) =>
                        void updatePermission(m, { can_manage_connections: e.target.checked })
                      }
                    />
                    Conexões
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--primary)]"
                      checked={m.can_manage_members}
                      disabled={savingId === m.id}
                      onChange={(e) =>
                        void updatePermission(m, { can_manage_members: e.target.checked })
                      }
                    />
                    Membros
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  {m.status === "pending" && (
                    <Button variant="ghost" size="sm" onClick={() => void copyLink(m.invite_token)}>
                      <Copy className="size-4" />
                      Copiar convite
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPendingRemove(m)}
                    aria-label="Remover acesso"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover acesso de {pendingRemove?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa deixa de conseguir ver ou editar os dados dessa conta imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void removeMember();
              }}
            >
              {removing ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
