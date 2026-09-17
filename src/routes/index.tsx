import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth" });
  },
  head: () => ({ meta: [
    { title: "Fluxora | Gestão financeira pessoal" },
    { name: "description", content: "Organize contas, lançamentos, categorias e patrimônio em um só lugar." },
    { property: "og:title", content: "Fluxora | Gestão financeira pessoal" },
    { property: "og:description", content: "Organize sua vida financeira com clareza." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => null,
});
