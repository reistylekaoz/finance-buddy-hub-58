import { createFileRoute } from "@tanstack/react-router";
import { FinanceApp } from "@/components/finance-app";
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão geral | Fluxora" },
      {
        name: "description",
        content: "Acompanhe contas, receitas, despesas, fluxo de caixa e patrimônio no Fluxora.",
      },
      { property: "og:title", content: "Visão geral | Fluxora" },
      { property: "og:description", content: "Seu controle financeiro pessoal completo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceApp,
});
