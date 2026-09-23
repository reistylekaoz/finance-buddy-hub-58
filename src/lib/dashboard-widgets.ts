// Catálogo dos painéis que compõem o Dashboard, usado tanto pela UI de
// personalização (client) quanto pelo assistente (server, ao montar o
// prompt e validar a resposta) — fonte única pra não desalinhar os dois.
export type WidgetId =
  | "asset_allocation"
  | "insights"
  | "budgets"
  | "forecasts"
  | "chart"
  | "projected_balance"
  | "recent_transactions"
  | "category_breakdown"
  | "cost_center_summary";

export const WIDGET_INFO: { id: WidgetId; label: string; description: string }[] = [
  {
    id: "asset_allocation",
    label: "Para onde está o patrimônio",
    description: "saldo em contas, investimentos por tipo e patrimônio, com % do total",
  },
  {
    id: "insights",
    label: "Insights",
    description:
      "observações automáticas do mês: maior categoria de gasto, comparação com o mês anterior, taxa de poupança, maior despesa e assinaturas recorrentes detectadas",
  },
  {
    id: "budgets",
    label: "Controle orçamentário",
    description: "andamento das metas de orçamento ativas (gasto vs. limite)",
  },
  {
    id: "forecasts",
    label: "Previsões",
    description: "provisões vencidas e as deste mês, com botão pra confirmar",
  },
  {
    id: "chart",
    label: "Gráfico receita × despesa",
    description: "gráfico de barras dos últimos seis meses",
  },
  {
    id: "projected_balance",
    label: "Saldo projetado",
    description: "saldo atual mais as provisões futuras, num gráfico de área",
  },
  {
    id: "recent_transactions",
    label: "Movimentações recentes",
    description: "lista dos últimos lançamentos",
  },
  {
    id: "category_breakdown",
    label: "Demonstrativo por categoria",
    description: "receita e despesa detalhados por categoria e subcategoria",
  },
  {
    id: "cost_center_summary",
    label: "Resultado por centro de custo",
    description: "receita e despesa somadas por centro de custo",
  },
];

export const WIDGET_IDS = WIDGET_INFO.map((w) => w.id);
export const WIDGET_LABELS: Record<WidgetId, string> = Object.fromEntries(
  WIDGET_INFO.map((w) => [w.id, w.label]),
) as Record<WidgetId, string>;

export const DEFAULT_WIDGET_ORDER: WidgetId[] = WIDGET_INFO.map((w) => w.id);

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && (WIDGET_IDS as string[]).includes(value);
}

// Valida uma lista qualquer (vinda do banco ou da resposta do assistente):
// mantém só ids conhecidos, sem repetição. Só cai no padrão (todos os
// painéis, na ordem original) quando o valor nem é uma lista — um array
// vazio é respeitado (o usuário pode ter pedido pra esconder tudo).
export function sanitizeWidgetOrder(raw: unknown): WidgetId[] {
  if (!Array.isArray(raw)) return DEFAULT_WIDGET_ORDER;
  const seen = new Set<WidgetId>();
  const order: WidgetId[] = [];
  for (const item of raw) {
    if (isWidgetId(item) && !seen.has(item)) {
      seen.add(item);
      order.push(item);
    }
  }
  return order;
}
