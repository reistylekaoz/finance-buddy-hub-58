import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

const TELEGRAM_API_BASE = "https://api.telegram.org";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Usado só quando o usuário manda áudio — ainda não transcrevemos (fase 2 do
// item 4 do roadmap: transcrição de voz).
const VOICE_NOT_SUPPORTED_YET =
  "Ainda não consigo ouvir áudios — por enquanto, escreva a categorização em texto. 🎙️➡️📝 em breve.";

function getTelegramToken(): string {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    throw new Error(
      "Bot do Telegram não configurado: defina TELEGRAM_BOT_TOKEN nas variáveis de ambiente do Lovable Cloud.",
    );
  }
  return token;
}

async function telegramFetch<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = getTelegramToken();
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram respondeu erro em ${method}: ${data.description}`);
  return data.result as T;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  await telegramFetch("sendMessage", { chat_id: chatId, text });
}

export async function setTelegramWebhook(webhookUrl: string): Promise<void> {
  await telegramFetch("setWebhook", { url: webhookUrl });
}

type TelegramUpdate = {
  message?: {
    chat: { id: number | string };
    from?: { username?: string };
    text?: string;
    voice?: unknown;
  };
};

type PendingItem = {
  id: string;
  kind: "bank" | "card";
  transaction_type: "income" | "expense";
  description: string;
  amount: number;
  label: string;
};

type CategoryOption = {
  id: string;
  name: string;
  category_type: "income" | "expense";
};

function stripAt(username: string): string {
  return username.startsWith("@") ? username.slice(1) : username;
}

async function findOrLinkProfile(
  supabase: Db,
  chatId: string,
  fromUsername: string | undefined,
): Promise<{ id: string; display_name: string } | null> {
  const { data: byChat } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (byChat) return byChat;

  if (!fromUsername) return null;
  const { data: byUsername } = await supabase
    .from("profiles")
    .select("id, display_name")
    .ilike("telegram_username", stripAt(fromUsername))
    .maybeSingle();
  if (!byUsername) return null;

  await supabase.from("profiles").update({ telegram_chat_id: chatId }).eq("id", byUsername.id);
  return byUsername;
}

async function fetchPendingItems(supabase: Db, userId: string, ids: Record<string, unknown>) {
  const transactionIds = Array.isArray(ids["transaction_ids"])
    ? (ids["transaction_ids"] as string[])
    : [];
  const cardTransactionIds = Array.isArray(ids["card_transaction_ids"])
    ? (ids["card_transaction_ids"] as string[])
    : [];

  const items: PendingItem[] = [];
  if (transactionIds.length) {
    const { data } = await supabase
      .from("transactions")
      .select("id, transaction_type, description, amount, reviewed_at")
      .eq("user_id", userId)
      .in("id", transactionIds)
      .is("reviewed_at", null);
    for (const row of data ?? []) {
      if (row.transaction_type === "transfer") continue;
      items.push({
        id: row.id,
        kind: "bank",
        transaction_type: row.transaction_type,
        description: row.description,
        amount: Number(row.amount),
        label: `${row.description} · ${money(row.amount)}`,
      });
    }
  }
  if (cardTransactionIds.length) {
    const { data } = await supabase
      .from("credit_card_transactions")
      .select("id, description, amount, reviewed_at")
      .eq("user_id", userId)
      .in("id", cardTransactionIds)
      .is("reviewed_at", null);
    for (const row of data ?? []) {
      items.push({
        id: row.id,
        kind: "card",
        transaction_type: "expense",
        description: row.description,
        amount: Number(row.amount),
        label: `${row.description} · ${money(row.amount)} (cartão)`,
      });
    }
  }
  return items;
}

function money(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

async function interpretCategorization(
  items: PendingItem[],
  categories: CategoryOption[],
  userText: string,
): Promise<Map<string, string | null>> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "Assistente de categorização não configurado: defina ANTHROPIC_API_KEY nas variáveis de ambiente do Lovable Cloud.",
    );
  }

  const itemsBlock = items
    .map(
      (item) =>
        `- id: ${item.id} | tipo: ${item.transaction_type} | descrição: "${item.description}" | valor: ${money(item.amount)}`,
    )
    .join("\n");
  const categoriesBlock = categories
    .map(
      (category) =>
        `- id: ${category.id} | nome: "${category.name}" | tipo: ${category.category_type}`,
    )
    .join("\n");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system:
        'Você categoriza lançamentos financeiros brasileiros a partir de uma mensagem livre que o usuário mandou pelo Telegram. Responda SOMENTE com um array JSON, sem nenhum texto antes ou depois, no formato exato: [{"id":"<id do lançamento>","category_id":"<id da categoria escolhida ou null>"}] — um item para cada lançamento pendente listado, na mesma ordem. Use null quando não conseguir identificar a categoria com confiança a partir da mensagem.',
      messages: [
        {
          role: "user",
          content: `Lançamentos pendentes:\n${itemsBlock}\n\nCategorias disponíveis:\n${categoriesBlock}\n\nMensagem do usuário: "${userText}"`,
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
  const jsonMatch = /\[[\s\S]*\]/.exec(text);
  if (!jsonMatch) throw new Error(`Resposta do assistente não veio em JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]) as { id: string; category_id: string | null }[];

  const result = new Map<string, string | null>();
  for (const row of parsed) result.set(row.id, row.category_id);
  return result;
}

async function handleCategorizationReply(
  supabase: Db,
  userId: string,
  chatId: string,
  text: string,
): Promise<string> {
  const { data: digest } = await supabase
    .from("telegram_digests")
    .select("id, transaction_ids, card_transaction_ids")
    .eq("user_id", userId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!digest) {
    return "Não tem nada pendente de categorização agora. Assim que eu detectar novos gastos, aviso por aqui.";
  }

  const items = await fetchPendingItems(supabase, userId, digest);
  if (!items.length) {
    return "Já está tudo revisado, nada pendente no momento. 👍";
  }

  const { data: categoryRows } = await supabase
    .from("categories")
    .select("id, name, category_type")
    .eq("user_id", userId);
  const categories = categoryRows ?? [];
  if (!categories.length) {
    return "Você ainda não tem categorias cadastradas no app — crie ao menos uma antes de categorizar por aqui.";
  }

  const mapping = await interpretCategorization(items, categories, text);

  const resolved: string[] = [];
  const unresolved: string[] = [];
  for (const item of items) {
    const categoryId = mapping.get(item.id);
    const category = categoryId ? categories.find((c) => c.id === categoryId) : null;
    if (!category) {
      unresolved.push(item.label);
      continue;
    }
    const table = item.kind === "bank" ? "transactions" : "credit_card_transactions";
    await supabase
      .from(table)
      .update({ category_id: category.id, reviewed_at: new Date().toISOString() })
      .eq("id", item.id);
    resolved.push(`${item.label} → ${category.name}`);
  }

  if (!unresolved.length) {
    await supabase
      .from("telegram_digests")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", digest.id);
  }

  const parts: string[] = [];
  if (resolved.length) parts.push(`Categorizei:\n${resolved.map((r) => `✅ ${r}`).join("\n")}`);
  if (unresolved.length)
    parts.push(
      `Não entendi a categoria destes:\n${unresolved.map((r) => `❓ ${r}`).join("\n")}\nPode descrever de novo?`,
    );
  return parts.join("\n\n");
}

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  // Sem autenticação própria: o Telegram não assina os webhooks por padrão e
  // essa rota só executa ações escopadas ao chat_id que já enviou a mensagem
  // (nunca em nome de outro usuário) — o pior caso de abuso é alguém mandar
  // mensagens soltas pro próprio bot.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("ok", { status: 200 });
  }

  const message = update.message;
  if (!message) return new Response("ok", { status: 200 });
  const chatId = String(message.chat.id);

  try {
    const profile = await findOrLinkProfile(supabaseAdmin, chatId, message.from?.username);
    if (!profile) {
      await sendTelegramMessage(
        chatId,
        "Não encontrei seu perfil do Fluxora. Abra o app, vá em Configurações e cadastre seu usuário do Telegram (@seu_usuario) para vincular.",
      );
      return new Response("ok", { status: 200 });
    }

    if (message.voice) {
      await sendTelegramMessage(chatId, VOICE_NOT_SUPPORTED_YET);
      return new Response("ok", { status: 200 });
    }

    if (message.text && !message.text.startsWith("/")) {
      const reply = await handleCategorizationReply(
        supabaseAdmin,
        profile.id,
        chatId,
        message.text,
      );
      await sendTelegramMessage(chatId, reply);
      return new Response("ok", { status: 200 });
    }

    await sendTelegramMessage(
      chatId,
      `Oi, ${profile.display_name || "tudo bem"}! Todo dia de manhã eu mando os gastos detectados no dia anterior por aqui — é só responder descrevendo as categorias.`,
    );
  } catch (error) {
    console.error("[telegram webhook]", error);
    await sendTelegramMessage(
      chatId,
      "Deu um erro por aqui — já registrei pra dar uma olhada.",
    ).catch(() => undefined);
  }
  return new Response("ok", { status: 200 });
}

// Roda dentro do cron diário (01:00), depois da sincronização bancária: para
// cada usuário com Telegram vinculado, manda os gastos de ontem detectados
// via integração e ainda não revisados.
export async function sendDailyDigests(supabaseAdmin: Db): Promise<{ sent: number }> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, telegram_chat_id")
    .not("telegram_chat_id", "is", null);

  let sent = 0;
  for (const profile of profiles ?? []) {
    const chatId = profile.telegram_chat_id;
    if (!chatId) continue;

    const [{ data: bankRows }, { data: cardRows }] = await Promise.all([
      supabaseAdmin
        .from("transactions")
        .select("id, description, amount, transaction_type, account_id")
        .eq("user_id", profile.id)
        .eq("source", "api")
        .eq("transaction_date", yesterday)
        .is("reviewed_at", null)
        .neq("transaction_type", "transfer"),
      supabaseAdmin
        .from("credit_card_transactions")
        .select("id, description, amount, card_id")
        .eq("user_id", profile.id)
        .eq("source", "api")
        .eq("purchase_date", yesterday)
        .is("reviewed_at", null),
    ]);
    const bank = bankRows ?? [];
    const card = cardRows ?? [];
    if (!bank.length && !card.length) continue;

    const [{ data: accounts }, { data: cards }] = await Promise.all([
      supabaseAdmin.from("accounts").select("id, name").eq("user_id", profile.id),
      supabaseAdmin.from("credit_cards").select("id, name").eq("user_id", profile.id),
    ]);
    const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
    const cardName = new Map((cards ?? []).map((c) => [c.id, c.name]));

    const lines: string[] = [`📋 Gastos de ontem (${yesterday.split("-").reverse().join("/")}):`];
    for (const row of bank) {
      const sign = row.transaction_type === "income" ? "+" : "-";
      lines.push(
        `${sign} ${money(Number(row.amount))} · ${row.description} · ${accountName.get(row.account_id) ?? "conta"}`,
      );
    }
    for (const row of card) {
      lines.push(
        `- ${money(Number(row.amount))} · ${row.description} · ${cardName.get(row.card_id) ?? "cartão"}`,
      );
    }
    lines.push(
      "",
      'Responda descrevendo as categorias (ex.: "o Uber foi transporte, o resto foi mercado").',
    );

    await sendTelegramMessage(chatId, lines.join("\n"));
    await supabaseAdmin.from("telegram_digests").insert({
      user_id: profile.id,
      chat_id: chatId,
      transaction_ids: bank.map((r) => r.id),
      card_transaction_ids: card.map((r) => r.id),
    });
    sent += 1;
  }

  return { sent };
}
