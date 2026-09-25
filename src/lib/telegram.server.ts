import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  budgetSpent,
  currentBudgetPeriod,
  PERIOD_LABELS,
  type PeriodType,
} from "@/lib/budget-period";

type Db = SupabaseClient<Database>;

const TELEGRAM_API_BASE = "https://api.telegram.org";

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

type InlineButton = { text: string; callback_data: string };

function chunkRows<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows;
}

// Prefixo curto do uuid — só precisa ser único dentro da lista de itens,
// categorias ou centros de custo do próprio usuário no momento em que os
// botões aparecem. É o suficiente pra caber no limite de 64 bytes do
// callback_data dos botões do Telegram sem precisar guardar estado extra
// no banco (os ids completos são resolvidos de novo, por prefixo, quando o
// botão é tocado).
function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

async function sendTelegramKeyboard(
  chatId: string,
  text: string,
  buttons: InlineButton[][],
): Promise<void> {
  await telegramFetch("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: buttons },
  });
}

// Precisa ser chamada pra todo callback_query, mesmo quando a ação não deu
// em nada — sem isso o botão fica "carregando" pro usuário indefinidamente.
async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  await telegramFetch("answerCallbackQuery", { callback_query_id: callbackQueryId });
}

export async function setTelegramWebhook(webhookUrl: string): Promise<void> {
  await telegramFetch("setWebhook", { url: webhookUrl });
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

type TelegramUpdate = {
  message?: {
    chat: { id: number | string };
    from?: { username?: string };
    text?: string;
    voice?: unknown;
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { username?: string };
    message?: { chat: { id: number | string } };
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

function stripAt(username: string): string {
  return username.startsWith("@") ? username.slice(1) : username;
}

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

async function findOrLinkRecipient(
  supabase: Db,
  chatId: string,
  fromUsername: string | undefined,
): Promise<Recipient | null> {
  const { data: byChat } = await supabase
    .from("telegram_recipients")
    .select(RECIPIENT_COLUMNS)
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (byChat) return toRecipient(byChat);

  if (!fromUsername) return null;
  const { data: byUsername } = await supabase
    .from("telegram_recipients")
    .select(RECIPIENT_COLUMNS)
    .ilike("telegram_username", stripAt(fromUsername))
    .is("telegram_chat_id", null)
    .maybeSingle();
  if (!byUsername) return null;

  await supabase
    .from("telegram_recipients")
    .update({ telegram_chat_id: chatId })
    .eq("id", byUsername.id);
  return toRecipient(byUsername);
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

  // O token é de uso único: depois do vínculo ele é rotacionado, de modo que
  // um link vazado não permita que terceiros se vinculem à mesma conta.
  await supabase
    .from("telegram_recipients")
    .update({
      telegram_chat_id: chatId,
      link_token: crypto.randomUUID().replace(/-/g, ""),
    })
    .eq("id", data.id);
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

async function fetchLatestPendingItems(
  supabase: Db,
  recipient: Recipient,
): Promise<{ digestId: string; items: PendingItem[] } | null> {
  const { data: digest } = await supabase
    .from("telegram_digests")
    .select("id, transaction_ids, card_transaction_ids")
    .eq("recipient_id", recipient.id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!digest) return null;
  const items = await fetchPendingItems(supabase, recipient.user_id, digest);
  return { digestId: digest.id, items };
}

async function applyCategorization(
  supabase: Db,
  item: PendingItem,
  categoryId: string,
  costCenterId: string | null,
): Promise<void> {
  const table = item.kind === "bank" ? "transactions" : "credit_card_transactions";
  await supabase
    .from(table)
    .update({
      category_id: categoryId,
      cost_center_id: costCenterId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", item.id);
}

// Reconsulta o que ainda está pendente nesse dígest (reviewed_at IS NULL) e,
// se não sobrou nada, marca como resolvido — chamado depois de cada
// categorização manual (por botão).
async function markDigestResolvedIfDone(
  supabase: Db,
  recipient: Recipient,
  digestId: string,
): Promise<void> {
  const { data: digest } = await supabase
    .from("telegram_digests")
    .select("id, transaction_ids, card_transaction_ids")
    .eq("id", digestId)
    .maybeSingle();
  if (!digest) return;
  const stillPending = await fetchPendingItems(supabase, recipient.user_id, digest);
  if (!stillPending.length) {
    await supabase
      .from("telegram_digests")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", digest.id);
  }
}

async function sendItemCategoryButtons(
  chatId: string,
  item: PendingItem,
  categories: CategoryOption[],
): Promise<void> {
  const relevant = categories.filter((c) => c.category_type === item.transaction_type);
  if (!relevant.length) {
    await sendTelegramMessage(
      chatId,
      `${item.label}: nenhuma categoria de ${item.transaction_type === "income" ? "receita" : "despesa"} cadastrada no app.`,
    );
    return;
  }
  const kindChar = item.kind === "bank" ? "b" : "c";
  const buttons = chunkRows(
    relevant.map((c) => ({
      text: c.name,
      callback_data: `cat:${kindChar}:${shortId(item.id)}:${shortId(c.id)}`,
    })),
    2,
  );
  await sendTelegramKeyboard(chatId, `${item.label}\nEscolha a categoria:`, buttons);
}

// Botão "Categorizar manualmente": manda uma mensagem por lançamento
// pendente com os botões de categoria, um de cada vez.
async function sendManualCategorization(
  supabase: Db,
  recipient: Recipient,
  chatId: string,
): Promise<void> {
  const pending = await fetchLatestPendingItems(supabase, recipient);
  if (!pending || !pending.items.length) {
    await sendTelegramMessage(chatId, "Não tem nada pendente de categorização agora. 👍");
    return;
  }
  const { data: categoryRows } = await supabase
    .from("categories")
    .select("id, name, category_type")
    .eq("user_id", recipient.user_id);
  const categories = categoryRows ?? [];
  if (!categories.length) {
    await sendTelegramMessage(
      chatId,
      "Você ainda não tem categorias cadastradas no app — crie ao menos uma antes de categorizar por aqui.",
    );
    return;
  }
  await sendTelegramMessage(
    chatId,
    `Vamos categorizar ${pending.items.length} lançamento${pending.items.length === 1 ? "" : "s"} um por um:`,
  );
  for (const item of pending.items) {
    await sendItemCategoryButtons(chatId, item, categories);
  }
}

// Depois de tocar numa categoria: se o usuário tem centros de custo
// cadastrados, pergunta qual deles antes de gravar; senão, categoriza
// direto (não dá pra exigir escolher de uma lista vazia).
async function handleCategoryChoice(
  supabase: Db,
  recipient: Recipient,
  chatId: string,
  kindChar: string,
  itemShort: string,
  catShort: string,
): Promise<void> {
  const pending = await fetchLatestPendingItems(supabase, recipient);
  const item = pending?.items.find((i) => i.kind[0] === kindChar && shortId(i.id) === itemShort);
  if (!pending || !item) {
    await sendTelegramMessage(
      chatId,
      "Esse lançamento não está mais pendente (talvez já tenha sido categorizado).",
    );
    return;
  }
  const { data: categoryRows } = await supabase
    .from("categories")
    .select("id, name, category_type")
    .eq("user_id", recipient.user_id);
  const category = (categoryRows ?? []).find((c) => shortId(c.id) === catShort);
  if (!category) {
    await sendTelegramMessage(chatId, "Não encontrei essa categoria — tenta de novo.");
    return;
  }
  const { data: costCenterRows } = await supabase
    .from("cost_centers")
    .select("id, name")
    .eq("user_id", recipient.user_id);
  const costCenters = costCenterRows ?? [];
  if (!costCenters.length) {
    await applyCategorization(supabase, item, category.id, null);
    await markDigestResolvedIfDone(supabase, recipient, pending.digestId);
    await sendTelegramMessage(chatId, `✅ ${item.label} → ${category.name}`);
    return;
  }
  const buttons = chunkRows(
    costCenters.map((cc) => ({
      text: cc.name,
      callback_data: `cc:${kindChar}:${itemShort}:${catShort}:${shortId(cc.id)}`,
    })),
    2,
  );
  await sendTelegramKeyboard(
    chatId,
    `${item.label}\nCategoria: ${category.name} ✅\nAgora o centro de custo:`,
    buttons,
  );
}

async function handleCostCenterChoice(
  supabase: Db,
  recipient: Recipient,
  chatId: string,
  kindChar: string,
  itemShort: string,
  catShort: string,
  ccShort: string,
): Promise<void> {
  const pending = await fetchLatestPendingItems(supabase, recipient);
  const item = pending?.items.find((i) => i.kind[0] === kindChar && shortId(i.id) === itemShort);
  if (!pending || !item) {
    await sendTelegramMessage(
      chatId,
      "Esse lançamento não está mais pendente (talvez já tenha sido categorizado).",
    );
    return;
  }
  const [{ data: categoryRows }, { data: costCenterRows }] = await Promise.all([
    supabase.from("categories").select("id, name, category_type").eq("user_id", recipient.user_id),
    supabase.from("cost_centers").select("id, name").eq("user_id", recipient.user_id),
  ]);
  const category = (categoryRows ?? []).find((c) => shortId(c.id) === catShort);
  const costCenter = (costCenterRows ?? []).find((cc) => shortId(cc.id) === ccShort);
  if (!category || !costCenter) {
    await sendTelegramMessage(
      chatId,
      "Não encontrei a categoria ou o centro de custo — tenta de novo.",
    );
    return;
  }
  await applyCategorization(supabase, item, category.id, costCenter.id);
  await markDigestResolvedIfDone(supabase, recipient, pending.digestId);
  await sendTelegramMessage(chatId, `✅ ${item.label} → ${category.name} / ${costCenter.name}`);
}

function money(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

async function handleCallbackQuery(
  supabase: Db,
  callbackQuery: NonNullable<TelegramUpdate["callback_query"]>,
): Promise<void> {
  try {
    await answerCallbackQuery(callbackQuery.id);
  } catch (ackError) {
    console.error("[telegram callback ack]", ackError);
  }
  const chatId = callbackQuery.message ? String(callbackQuery.message.chat.id) : null;
  const data = callbackQuery.data ?? "";
  if (!chatId || !data) return;

  try {
    const recipient = await findOrLinkRecipient(supabase, chatId, callbackQuery.from?.username);
    if (!recipient) return;

    if (data === "manual") {
      await sendManualCategorization(supabase, recipient, chatId);
      return;
    }
    const parts = data.split(":");
    if (parts[0] === "cat" && parts.length === 4) {
      await handleCategoryChoice(
        supabase,
        recipient,
        chatId,
        parts[1] ?? "",
        parts[2] ?? "",
        parts[3] ?? "",
      );
      return;
    }
    if (parts[0] === "cc" && parts.length === 5) {
      await handleCostCenterChoice(
        supabase,
        recipient,
        chatId,
        parts[1] ?? "",
        parts[2] ?? "",
        parts[3] ?? "",
        parts[4] ?? "",
      );
      return;
    }
  } catch (error) {
    console.error("[telegram callback]", error);
    const detail = error instanceof Error ? error.message : String(error);
    await sendTelegramMessage(chatId, `Deu um erro por aqui: ${detail}`).catch(() => undefined);
  }
}

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  // Sem autenticação própria: o Telegram não assina os webhooks por padrão e
  // essa rota só executa ações escopadas ao chat_id que já enviou a mensagem
  // (nunca em nome de outro destinatário) — o pior caso de abuso é alguém
  // mandar mensagens soltas pro próprio bot.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("ok", { status: 200 });
  }

  if (update.callback_query) {
    await handleCallbackQuery(supabaseAdmin, update.callback_query);
    return new Response("ok", { status: 200 });
  }

  const message = update.message;
  if (!message) return new Response("ok", { status: 200 });
  const chatId = String(message.chat.id);

  try {
    const startToken = /^\/start(?:\s+(\S+))?/.exec(message.text ?? "")?.[1];
    const recipient =
      (startToken ? await linkByToken(supabaseAdmin, chatId, startToken) : null) ??
      (await findOrLinkRecipient(supabaseAdmin, chatId, message.from?.username));
    if (!recipient) {
      await sendTelegramMessage(
        chatId,
        "Não encontrei nenhum perfil do Fluxora vinculado a esse link ou usuário do Telegram. Peça pra quem administra o app te mandar o link de convite de novo.",
      );
      return new Response("ok", { status: 200 });
    }

    // Categorização é só por botão agora — qualquer tentativa de interação
    // (áudio ou texto solto) manda direto a lista de botões, em vez de tentar
    // interpretar o conteúdo.
    if (message.voice || (message.text && !message.text.startsWith("/"))) {
      await sendManualCategorization(supabaseAdmin, recipient, chatId);
      return new Response("ok", { status: 200 });
    }

    await sendTelegramMessage(
      chatId,
      `Oi, ${recipient.label || "tudo bem"}! Conforme a frequência configurada, eu mando por aqui os gastos detectados automaticamente, com um botão pra você categorizar cada um.`,
    );
  } catch (error) {
    console.error("[telegram webhook]", error);
    const detail = error instanceof Error ? error.message : String(error);
    await sendTelegramMessage(chatId, `Deu um erro por aqui: ${detail}`).catch(() => undefined);
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

  // Contas/cartões inativos não entram no digest — deixaram de ser
  // sincronizados automaticamente, então não faz sentido pedir revisão deles.
  const [{ data: activeAccountRows }, { data: activeCardRows }] = await Promise.all([
    supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", recipient.user_id)
      .eq("is_active", true),
    supabaseAdmin
      .from("credit_cards")
      .select("id")
      .eq("user_id", recipient.user_id)
      .eq("is_active", true),
  ]);
  const activeAccountIds = new Set((activeAccountRows ?? []).map((a) => a.id));
  const activeCardIds = new Set((activeCardRows ?? []).map((c) => c.id));

  const scopedAccountIds = recipient.all_accounts
    ? Array.from(activeAccountIds)
    : recipient.account_ids.filter((id) => activeAccountIds.has(id));
  const scopedCardIds = recipient.all_accounts
    ? Array.from(activeCardIds)
    : recipient.card_ids.filter((id) => activeCardIds.has(id));
  bankQuery = scopedAccountIds.length
    ? bankQuery.in("account_id", scopedAccountIds)
    : bankQuery.eq("account_id", "00000000-0000-0000-0000-000000000000");
  cardQuery = scopedCardIds.length
    ? cardQuery.in("card_id", scopedCardIds)
    : cardQuery.eq("card_id", "00000000-0000-0000-0000-000000000000");

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
  lines.push("", "Toque no botão abaixo pra categorizar cada um.");

  await sendTelegramKeyboard(recipient.telegram_chat_id, lines.join("\n"), [
    [{ text: "☑️ Categorizar manualmente", callback_data: "manual" }],
  ]);
  await supabaseAdmin.from("telegram_digests").insert({
    user_id: recipient.user_id,
    recipient_id: recipient.id,
    chat_id: recipient.telegram_chat_id,
    transaction_ids: bank.map((r) => r.id),
    card_transaction_ids: card.map((r) => r.id),
  });
  return true;
}

// Roda dentro do cron diário (18:00), depois da sincronização bancária: para
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

async function budgetScopeLabel(
  supabaseAdmin: Db,
  budget: {
    category_id: string | null;
    cost_center_id: string | null;
    account_id: string | null;
    card_id: string | null;
  },
): Promise<string> {
  if (budget.category_id) {
    const { data } = await supabaseAdmin
      .from("categories")
      .select("name")
      .eq("id", budget.category_id)
      .maybeSingle();
    return data?.name ?? "categoria";
  }
  if (budget.cost_center_id) {
    const { data } = await supabaseAdmin
      .from("cost_centers")
      .select("name")
      .eq("id", budget.cost_center_id)
      .maybeSingle();
    return data?.name ?? "centro de custo";
  }
  if (budget.account_id) {
    const { data } = await supabaseAdmin
      .from("accounts")
      .select("name")
      .eq("id", budget.account_id)
      .maybeSingle();
    return data?.name ?? "conta";
  }
  if (budget.card_id) {
    const { data } = await supabaseAdmin
      .from("credit_cards")
      .select("name")
      .eq("id", budget.card_id)
      .maybeSingle();
    return data?.name ?? "cartão";
  }
  return "";
}

async function alreadySentAlert(
  supabaseAdmin: Db,
  budgetId: string,
  alertType: "threshold" | "exceeded",
  periodStart: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("budget_alerts_sent")
    .select("id")
    .eq("budget_id", budgetId)
    .eq("alert_type", alertType)
    .eq("period_start", periodStart)
    .maybeSingle();
  return !!data;
}

// Roda dentro do cron diário (18:00), depois da sincronização bancária: para
// cada orçamento ativo, calcula a janela do período atual (fixo ou
// recorrente) e o quanto já foi gasto nela, e manda pros destinatários
// configurados o que estiver habilitado — report diário (sempre que rodar),
// alerta de limiar e de estouro (uma vez só por período, via
// budget_alerts_sent).
export async function checkBudgetsAndAlert(supabaseAdmin: Db): Promise<{ sent: number }> {
  const now = new Date();
  const { data: budgetRows } = await supabaseAdmin
    .from("budgets")
    .select("*")
    .eq("is_active", true);

  let sent = 0;
  for (const budget of budgetRows ?? []) {
    if (
      !budget.alert_daily_report &&
      !budget.alert_threshold_enabled &&
      !budget.alert_exceeded_enabled
    ) {
      continue;
    }
    const period = currentBudgetPeriod(
      budget.period_type as PeriodType,
      budget.start_date,
      budget.end_date,
      now,
    );
    if (budget.period_type === "fixed" && toIsoDate(now) > period.end) continue;

    const { data: budgetRecipientRows } = await supabaseAdmin
      .from("budget_recipients")
      .select("recipient_id")
      .eq("budget_id", budget.id);
    const recipientIds = (budgetRecipientRows ?? []).map((r) => r.recipient_id);
    if (!recipientIds.length) continue;
    const { data: recipientRows } = await supabaseAdmin
      .from("telegram_recipients")
      .select("telegram_chat_id")
      .in("id", recipientIds)
      .not("telegram_chat_id", "is", null);
    const chatIds = (recipientRows ?? [])
      .map((r) => r.telegram_chat_id)
      .filter((id): id is string => !!id);
    if (!chatIds.length) continue;

    const spent = await budgetSpent(
      supabaseAdmin,
      budget.user_id,
      budget,
      period.start,
      period.end,
    );
    const amount = Number(budget.amount);
    const pct = amount > 0 ? (spent / amount) * 100 : 0;
    const exceeded = spent > amount;
    const thresholdHit =
      budget.alert_threshold_enabled &&
      budget.alert_threshold_percent !== null &&
      pct >= Number(budget.alert_threshold_percent) &&
      !exceeded;

    const scopeLabel = await budgetScopeLabel(supabaseAdmin, budget);
    const header = `${budget.name} (${scopeLabel} · ${PERIOD_LABELS[budget.period_type as PeriodType]})`;
    const progressLine = `${money(spent)} de ${money(amount)} (${pct.toFixed(0)}%)`;

    if (budget.alert_daily_report) {
      const text = [`📊 ${header}`, progressLine].join("\n");
      for (const chatId of chatIds) await sendTelegramMessage(chatId, text);
      sent += chatIds.length;
    }

    if (
      thresholdHit &&
      !(await alreadySentAlert(supabaseAdmin, budget.id, "threshold", period.start))
    ) {
      const text = [
        `⚠️ ${header}`,
        `Atingiu ${Number(budget.alert_threshold_percent)}% do orçamento.`,
        progressLine,
      ].join("\n");
      for (const chatId of chatIds) await sendTelegramMessage(chatId, text);
      await supabaseAdmin.from("budget_alerts_sent").insert({
        user_id: budget.user_id,
        budget_id: budget.id,
        alert_type: "threshold",
        period_start: period.start,
        period_end: period.end,
      });
      sent += chatIds.length;
    }

    if (
      budget.alert_exceeded_enabled &&
      exceeded &&
      !(await alreadySentAlert(supabaseAdmin, budget.id, "exceeded", period.start))
    ) {
      const text = [`🚨 ${header}`, "Orçamento estourado!", progressLine].join("\n");
      for (const chatId of chatIds) await sendTelegramMessage(chatId, text);
      await supabaseAdmin.from("budget_alerts_sent").insert({
        user_id: budget.user_id,
        budget_id: budget.id,
        alert_type: "exceeded",
        period_start: period.start,
        period_end: period.end,
      });
      sent += chatIds.length;
    }
  }

  return { sent };
}
