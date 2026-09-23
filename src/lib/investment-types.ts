// Rótulos dos tipos de investimento (a Pluggy usa códigos em inglês) —
// compartilhado entre a tela de Investimentos e o card de alocação no Dashboard.
export const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  COE: "COE",
  EQUITY: "Ações",
  ETF: "ETF",
  FIXED_INCOME: "Renda fixa",
  MUTUAL_FUND: "Fundo de investimento",
  SECURITY: "Título",
  OTHER: "Outro",
};

export function investmentTypeLabel(type: string): string {
  return INVESTMENT_TYPE_LABELS[type] ?? type;
}
