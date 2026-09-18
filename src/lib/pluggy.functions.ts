import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

const PLUGGY_BASE_URL = "https://api.pluggy.ai";

type PluggyAccount = {
  id: string;
  type: "BANK" | "CREDIT";
  name: string;
  balance: number;
  currencyCode?: string;
  creditData?: {
    creditLimit?: number;
    balanceCloseDate?: string;
    balanceDueDate?: string;
  };
};

type PluggyTransaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  type?: "DEBIT" | "CREDIT";
};

type PluggyItem = {
  id: string;
  status: string;
  executionStatus?: string;
  connector?: { name: string };
};

let cachedApiKey: { key: string; expiresAt: number } | null = null;

async function getApiKey(): Promise<string> {
  if (cachedApiKey && cachedApiKey.expiresAt > Date.now()) return cachedApiKey.key;
  const clientId = process.env["PLUGGY_CLIENT_ID"];
  const clientSecret = process.env["PLUGGY_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error(
      "Integração bancária não configurada: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis de ambiente do Lovable Cloud.",
    );
  }
  const response = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!response.ok) throw new Error(`Falha ao autenticar com a Pluggy (${response.status}).`);
  const data = (await response.json()) as { apiKey: string };
  // O apiKey vale 2h; renovamos um pouco antes por margem de segurança.
  cachedApiKey = { key: data.apiKey, expiresAt: Date.now() + 100 * 60 * 1000 };
  return data.apiKey;
}

async function pluggyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = await getApiKey();
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

// GET /transactions (paginação por página) está descontinuado pela Pluggy e
// some após 2026-12-31; migrar para GET /v2/transactions (cursor) antes disso.
async function fetchAllTransactions(accountId: string): Promise<PluggyTransaction[]> {
  const items: PluggyTransaction[] = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({
      accountId,
      page: String(page),
      pageSize: "500",
    });
    const data = await pluggyFetch<{ results: PluggyTransaction[]; totalPages: number }>(
      `/transactions?${params.toString()}`,
    );
    items.push(...data.results);
    if (page >= data.totalPages || !data.results.length) break;
    page += 1;
  }
  return items;
}

async function syncConnection(
  supabase: Db,
  userId: string,
  connection: { id: string; pluggy_item_id: string },
) {
  const item = await pluggyFetch<PluggyItem>(`/items/${connection.pluggy_item_id}`);
  const { results: pluggyAccounts } = await pluggyFetch<{ results: PluggyAccount[] }>(
    `/accounts?itemId=${connection.pluggy_item_id}`,
  );

  let importedCount = 0;
  for (const pAccount of pluggyAccounts) {
    if (pAccount.type === "CREDIT") {
      const { data: existingCard } = await supabase
        .from("credit_cards")
        .select("id")
        .eq("pluggy_account_id", pAccount.id)
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
      }
      const txs = await fetchAllTransactions(pAccount.id);
      const rows = txs
        .filter((t) => (t.type ?? (t.amount >= 0 ? "DEBIT" : "CREDIT")) === "DEBIT")
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
        .maybeSingle();
      let accountId = existingAccount?.id ?? null;
      if (!accountId) {
        const { data: created, error } = await supabase
          .from("accounts")
          .insert({
            user_id: userId,
            name: pAccount.name || item.connector?.name || "Conta conectada",
            institution: item.connector?.name ?? null,
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
      }
      const txs = await fetchAllTransactions(pAccount.id);
      const rows = txs.map((t) => ({
        user_id: userId,
        transaction_type: (t.amount >= 0 ? "income" : "expense") as "income" | "expense",
        account_id: accountId!,
        amount: Math.abs(t.amount),
        transaction_date: t.date.slice(0, 10),
        description: t.description,
        source: "api",
        external_id: t.id,
      }));
      if (rows.length) {
        const { error } = await supabase
          .from("transactions")
          .upsert(rows, { onConflict: "user_id,external_id" });
        if (error) throw new Error(error.message);
        importedCount += rows.length;

        // O histórico disponível na Pluggy não cobre a vida toda da conta;
        // ajustamos o saldo inicial para o saldo calculado bater com o saldo
        // real informado por ela na primeira sincronização.
        const sum = rows.reduce(
          (acc, r) => acc + (r.transaction_type === "income" ? r.amount : -r.amount),
          0,
        );
        await supabase
          .from("accounts")
          .update({ initial_balance: pAccount.balance - sum })
          .eq("id", accountId)
          .eq("pluggy_account_id", pAccount.id);
      }
    }
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

export const createPluggyConnectToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const data = await pluggyFetch<{ accessToken: string }>("/connect_token", {
      method: "POST",
      body: JSON.stringify({
        options: { clientUserId: context.userId, avoidDuplicates: true },
      }),
    });
    return { connectToken: data.accessToken };
  });

export const registerBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pluggyItemId: string }) => input)
  .handler(async ({ context, data }) => {
    const { data: existing } = await context.supabase
      .from("bank_connections")
      .select("id")
      .eq("pluggy_item_id", data.pluggyItemId)
      .maybeSingle();
    let connectionId = existing?.id ?? null;
    if (!connectionId) {
      const { data: created, error } = await context.supabase
        .from("bank_connections")
        .insert({
          user_id: context.userId,
          pluggy_item_id: data.pluggyItemId,
          status: "connecting",
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Falha ao registrar conexão.");
      connectionId = created.id;
    }
    const result = await syncConnection(context.supabase, context.userId, {
      id: connectionId,
      pluggy_item_id: data.pluggyItemId,
    });
    return { connectionId, ...result };
  });

export const syncBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { connectionId: string }) => input)
  .handler(async ({ context, data }) => {
    const { data: connection, error } = await context.supabase
      .from("bank_connections")
      .select("id, pluggy_item_id")
      .eq("id", data.connectionId)
      .single();
    if (error || !connection) throw new Error("Conexão não encontrada.");
    return syncConnection(context.supabase, context.userId, connection);
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
    try {
      await pluggyFetch(`/items/${connection.pluggy_item_id}`, { method: "DELETE" });
    } catch {
      // Segue removendo localmente mesmo se a Pluggy já não tiver mais o item.
    }
    const { error: deleteError } = await context.supabase
      .from("bank_connections")
      .delete()
      .eq("id", connection.id);
    if (deleteError) throw new Error(deleteError.message);
    return { ok: true };
  });
