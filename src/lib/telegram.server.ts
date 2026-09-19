import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

const TELEGRAM_API_BASE = "https://api.telegram.org";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Groq expõe o Whisper com uma API compatível com a da OpenAI — bem mais
// barato/rápido que a OpenAI direto, mesmo formato de chamada.
const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

function getTelegramToken(): string {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    throw new Error(
      "Bot do Telegram não configurado: defina TELEGRAM_BOT_TOKEN nas variáveis de ambiente do Lovable Cloud.",
    );
  }
  return token;
}

// O Telegram não assina os webhooks por padrão, mas deixa registrar um
// secret_token (enviado de volta no header X-Telegram-Bot-Api-Secret-Token
// em toda chamada) — sem isso, /api/public/telegram/webhook aceita
// qualquer POST de qualquer origem, bastando adivinhar/saber um chat_id já
// vinculado pra ler ou "categorizar" lançamentos de outra pessoa. Derivado
// do próprio TELEGRAM_BOT_TOKEN (hash, não o token em si) pra não precisar
// de mais uma variável de ambiente — só quem tem o token do bot consegue
// calcular o mesmo secret_token.
async function getWebhookSecretToken(): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`telegram-webhook:${getTelegramToken()}`).digest("hex");
}

export async function isValidWebhookSecret(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!provided) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(await getWebhookSecretToken()));
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
  await telegramFetch("setWebhook", {
    url: webhookUrl,
    secret_token: await getWebhookSecretToken(),
  });
}

let cachedBotUsername: string | null = null;

// Usado pra montar o link de convite (t.me/<bot>?start=<token>) — a única
// forma de um destinatário "receber a primeira mensagem": o Telegram não
// deixa bot nenhum iniciar conversa (regra anti-spam da plataforma), então
// quem convida manda esse link por fora (WhatsApp, SMS etc.) e a pessoa só
// toca nele.
export async function getBotUsername(): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;
  const me = await telegramFetch<{ username: string }>("getMe", {});
  cachedBotUsername = me.username;
  return cachedBotUsername;
}

async function getTelegramFileUrl(fileId: string): Promise<string> {
  const token = getTelegramToken();
  const file = await telegramFetch<{ file_path: string }>("getFile", { file_id: fileId });
  return `${TELEGRAM_API_BASE}/file/bot${token}/${file.file_path}`;
}

// Transcreve o áudio (mensagem de voz do Telegram, formato OGG/Opus) via
// Whisper na Groq. A Anthropic não recebe áudio na API de mensagens, por
// isso esse passo extra antes de cair na mesma interpretação por texto.
async function transcribeVoice(fileUrl: string): Promise<string> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "Transcrição de voz não configurada: defina GROQ_API_KEY nas variáveis de ambiente do Lovable Cloud.",
    );
  }
  const audioResponse = await fetch(fileUrl);
  if (!audioResponse.ok) {
    throw new Error(`Falha ao baixar áudio do Telegram (${audioResponse.status}).`);
  }
  const audioBlob = await audioResponse.blob();

  const form = new FormData();
  form.append("file", audioBlob, "voice.ogg");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "text");

  const response = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq respondeu ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.text()).trim();
}

type TelegramUpdate = {
  message?: {
    chat: { id: number | string };
    text?: string;
    voice?: { file_id: string };
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

type Recipient = {
  id: string;
  user_id: string;
  label: string;
  all_accounts: boolean;
  account_ids: string[];
  card_ids: string[];
};

function asStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toRecipient(row: {
  id: string;
  user_id: string;
  label: string;
  all_accounts: boolean;
  account_ids: Json;
  card_ids: Json;
}): Recipient {
  return {
    id: row.id,
    user_id: row.user_id,
    label: row.label,
    all_accounts: row.all_accounts,
    account_ids: asStringArray(row.account_ids),
    card_ids: asStringArray(row.card_ids),
  };
}

const RECIPIENT_COLUMNS = "id, user_id, label, all_accounts, account_ids, card_ids";

// Telegram @usernames são autoatribuíveis e podem ser registrados por
// qualquer pessoa — vincular automaticamente por username permitiria a
// alguém "roubar" o vínculo de um destinatário legítimo só registrando o
// mesmo @usuario antes dele conversar com o bot. Por isso o único jeito de
// vincular um chat_id novo é o link de convite (linkByToken, token opaco de
// 128 bits); aqui só reconhecemos quem já está vinculado.
async function findRecipientByChat(supabase: Db, chatId: string): Promise<Recipient | null> {
  const { data: byChat } = await supabase
    .from("telegram_recipients")
    .select(RECIPIENT_COLUMNS)
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return byChat ? toRecipient(byChat) : null;
}

// Vínculo pelo link de convite (/start <token>) — não depende de @usuario
// nem de a pessoa mandar mensagem por conta própria.
async function linkByToken(supabase: Db, chatId: string, token: string): Promise<Recipient | null> {
  const { data } = await supabase
    .from("telegram_recipients")
    .select(RECIPIENT_COLUMNS)
    .eq("link_token", token)
    .maybeSingle();
  if (!data) return null;

  await supabase.from("telegram_recipients").update({ telegram_chat_id: chatId }).eq("id", data.id);
  return toRecipient(data);
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
  recipient: Recipient,
  text: string,
): Promise<string> {
  const { data: digest } = await supabase
    .from("telegram_digests")
    .select("id, transaction_ids, card_transaction_ids")
    .eq("recipient_id", recipient.id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!digest) {
    return "Não tem nada pendente de categorização agora. Assim que eu detectar novos gastos, aviso por aqui.";
  }

  const items = await fetchPendingItems(supabase, recipient.user_id, digest);
  if (!items.length) {
    return "Já está tudo revisado, nada pendente no momento. 👍";
  }

  const { data: categoryRows } = await supabase
    .from("categories")
    .select("id, name, category_type")
    .eq("user_id", recipient.user_id);
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
  // Valida o secret_token que o Telegram devolve em todo POST de webhook
  // (registrado em setTelegramWebhook). Sem essa checagem, qualquer um que
  // descubra essa URL pública poderia forjar um update com um chat_id já
  // vinculado a alguém e disparar handleCategorizationReply em nome dessa
  // pessoa (lê/recategoriza os lançamentos pendentes dela).
  if (!(await isValidWebhookSecret(request))) {
    return new Response("Unauthorized", { status: 401 });
  }

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
    const startToken = /^\/start(?:\s+(\S+))?/.exec(message.text ?? "")?.[1];
    const recipient =
      (startToken ? await linkByToken(supabaseAdmin, chatId, startToken) : null) ??
      (await findRecipientByChat(supabaseAdmin, chatId));
    if (!recipient) {
      await sendTelegramMessage(
        chatId,
        "Não encontrei nenhum perfil do Fluxora vinculado a esse link ou usuário do Telegram. Peça pra quem administra o app te mandar o link de convite de novo.",
      );
      return new Response("ok", { status: 200 });
    }

    if (message.voice) {
      try {
        const fileUrl = await getTelegramFileUrl(message.voice.file_id);
        const transcript = await transcribeVoice(fileUrl);
        if (!transcript) {
          await sendTelegramMessage(
            chatId,
            "Não consegui entender esse áudio — pode tentar de novo, falando um pouco mais devagar?",
          );
          return new Response("ok", { status: 200 });
        }
        const reply = await handleCategorizationReply(supabaseAdmin, recipient, transcript);
        await sendTelegramMessage(chatId, `🎙️ Entendi: "${transcript}"\n\n${reply}`);
      } catch (voiceError) {
        console.error("[telegram voice]", voiceError);
        await sendTelegramMessage(
          chatId,
          "Não consegui processar esse áudio agora — pode tentar de novo ou escrever a categorização em texto?",
        );
      }
      return new Response("ok", { status: 200 });
    }

    if (message.text && !message.text.startsWith("/")) {
      const reply = await handleCategorizationReply(supabaseAdmin, recipient, message.text);
      await sendTelegramMessage(chatId, reply);
      return new Response("ok", { status: 200 });
    }

    await sendTelegramMessage(
      chatId,
      `Oi, ${recipient.label || "tudo bem"}! Conforme a frequência configurada, eu mando por aqui os gastos detectados automaticamente — é só responder descrevendo as categorias.`,
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

type Frequency = "daily" | "weekly" | "monthly";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function br(dateIso: string): string {
  return dateIso.split("-").reverse().join("/");
}

// Cada frequência cobre um período diferente; rodam de forma independente
// (o que já foi categorizado numa não reaparece na próxima, por causa do
// filtro reviewed_at IS NULL).
function dateRangeFor(freq: Frequency, now: Date): { from: string; to: string; title: string } {
  if (freq === "daily") {
    const d = toIsoDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    return { from: d, to: d, title: `📋 Gastos de ontem (${br(d)})` };
  }
  if (freq === "weekly") {
    const to = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
    const fromIso = toIsoDate(from);
    const toIso = toIsoDate(to);
    return {
      from: fromIso,
      to: toIso,
      title: `📅 Resumo da semana (${br(fromIso)} a ${br(toIso)})`,
    };
  }
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  const firstOfPrevMonth = new Date(
    Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1),
  );
  const fromIso = toIsoDate(firstOfPrevMonth);
  const toIso = toIsoDate(lastOfPrevMonth);
  return { from: fromIso, to: toIso, title: `🗓️ Resumo do mês (${br(fromIso)} a ${br(toIso)})` };
}

// Semanal só dispara às segundas (cobre a semana anterior inteira); mensal
// só no dia 1 (cobre o mês anterior inteiro). Diário roda sempre.
function isScheduledToday(freq: Frequency, now: Date): boolean {
  if (freq === "daily") return true;
  if (freq === "weekly") return now.getUTCDay() === 1;
  return now.getUTCDate() === 1;
}

async function sendDigestForRecipient(
  supabaseAdmin: Db,
  recipient: Recipient & { telegram_chat_id: string },
  freq: Frequency,
  now: Date,
): Promise<boolean> {
  const { from, to, title } = dateRangeFor(freq, now);

  let bankQuery = supabaseAdmin
    .from("transactions")
    .select("id, description, amount, transaction_type, account_id")
    .eq("user_id", recipient.user_id)
    .eq("source", "api")
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .is("reviewed_at", null)
    .neq("transaction_type", "transfer");
  let cardQuery = supabaseAdmin
    .from("credit_card_transactions")
    .select("id, description, amount, card_id")
    .eq("user_id", recipient.user_id)
    .eq("source", "api")
    .gte("purchase_date", from)
    .lte("purchase_date", to)
    .is("reviewed_at", null);

  if (!recipient.all_accounts) {
    bankQuery = recipient.account_ids.length
      ? bankQuery.in("account_id", recipient.account_ids)
      : bankQuery.eq("account_id", "00000000-0000-0000-0000-000000000000");
    cardQuery = recipient.card_ids.length
      ? cardQuery.in("card_id", recipient.card_ids)
      : cardQuery.eq("card_id", "00000000-0000-0000-0000-000000000000");
  }

  const [{ data: bankRows }, { data: cardRows }] = await Promise.all([bankQuery, cardQuery]);
  const bank = bankRows ?? [];
  const card = cardRows ?? [];
  if (!bank.length && !card.length) return false;

  const [{ data: accounts }, { data: cards }] = await Promise.all([
    supabaseAdmin.from("accounts").select("id, name").eq("user_id", recipient.user_id),
    supabaseAdmin.from("credit_cards").select("id, name").eq("user_id", recipient.user_id),
  ]);
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const cardName = new Map((cards ?? []).map((c) => [c.id, c.name]));

  const lines: string[] = [title];
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

  await sendTelegramMessage(recipient.telegram_chat_id, lines.join("\n"));
  await supabaseAdmin.from("telegram_digests").insert({
    user_id: recipient.user_id,
    recipient_id: recipient.id,
    chat_id: recipient.telegram_chat_id,
    transaction_ids: bank.map((r) => r.id),
    card_transaction_ids: card.map((r) => r.id),
  });
  return true;
}

// Roda dentro do cron diário (01:00), depois da sincronização bancária: para
// cada destinatário do Telegram vinculado, manda (conforme a frequência que
// ele escolheu e o escopo de contas/cartões dele) os gastos detectados via
// integração e ainda não revisados.
export async function sendDailyDigests(supabaseAdmin: Db): Promise<{ sent: number }> {
  const now = new Date();
  const { data: recipientRows } = await supabaseAdmin
    .from("telegram_recipients")
    .select(
      "id, user_id, label, all_accounts, account_ids, card_ids, telegram_chat_id, notify_daily, notify_weekly, notify_monthly",
    )
    .not("telegram_chat_id", "is", null);

  let sent = 0;
  for (const row of recipientRows ?? []) {
    if (!row.telegram_chat_id) continue;
    const recipient = { ...toRecipient(row), telegram_chat_id: row.telegram_chat_id };
    const frequencies: [Frequency, boolean][] = [
      ["daily", row.notify_daily],
      ["weekly", row.notify_weekly],
      ["monthly", row.notify_monthly],
    ];
    for (const [freq, enabled] of frequencies) {
      if (!enabled || !isScheduledToday(freq, now)) continue;
      const didSend = await sendDigestForRecipient(supabaseAdmin, recipient, freq, now);
      if (didSend) sent += 1;
    }
  }

  return { sent };
}
