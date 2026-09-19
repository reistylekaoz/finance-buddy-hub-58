import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

const PLUGGY_BASE_URL = "https://api.pluggy.ai";

export type PluggyCredentials = { clientId: string; clientSecret: string };

// Cada usuário tem seu próprio app na Pluggy (clientId/clientSecret
// próprios, cadastrados em Configurações) — sem isso não dá pra autenticar
// nem consultar nada da API dele.
//
// As credenciais ficam na tabela isolada public.pluggy_credentials, sem
// nenhuma policy de leitura: nem o próprio usuário consegue lê-las pelo
// navegador. Só o backend, com service role, tem acesso.
export async function getUserPluggyCredentials(userId: string): Promise<PluggyCredentials> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("pluggy_credentials")
    .select("client_id, client_secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao buscar suas credenciais Pluggy: ${error.message}`);
  }
  if (!data?.client_id || !data?.client_secret) {
    throw new Error(
      "Configure o Client ID e o Client Secret da sua aplicação Pluggy em Configurações antes de conectar um banco.",
    );
  }
  return { clientId: data.client_id, clientSecret: data.client_secret };
}

type PluggyAccount = {
  id: string;
  type: "BANK" | "CREDIT";
  name: string;
  marketingName?: string | null;
  number?: string | null;
  owner?: string | null;
  balance: number;
  currencyCode?: string;
  creditData?: {
    creditLimit?: number;
    balanceCloseDate?: string;
    balanceDueDate?: string;
  };
  bankData?: {
    transferNumber?: string | null;
  } | null;
};

// A Pluggy costuma devolver o identificador de transferência como
// "agência/conta" (ex.: "0001/000123456-7"); sem "/", tratamos como só o
// número da conta (agência fica em branco em vez de um valor errado).
function splitTransferNumber(
  transferNumber: string | null | undefined,
  fallbackAccountNumber: string | null | undefined,
): { branchNumber: string | null; accountNumber: string | null } {
  const raw = transferNumber?.trim();
  if (raw?.includes("/")) {
    const [branch, account] = raw.split("/", 2);
    return { branchNumber: branch?.trim() || null, accountNumber: account?.trim() || null };
  }
  return { branchNumber: null, accountNumber: raw || fallbackAccountNumber?.trim() || null };
}

type PluggyTransaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  type?: "DEBIT" | "CREDIT";
  creditCardMetadata?: {
    billId?: string | null;
    billForecastDate?: string | null;
  };
};

type PluggyCreditCardBill = {
  id: string;
  // Faturas já fechadas trazem essa data; a fatura aberta (atual) não
  // aparece nesse endpoint até fechar.
  billClosingDate?: string | null;
};

type PluggyItem = {
  id: string;
  status: string;
  executionStatus?: string;
  connector?: { name: string };
};

// COE | EQUITY | ETF | FIXED_INCOME | MUTUAL_FUND | SECURITY | OTHER
type PluggyInvestment = {
  id: string;
  name: string;
  type: string;
  subtype?: string | null;
  balance: number;
  currencyCode?: string;
  amountOriginal?: number | null;
  amountProfit?: number | null;
};

// BUY (aplicação) | SELL (resgate) | TAX | TRANSFER | INTEREST | AMORTIZATION
type PluggyInvestmentTransaction = {
  id?: string;
  type: "BUY" | "SELL" | "TAX" | "TRANSFER" | "INTEREST" | "AMORTIZATION";
  description?: string | null;
  amount: number;
  quantity?: number | null;
  date: string;
  tradeDate?: string | null;
};

// Uma apiKey por clientId (cada usuário tem a sua) — não dá pra usar uma
// única global como antes, já que cada usuário autentica com credenciais
// próprias.
const apiKeyCache = new Map<string, { key: string; expiresAt: number }>();

async function getApiKey(credentials: PluggyCredentials): Promise<string> {
  const cached = apiKeyCache.get(credentials.clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.key;
  const response = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) {
    throw new Error(
      `Falha ao autenticar com a Pluggy (${response.status}) — confira o Client ID e o Client Secret cadastrados em Configurações.`,
    );
  }
  const data = (await response.json()) as { apiKey: string };
  // O apiKey vale 2h; renovamos um pouco antes por margem de segurança.
  apiKeyCache.set(credentials.clientId, {
    key: data.apiKey,
    expiresAt: Date.now() + 100 * 60 * 1000,
  });
  return data.apiKey;
}

async function pluggyFetch<T>(
  credentials: PluggyCredentials,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const apiKey = await getApiKey(credentials);
  const response = await fetch(`${PLUGGY_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pluggy respondeu ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

function clampDay(day: number): number {
  return Math.min(28, Math.max(1, Math.trunc(day)));
}

// Evita problemas de fuso ao extrair só o dia de uma data "YYYY-MM-DD".
function dayOfMonth(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const day = Number(dateStr.slice(8, 10));
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

// GET /transactions (paginação por página) foi descontinuado pela Pluggy
// (responde 410 ENDPOINT_DEPRECATED). Usamos GET /v2/transactions, com
// paginação por cursor, seguindo a mesma lógica do SDK oficial
// (fetchAllTransactions em pluggy-sdk/dist/client.js): cada página traz
// `next` com a URL da próxima e o cursor real é o parâmetro `after` dela.
async function fetchAllTransactions(
  credentials: PluggyCredentials,
  accountId: string,
): Promise<PluggyTransaction[]> {
  const items: PluggyTransaction[] = [];
  let after: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ accountId, ...(after ? { after } : {}) });
    const data = await pluggyFetch<{ results: PluggyTransaction[]; next: string | null }>(
      credentials,
      `/v2/transactions?${params.toString()}`,
    );
    items.push(...data.results);
    if (!data.next) break;
    const nextAfter = new URL(data.next, PLUGGY_BASE_URL).searchParams.get("after");
    if (!nextAfter) break;
    after = nextAfter;
  }
  return items;
}

// Faturas de cartão já fechadas não devem ser reimportadas (o histórico
// pode ter anos e nunca é marcado como pago pelo sync) — só a fatura aberta
// e as futuras interessam. `GET /bills` só lista faturas fechadas; qualquer
// billId fora desse conjunto é a fatura atual (aberta) ou ainda não existe
// (lançamento futuro/previsto).
async function fetchClosedBillIds(
  credentials: PluggyCredentials,
  accountId: string,
): Promise<Set<string>> {
  const closed = new Set<string>();
  try {
    let page = 1;
    for (;;) {
      const params = new URLSearchParams({ accountId, page: String(page), pageSize: "500" });
      const data = await pluggyFetch<{ results: PluggyCreditCardBill[]; totalPages: number }>(
        credentials,
        `/bills?${params.toString()}`,
      );
      for (const bill of data.results) {
        if (bill.billClosingDate) closed.add(bill.id);
      }
      if (page >= data.totalPages) break;
      page += 1;
    }
  } catch {
    // Se a Pluggy não expuser faturas para esse conector, seguimos sem
    // filtrar por fatura fechada (comportamento anterior: importa tudo).
  }
  return closed;
}

// Nem todo conector expõe investimentos (a maioria é só conta corrente) —
// segue sem investimentos em vez de falhar a sincronização inteira.
async function fetchAllInvestments(
  credentials: PluggyCredentials,
  itemId: string,
): Promise<PluggyInvestment[]> {
  const items: PluggyInvestment[] = [];
  try {
    let page = 1;
    for (;;) {
      const params = new URLSearchParams({ itemId, page: String(page), pageSize: "500" });
      const data = await pluggyFetch<{ results: PluggyInvestment[]; totalPages: number }>(
        credentials,
        `/investments?${params.toString()}`,
      );
      items.push(...data.results);
      if (page >= data.totalPages) break;
      page += 1;
    }
  } catch {
    // Conector sem suporte a investimentos, ou item ainda sem esse escopo.
  }
  return items;
}

async function fetchInvestmentTransactions(
  credentials: PluggyCredentials,
  investmentId: string,
): Promise<PluggyInvestmentTransaction[]> {
  const items: PluggyInvestmentTransaction[] = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({ page: String(page), pageSize: "500" });
    const data = await pluggyFetch<{ results: PluggyInvestmentTransaction[]; totalPages: number }>(
      credentials,
      `/investments/${investmentId}/transactions?${params.toString()}`,
    );
    items.push(...data.results);
    if (page >= data.totalPages) break;
    page += 1;
  }
  return items;
}

export async function createSupportTicket(
  supabase: Db,
  ticket: {
    user_id: string;
    title: string;
    description?: string | null;
    bank_connection_id?: string | null;
  },
) {
  await supabase.from("support_tickets").insert({
    user_id: ticket.user_id,
    title: ticket.title,
    description: ticket.description ?? null,
    bank_connection_id: ticket.bank_connection_id ?? null,
    source: "bank_sync",
  });
}

const RESGATE_CATEGORY_NAME = "Resgate de investimento";
// Tolerância pra casar um resgate (SELL) da Pluggy com o lançamento de
// receita correspondente na conta bancária: mesmo valor (2 casas), data de
// liquidação até alguns dias depois da data do resgate (TED/PIX pode levar
// um tempinho pra cair).
const REDEMPTION_MATCH_WINDOW_DAYS = 5;
const REDEMPTION_MATCH_AMOUNT_TOLERANCE = 0.01;

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / msPerDay,
  );
}

async function getOrCreateResgateCategory(supabase: Db, userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("category_type", "income")
    .eq("name", RESGATE_CATEGORY_NAME)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: RESGATE_CATEGORY_NAME, category_type: "income" })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Falha ao criar categoria de resgate.");
  return created.id;
}

// Casa resgates (SELL) de investimentos ainda não vinculados com um
// lançamento de receita "solto" (sem categoria) na conta bancária — mesmo
// valor, data próxima — e já aplica a categoria "Resgate de investimento"
// automaticamente. Roda depois de sincronizar investimentos de uma conexão
// e de novo depois do cron completo (o resgate e o depósito bancário podem
// estar em conexões diferentes).
export async function matchInvestmentRedemptions(supabase: Db, userId: string): Promise<void> {
  const { data: pendingSells } = await supabase
    .from("investment_transactions")
    .select("id, amount, trade_date")
    .eq("user_id", userId)
    .eq("movement_type", "SELL")
    .is("matched_transaction_id", null);
  if (!pendingSells?.length) return;

  const { data: candidates } = await supabase
    .from("transactions")
    .select("id, amount, transaction_date")
    .eq("user_id", userId)
    .eq("transaction_type", "income")
    .is("category_id", null);
  if (!candidates?.length) return;

  const claimed = new Set<string>();
  let resgateCategoryId: string | null = null;
  for (const sell of pendingSells) {
    const match = candidates.find(
      (c) =>
        !claimed.has(c.id) &&
        Math.abs(Number(c.amount) - Number(sell.amount)) <= REDEMPTION_MATCH_AMOUNT_TOLERANCE &&
        Math.abs(daysBetween(c.transaction_date, sell.trade_date)) <= REDEMPTION_MATCH_WINDOW_DAYS,
    );
    if (!match) continue;
    claimed.add(match.id);
    resgateCategoryId ??= await getOrCreateResgateCategory(supabase, userId);
    await supabase
      .from("investment_transactions")
      .update({ matched_transaction_id: match.id })
      .eq("id", sell.id);
    await supabase
      .from("transactions")
      .update({ category_id: resgateCategoryId })
      .eq("id", match.id);
  }
}

export async function syncConnection(
  supabase: Db,
  userId: string,
  credentials: PluggyCredentials,
  connection: { id: string; pluggy_item_id: string },
) {
  const item = await pluggyFetch<PluggyItem>(credentials, `/items/${connection.pluggy_item_id}`);
  const { results: pluggyAccounts } = await pluggyFetch<{ results: PluggyAccount[] }>(
    credentials,
    `/accounts?itemId=${connection.pluggy_item_id}`,
  );

  let importedCount = 0;
  for (const pAccount of pluggyAccounts) {
    if (pAccount.type === "CREDIT") {
      const { data: existingCard } = await supabase
        .from("credit_cards")
        .select("id")
        .eq("pluggy_account_id", pAccount.id)
        // Sempre limitar ao dono da conexão: o cron roda com o cliente de
        // serviço (sem RLS) para todos os usuários, e um pluggy_account_id
        // repetido entre usuários (sandbox) religaria o cartão de outro.
        .eq("user_id", userId)
        .maybeSingle();
      let cardId = existingCard?.id ?? null;
      if (!cardId) {
        const { data: created, error } = await supabase
          .from("credit_cards")
          .insert({
            user_id: userId,
            name: pAccount.name || item.connector?.name || "Cartão conectado",
            institution: item.connector?.name ?? null,
            credit_limit: pAccount.creditData?.creditLimit ?? 0,
            closing_day: clampDay(dayOfMonth(pAccount.creditData?.balanceCloseDate) ?? 1),
            due_day: clampDay(dayOfMonth(pAccount.creditData?.balanceDueDate) ?? 10),
            bank_connection_id: connection.id,
            pluggy_account_id: pAccount.id,
          })
          .select("id")
          .single();
        if (error || !created) throw new Error(error?.message ?? "Falha ao criar cartão.");
        cardId = created.id;
      } else {
        // Reconectar reaproveita o cartão pelo pluggy_account_id (estável na
        // Pluggy); religa à conexão atual, já que excluir uma conexão antiga
        // apenas desvincula (bank_connection_id vai a NULL), não apaga o cartão.
        await supabase
          .from("credit_cards")
          .update({ bank_connection_id: connection.id })
          .eq("id", cardId)
          .eq("user_id", userId);
      }
      const [txs, closedBillIds] = await Promise.all([
        fetchAllTransactions(credentials, pAccount.id),
        fetchClosedBillIds(credentials, pAccount.id),
      ]);
      const rows = txs
        .filter((t) => (t.type ?? (t.amount >= 0 ? "DEBIT" : "CREDIT")) === "DEBIT")
        .filter((t) => {
          const billId = t.creditCardMetadata?.billId;
          return !billId || !closedBillIds.has(billId);
        })
        .map((t) => ({
          user_id: userId,
          card_id: cardId!,
          description: t.description,
          amount: Math.abs(t.amount),
          purchase_date: t.date.slice(0, 10),
          source: "api",
          external_id: t.id,
        }));
      if (rows.length) {
        const { error } = await supabase
          .from("credit_card_transactions")
          .upsert(rows, { onConflict: "card_id,external_id" });
        if (error) throw new Error(error.message);
        importedCount += rows.length;
      }
    } else {
      const { data: existingAccount } = await supabase
        .from("accounts")
        .select("id")
        .eq("pluggy_account_id", pAccount.id)
        // Mesma proteção do cartão: nunca reaproveitar a conta de outro usuário.
        .eq("user_id", userId)
        .maybeSingle();
      let accountId = existingAccount?.id ?? null;
      // A Pluggy manda o conector usado (ex.: "MeuPluggy", o agregador), não
      // o banco em si — a instituição real vem dos dados da própria conta.
      const institutionName =
        pAccount.marketingName || pAccount.name || item.connector?.name || null;
      const { branchNumber, accountNumber } = splitTransferNumber(
        pAccount.bankData?.transferNumber,
        pAccount.number,
      );
      const ownerName = pAccount.owner || null;

      // Antes de criar, tenta adotar uma conta que o próprio usuário já tinha
      // cadastrado à mão para esse mesmo banco (mesmo número de conta, ou
      // mesmo nome). Sem isso a conexão criava uma segunda conta e o saldo
      // aparecia duplicado na tela de contas: a antiga com o saldo congelado
      // e a nova com o saldo real.
      if (!accountId) {
        const candidates = await supabase
          .from("accounts")
          .select("id, name, account_number")
          .eq("user_id", userId)
          .is("pluggy_account_id", null);
        const normalize = (value: string | null | undefined) =>
          (value ?? "").replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
        const targetNumber = normalize(accountNumber);
        const targetName = normalize(pAccount.name);
        const adopted =
          (targetNumber &&
            candidates.data?.find((a) => normalize(a.account_number) === targetNumber)) ||
          (targetName && candidates.data?.find((a) => normalize(a.name) === targetName)) ||
          null;
        if (adopted) accountId = adopted.id;
      }
      const isNewAccount = !existingAccount?.id;

      if (!accountId) {
        const { data: created, error } = await supabase
          .from("accounts")
          .insert({
            user_id: userId,
            name: pAccount.name || item.connector?.name || "Conta conectada",
            institution: institutionName,
            owner_name: ownerName,
            branch_number: branchNumber,
            account_number: accountNumber,
            account_type: "checking",
            currency: pAccount.currencyCode || "BRL",
            initial_balance: 0,
            bank_connection_id: connection.id,
            pluggy_account_id: pAccount.id,
          })
          .select("id")
          .single();
        if (error || !created) throw new Error(error?.message ?? "Falha ao criar conta.");
        accountId = created.id;
      } else {
        // Mesmo motivo do cartão: religa à conexão atual ao reaproveitar
        // uma conta órfã de uma conexão excluída anteriormente, e atualiza
        // os dados de identificação (podem ter faltado em sincronizações
        // anteriores a esse campo existir).
        await supabase
          .from("accounts")
          .update({
            bank_connection_id: connection.id,
            institution: institutionName,
            owner_name: ownerName,
            branch_number: branchNumber,
            account_number: accountNumber,
          })
          .eq("id", accountId)
          .eq("user_id", userId);
      }
      const txs = await fetchAllTransactions(credentials, pAccount.id);
      const rows = txs.map((t) => {
        // No Open Finance real, amount vem sempre positivo — a direção é o
        // campo type (DEBIT = saiu, CREDIT = entrou), não o sinal do valor.
        // Cair no sinal só quando type não vier (ex.: alguns conectores de
        // teste do sandbox que já mandam amount com sinal).
        const isIncome = t.type ? t.type === "CREDIT" : t.amount >= 0;
        return {
          user_id: userId,
          transaction_type: (isIncome ? "income" : "expense") as "income" | "expense",
          account_id: accountId!,
          amount: Math.abs(t.amount),
          transaction_date: t.date.slice(0, 10),
          description: t.description,
          source: "api",
          external_id: t.id,
        };
      });
      if (rows.length) {
        // Se o usuário já reclassificou um lançamento importado como
        // transferência, ele tem conta de destino preenchida. Sobrescrever só
        // o tipo (income/expense) deixaria a linha inconsistente e o banco
        // recusa (transactions_check), então preservamos essas linhas.
        const transferIds = new Set<string>();
        for (let i = 0; i < rows.length; i += 500) {
          const slice = rows.slice(i, i + 500).map((r) => r.external_id);
          const { data: existing } = await supabase
            .from("transactions")
            .select("external_id")
            .eq("user_id", userId)
            .eq("transaction_type", "transfer")
            .in("external_id", slice);
          for (const row of existing ?? []) {
            if (row.external_id) transferIds.add(row.external_id);
          }
        }
        const upsertRows = rows
          .filter((r) => !transferIds.has(r.external_id))
          .map((r) => ({ ...r, destination_account_id: null }));
        if (upsertRows.length) {
          const { error } = await supabase
            .from("transactions")
            .upsert(upsertRows, { onConflict: "user_id,external_id" });
          if (error) throw new Error(error.message);
        }
        importedCount += upsertRows.length;

        // O histórico disponível na Pluggy não cobre a vida toda da conta;
        // ajustamos o saldo inicial para o saldo calculado bater com o saldo
        // real informado por ela, mas só na primeira sincronização (conta
        // recém-criada). Recalcular em toda sincronização é frágil: se o
        // histórico devolvido variar entre chamadas (paginação, janela de
        // datas, etc.), o saldo fica à deriva a cada sync em vez de só
        // acrescentar os lançamentos novos.
        if (isNewAccount) {
          const sum = rows.reduce(
            (acc, r) => acc + (r.transaction_type === "income" ? r.amount : -r.amount),
            0,
          );
          await supabase
            .from("accounts")
            .update({ initial_balance: pAccount.balance - sum })
            .eq("id", accountId)
            .eq("user_id", userId)
            .eq("pluggy_account_id", pAccount.id);
        }
      }
    }
  }

  const pluggyInvestments = await fetchAllInvestments(credentials, connection.pluggy_item_id);
  for (const pInvestment of pluggyInvestments) {
    const { data: existingInvestment } = await supabase
      .from("investments")
      .select("id")
      .eq("pluggy_investment_id", pInvestment.id)
      // Mesma proteção de accounts/credit_cards contra pluggy_investment_id
      // repetido entre usuários (sandbox).
      .eq("user_id", userId)
      .maybeSingle();
    let investmentId = existingInvestment?.id ?? null;
    const investmentPayload = {
      user_id: userId,
      bank_connection_id: connection.id,
      pluggy_investment_id: pInvestment.id,
      name: pInvestment.name,
      investment_type: pInvestment.type,
      investment_subtype: pInvestment.subtype ?? null,
      currency: pInvestment.currencyCode || "BRL",
      balance: pInvestment.balance,
      amount_original: pInvestment.amountOriginal ?? null,
      amount_profit: pInvestment.amountProfit ?? null,
      last_synced_at: new Date().toISOString(),
    };
    if (!investmentId) {
      const { data: created, error } = await supabase
        .from("investments")
        .insert(investmentPayload)
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Falha ao criar investimento.");
      investmentId = created.id;
    } else {
      await supabase
        .from("investments")
        .update(investmentPayload)
        .eq("id", investmentId)
        .eq("user_id", userId);
    }

    const invTxs = await fetchInvestmentTransactions(credentials, pInvestment.id).catch(() => []);
    const invRows = invTxs.map((t) => {
      const tradeDate = (t.tradeDate ?? t.date).slice(0, 10);
      // Nem toda movimentação vem com id próprio — cai num identificador
      // sintético (data+tipo+valor+quantidade) pra manter o upsert idempotente.
      const externalId = t.id ?? `${tradeDate}:${t.type}:${t.amount}:${t.quantity ?? ""}`;
      return {
        user_id: userId,
        investment_id: investmentId!,
        movement_type: t.type,
        description: t.description ?? null,
        amount: Math.abs(t.amount),
        quantity: t.quantity ?? null,
        trade_date: tradeDate,
        external_id: externalId,
      };
    });
    if (invRows.length) {
      const { error } = await supabase
        .from("investment_transactions")
        .upsert(invRows, { onConflict: "investment_id,external_id" });
      if (error) throw new Error(error.message);
    }
  }
  try {
    await matchInvestmentRedemptions(supabase, userId);
  } catch {
    // Casamento de resgate é um extra sobre a sincronização em si — uma
    // falha aqui não deve derrubar o sync de contas/cartões/investimentos.
  }

  await supabase
    .from("bank_connections")
    .update({
      status: item.status.toLowerCase(),
      status_detail: item.executionStatus ?? null,
      connector_name: item.connector?.name ?? null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return { importedCount, itemStatus: item.status };
}

export const savePluggyCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { clientId: string; clientSecret: string }) => input)
  .handler(async ({ context, data }) => {
    const clientId = data.clientId.trim();
    const clientSecret = data.clientSecret.trim();
    if (!clientId || !clientSecret) {
      throw new Error("Preencha o Client ID e o Client Secret.");
    }
    // Confirma que as credenciais realmente autenticam antes de salvar, pra
    // não deixar o usuário achando que configurou e só descobrir que estava
    // errado na hora de conectar um banco.
    await getApiKey({ clientId, clientSecret });
    // A gravação também passa pelo service role: a tabela de credenciais não
    // é acessível pelo role do usuário, nem para escrita.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("pluggy_credentials")
      .upsert(
        { user_id: context.userId, client_id: clientId, client_secret: clientSecret },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createPluggyConnectToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { oauthRedirectUrl: string }) => input)
  .handler(async ({ context, data }) => {
    const credentials = await getUserPluggyCredentials(context.userId);
    const result = await pluggyFetch<{ accessToken: string }>(credentials, "/connect_token", {
      method: "POST",
      body: JSON.stringify({
        options: {
          clientUserId: context.userId,
          avoidDuplicates: true,
          // Conectores baseados em Open Finance/OAuth (ex.: MeuPluggy) fazem
          // um redirecionamento de ida e volta para autorizar o acesso; sem
          // essa URL a Pluggy não sabe pra onde trazer o usuário de volta e
          // o fluxo falha com um erro genérico.
          oauthRedirectUrl: data.oauthRedirectUrl,
        },
      }),
    });
    return { connectToken: result.accessToken };
  });

// Extraído de registerBankConnection pra ser reaproveitado também pela
// descoberta automática de itens (discoverPluggyItems), que registra vários
// de uma vez.
async function registerAndSyncItem(
  supabase: Db,
  userId: string,
  credentials: PluggyCredentials,
  pluggyItemId: string,
) {
  const { data: existing } = await supabase
    .from("bank_connections")
    .select("id")
    .eq("pluggy_item_id", pluggyItemId)
    .maybeSingle();
  let connectionId = existing?.id ?? null;
  if (!connectionId) {
    const { data: created, error } = await supabase
      .from("bank_connections")
      .insert({ user_id: userId, pluggy_item_id: pluggyItemId, status: "connecting" })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao registrar conexão.");
    connectionId = created.id;
  }
  try {
    const result = await syncConnection(supabase, userId, credentials, {
      id: connectionId,
      pluggy_item_id: pluggyItemId,
    });
    return { connectionId, ...result };
  } catch (syncError) {
    const message = syncError instanceof Error ? syncError.message : String(syncError);
    await supabase
      .from("bank_connections")
      .update({ status: "error", status_detail: message })
      .eq("id", connectionId);
    await createSupportTicket(supabase, {
      user_id: userId,
      bank_connection_id: connectionId,
      title: "Falha ao sincronizar conexão bancária recém-criada",
      description: message,
    });
    throw syncError;
  }
}

export const registerBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pluggyItemId: string }) => input)
  .handler(async ({ context, data }) => {
    const credentials = await getUserPluggyCredentials(context.userId);
    return registerAndSyncItem(context.supabase, context.userId, credentials, data.pluggyItemId);
  });

// GET /v2/items é opt-in na Pluggy (precisa ser habilitado pelo suporte
// deles pra cada conta) — por isso segue com uma mensagem clara em vez de
// travar a tela quando não está disponível, deixando o registro manual de
// IDs como alternativa.
async function fetchAllPluggyItemIds(credentials: PluggyCredentials): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  for (;;) {
    const params = new URLSearchParams(after ? { after } : {});
    const data = await pluggyFetch<{ results: { id: string }[]; next: string | null }>(
      credentials,
      `/v2/items?${params.toString()}`,
    );
    ids.push(...data.results.map((r) => r.id));
    if (!data.next) break;
    const nextAfter = new URL(data.next, PLUGGY_BASE_URL).searchParams.get("after");
    if (!nextAfter) break;
    after = nextAfter;
  }
  return ids;
}

// Busca todos os itens já existentes na Pluggy pro clientId do usuário e
// registra/sincroniza cada um, sem precisar colar ID por ID manualmente.
export const discoverPluggyItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const credentials = await getUserPluggyCredentials(context.userId);
    let itemIds: string[];
    try {
      itemIds = await fetchAllPluggyItemIds(credentials);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Não foi possível listar os itens automaticamente. O recurso de listagem (GET /v2/items) é opt-in na Pluggy — pode ser preciso pedir pro suporte deles habilitar pra sua conta. Cole os IDs manualmente enquanto isso. Detalhe: ${message}`,
      );
    }
    let succeeded = 0;
    const failures: { id: string; message: string }[] = [];
    for (const itemId of itemIds) {
      try {
        await registerAndSyncItem(context.supabase, context.userId, credentials, itemId);
        succeeded += 1;
      } catch (error) {
        failures.push({
          id: itemId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { total: itemIds.length, succeeded, failures };
  });

// Bloqueia sincronização manual repetida antes desse intervalo; a
// atualização automática diária (cron) não passa por aqui.
const MIN_HOURS_BETWEEN_MANUAL_SYNCS = 12;

export const syncBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { connectionId: string }) => input)
  .handler(async ({ context, data }) => {
    const credentials = await getUserPluggyCredentials(context.userId);
    const { data: connection, error } = await context.supabase
      .from("bank_connections")
      .select("id, pluggy_item_id, last_synced_at")
      .eq("id", data.connectionId)
      .single();
    if (error || !connection) throw new Error("Conexão não encontrada.");
    if (connection.last_synced_at) {
      const hoursSinceSync =
        (Date.now() - new Date(connection.last_synced_at).getTime()) / (60 * 60 * 1000);
      if (hoursSinceSync < MIN_HOURS_BETWEEN_MANUAL_SYNCS) {
        const remaining = Math.ceil(MIN_HOURS_BETWEEN_MANUAL_SYNCS - hoursSinceSync);
        throw new Error(
          `Essa conexão já foi sincronizada há menos de ${MIN_HOURS_BETWEEN_MANUAL_SYNCS}h. Tente novamente em ${remaining}h.`,
        );
      }
    }
    try {
      return await syncConnection(context.supabase, context.userId, credentials, connection);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      await context.supabase
        .from("bank_connections")
        .update({ status: "error", status_detail: message })
        .eq("id", connection.id);
      await createSupportTicket(context.supabase, {
        user_id: context.userId,
        bank_connection_id: connection.id,
        title: "Falha ao sincronizar conexão bancária",
        description: message,
      });
      throw syncError;
    }
  });

export const deleteBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { connectionId: string }) => input)
  .handler(async ({ context, data }) => {
    const { data: connection, error } = await context.supabase
      .from("bank_connections")
      .select("id, pluggy_item_id")
      .eq("id", data.connectionId)
      .single();
    if (error || !connection) throw new Error("Conexão não encontrada.");

    // TODO(produção): antes de ir pra produção, volte a remover o item do
    // lado da Pluggy também (pluggyFetch(credentials, `/items/${connection.pluggy_item_id}`,
    // { method: "DELETE" })). Desligado agora porque, em desenvolvimento,
    // isso obriga reconectar do zero na Pluggy a cada teste — só queremos
    // limpar os dados locais.

    // accounts/credit_cards.bank_connection_id é ON DELETE SET NULL (não
    // CASCADE): apagar a conexão sem isso os deixaria órfãos — reaproveitados
    // (com todo o histórico antigo) na próxima reconexão, em vez de recriados
    // do zero. Por isso o cascade é feito aqui, explicitamente.
    const [{ data: orphanedAccounts }, { data: orphanedCards }] = await Promise.all([
      context.supabase.from("accounts").select("id").eq("bank_connection_id", connection.id),
      context.supabase.from("credit_cards").select("id").eq("bank_connection_id", connection.id),
    ]);

    for (const account of orphanedAccounts ?? []) {
      const { error: txError } = await context.supabase
        .from("transactions")
        .delete()
        .or(`account_id.eq.${account.id},destination_account_id.eq.${account.id}`);
      if (txError) throw new Error(txError.message);
    }
    if (orphanedAccounts?.length) {
      const { error: accountError } = await context.supabase
        .from("accounts")
        .delete()
        .in(
          "id",
          orphanedAccounts.map((a) => a.id),
        );
      if (accountError) throw new Error(accountError.message);
    }
    if (orphanedCards?.length) {
      // credit_card_transactions cai em cascata (ON DELETE CASCADE).
      const { error: cardError } = await context.supabase
        .from("credit_cards")
        .delete()
        .in(
          "id",
          orphanedCards.map((c) => c.id),
        );
      if (cardError) throw new Error(cardError.message);
    }

    const { error: deleteError } = await context.supabase
      .from("bank_connections")
      .delete()
      .eq("id", connection.id);
    if (deleteError) throw new Error(deleteError.message);
    return { ok: true };
  });
