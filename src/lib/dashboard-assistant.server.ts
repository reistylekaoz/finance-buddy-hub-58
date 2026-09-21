import { WIDGET_INFO, sanitizeWidgetOrder, type WidgetId } from "@/lib/dashboard-widgets";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Pede pra IA reorganizar os painéis do dashboard a partir de um pedido em
// texto livre (ex.: "esconde o gráfico e deixa só orçamento e previsões").
// Recebe a ordem/visibilidade atual pra preservar o que não foi mencionado
// no pedido — o modelo devolve a lista completa de painéis que devem ficar
// visíveis, na ordem desejada, mais uma confirmação curta pro usuário ler.
export async function interpretDashboardWidgets(
  userText: string,
  currentOrder: WidgetId[],
): Promise<{ order: WidgetId[]; reply: string }> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "Assistente do dashboard não configurado: defina ANTHROPIC_API_KEY nas variáveis de ambiente do Lovable Cloud.",
    );
  }

  const widgetsBlock = WIDGET_INFO.map(
    (w) => `- id: ${w.id} | nome: "${w.label}" | mostra: ${w.description}`,
  ).join("\n");
  const currentBlock = currentOrder.length
    ? currentOrder.join(", ")
    : "nenhum (o usuário escondeu todos os painéis)";

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system:
        "Você ajusta os painéis visíveis do dashboard financeiro de um usuário, a partir de um pedido em texto livre. Painéis disponíveis:\n" +
        widgetsBlock +
        '\n\nResponda SOMENTE com um objeto JSON, sem nenhum texto antes ou depois, no formato exato: {"order":["<ids na ordem desejada, só os que devem ficar visíveis>"],"reply":"<confirmação curta e amigável em português, no máximo 1 frase>"}. Use apenas os ids listados acima. Painéis que já estavam visíveis e não foram mencionados no pedido continuam visíveis, na mesma posição relativa; o mesmo vale pros escondidos.',
      messages: [
        {
          role: "user",
          content: `Painéis visíveis hoje, nessa ordem: ${currentBlock}.\n\nPedido do usuário: "${userText}"`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic respondeu ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((block) => block.type === "text")?.text ?? "";
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch) {
    throw new Error(`Resposta do assistente não veio em JSON: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]) as { order?: unknown; reply?: unknown };
  const order = sanitizeWidgetOrder(parsed.order);
  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Prontinho, ajustei os painéis.";
  return { order, reply };
}
