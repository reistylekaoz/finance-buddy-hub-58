import { useEffect, useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/convite/$token")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.pathname } });
    }
  },
  head: () => ({
    meta: [{ title: "Convite | Fluxora" }],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const { error } = await supabase.rpc("accept_account_invite", { p_token: token });
      if (error) {
        setStatus("error");
        setMessage(error.message);
      } else {
        setStatus("ok");
      }
    })();
  }, [token]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto size-10 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Confirmando seu convite…</p>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="mx-auto size-10 text-income" />
            <h1 className="mt-4 font-display text-2xl font-semibold">Convite aceito!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Você já tem acesso a essa conta — escolha ela na próxima vez que entrar.
            </p>
            <Button className="mt-6" asChild>
              <Link to="/dashboard">Ir para o Fluxora</Link>
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="mx-auto size-10 text-destructive" />
            <h1 className="mt-4 font-display text-2xl font-semibold">Convite inválido</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <Button className="mt-6" variant="outline" asChild>
              <Link to="/dashboard">Ir para o Fluxora</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
