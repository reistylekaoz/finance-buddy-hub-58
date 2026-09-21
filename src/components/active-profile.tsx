import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ProfileOption = {
  ownerUserId: string;
  displayName: string;
  isOwner: boolean;
  canEdit: boolean;
  canManageConnections: boolean;
  canManageMembers: boolean;
};

type ActiveProfileContextValue = {
  activeProfile: ProfileOption;
  profiles: ProfileOption[];
  switchProfile: (ownerUserId: string) => void;
};

const ActiveProfileContext = createContext<ActiveProfileContextValue | null>(null);

export function useActiveProfile(): ActiveProfileContextValue {
  const ctx = useContext(ActiveProfileContext);
  if (!ctx) {
    throw new Error("useActiveProfile precisa ser usado dentro de <ActiveProfileProvider>.");
  }
  return ctx;
}

async function loadProfiles(): Promise<{ myId: string; profiles: ProfileOption[] } | null> {
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData.user?.id;
  if (!myId) return null;

  const [{ data: memberships }, { data: myProfile }] = await Promise.all([
    supabase
      .from("account_members")
      .select("owner_user_id, can_edit, can_manage_connections, can_manage_members")
      .eq("member_user_id", myId)
      .eq("status", "accepted"),
    supabase.from("profiles").select("display_name").eq("id", myId).maybeSingle(),
  ]);

  const ownerIds = (memberships ?? []).map((m) => m.owner_user_id);
  const { data: ownerProfiles } = ownerIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ownerIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((ownerProfiles ?? []).map((p) => [p.id, p.display_name]));

  const profiles: ProfileOption[] = [
    {
      ownerUserId: myId,
      displayName: myProfile?.display_name || "Minha conta",
      isOwner: true,
      canEdit: true,
      canManageConnections: true,
      canManageMembers: true,
    },
    ...(memberships ?? []).map((m) => ({
      ownerUserId: m.owner_user_id,
      displayName: nameOf.get(m.owner_user_id) || "Conta compartilhada",
      isOwner: false,
      canEdit: m.can_edit,
      canManageConnections: m.can_manage_connections,
      canManageMembers: m.can_manage_members,
    })),
  ];
  return { myId, profiles };
}

// Envolve a área autenticada: descobre quantas contas o login atual pode
// acessar (a própria + as que outras pessoas compartilharam com ele) — com
// só uma, entra direto; com mais de uma, pede confirmação antes de mostrar
// qualquer dado.
export function ActiveProfileProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await loadProfiles();
    if (result) {
      setProfiles(result.profiles);
      setSelectedOwnerId(result.profiles.length === 1 ? result.profiles[0]!.ownerUserId : null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeProfile = profiles.find((p) => p.ownerUserId === selectedOwnerId) ?? null;
  if (!activeProfile) {
    return <ProfilePicker profiles={profiles} onSelect={setSelectedOwnerId} />;
  }

  return (
    <ActiveProfileContext.Provider
      value={{ activeProfile, profiles, switchProfile: setSelectedOwnerId }}
    >
      {children}
    </ActiveProfileContext.Provider>
  );
}

function ProfilePicker({
  profiles,
  onSelect,
}: {
  profiles: ProfileOption[];
  onSelect: (ownerUserId: string) => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold">Qual conta você quer acessar?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seu login tem acesso a mais de uma conta no Fluxora.
        </p>
        <div className="mt-6 space-y-2">
          {profiles.map((p) => (
            <button
              key={p.ownerUserId}
              onClick={() => onSelect(p.ownerUserId)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary-soft/40"
            >
              <div className="grid size-10 flex-none place-items-center rounded-full bg-primary-soft text-primary">
                <Users className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {p.isOwner ? "Sua conta" : p.canEdit ? "Acesso compartilhado" : "Só visualização"}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Botão pra trocar de conta sem sair do login — só aparece quando existe mais
// de uma conta disponível (senão é um botão que nunca faz nada útil).
export function ProfileSwitcher({ className }: { className?: string }) {
  const { activeProfile, profiles, switchProfile } = useActiveProfile();
  if (profiles.length < 2) return null;
  return (
    <Button
      variant="ghost"
      className={cn("justify-start text-muted-foreground", className)}
      // string vazia não casa com nenhum perfil: o provider volta a mostrar o seletor.
      onClick={() => switchProfile("")}
    >
      <Users />
      <span className="truncate">{activeProfile.displayName}</span>
    </Button>
  );
}
