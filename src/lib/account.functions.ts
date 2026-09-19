import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Direito de portabilidade (LGPD art. 18, V): dump de tudo que o usuário
// tem cadastrado, num formato legível. Usa o client autenticado (respeita
// RLS) em vez do admin — cada tabela já tem política de SELECT restrita ao
// dono, então não corre risco de vazar dado de outro usuário por um filtro
// esquecido.
//
// profiles e telegram_recipients ficam de fora do "*": nenhum motivo pra
// devolver pluggy_client_secret (mesmo cifrado, é lixo pro usuário) nem
// telegram_recipients.link_token (token de vínculo ainda válido — exportar
// isso deixaria o arquivo baixado equivalente a uma credencial ativa).
export const exportUserData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [
      profile,
      accounts,
      categories,
      transactions,
      assets,
      costCenters,
      creditCards,
      creditCardTransactions,
      bankConnections,
      supportTickets,
      telegramRecipients,
      telegramDigests,
    ] = await Promise.all([
      db
        .from("profiles")
        .select("id, display_name, preferred_currency, created_at, updated_at")
        .eq("id", context.userId)
        .maybeSingle(),
      db.from("accounts").select("*"),
      db.from("categories").select("*"),
      db.from("transactions").select("*"),
      db.from("assets").select("*"),
      db.from("cost_centers").select("*"),
      db.from("credit_cards").select("*"),
      db.from("credit_card_transactions").select("*"),
      db.from("bank_connections").select("*"),
      db.from("support_tickets").select("*"),
      db
        .from("telegram_recipients")
        .select(
          "id, label, telegram_username, telegram_chat_id, notify_daily, notify_weekly, notify_monthly, all_accounts, account_ids, card_ids, created_at, updated_at",
        ),
      db.from("telegram_digests").select("*"),
    ]);

    return {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      accounts: accounts.data ?? [],
      categories: categories.data ?? [],
      transactions: transactions.data ?? [],
      assets: assets.data ?? [],
      cost_centers: costCenters.data ?? [],
      credit_cards: creditCards.data ?? [],
      credit_card_transactions: creditCardTransactions.data ?? [],
      bank_connections: bankConnections.data ?? [],
      support_tickets: supportTickets.data ?? [],
      telegram_recipients: telegramRecipients.data ?? [],
      telegram_digests: telegramDigests.data ?? [],
    };
  });

// Direito de exclusão (LGPD art. 18, VI / art. 8º §5º): apaga todos os
// dados do usuário e a própria conta de autenticação.
//
// Usa supabaseAdmin (service_role) em vez do client autenticado porque (a)
// só o admin consegue apagar o usuário em auth.users, e (b) support_tickets
// e telegram_digests não têm política de RLS para DELETE (só
// select/insert/update) — pelo client autenticado, apagar essas duas
// tabelas falharia ou não apagaria nada, deixando resíduo. Por isso todo
// filtro abaixo é explícito por user_id/id: sem RLS de proteção aqui, um
// filtro esquecido apagaria a tabela inteira de todo mundo.
//
// Ordem importa: transactions/credit_card_transactions referenciam
// accounts/credit_cards com ON DELETE RESTRICT — apagar a conta antes dos
// lançamentos que apontam pra ela falha. As demais tabelas não têm essa
// restrição entre si.
const USER_OWNED_TABLES_IN_DELETE_ORDER = [
  // Filhos com ON DELETE RESTRICT contra accounts/credit_cards primeiro —
  // apagar a conta antes falharia com os lançamentos ainda apontando pra ela.
  "credit_card_transactions",
  "transactions",
  "credit_cards",
  "accounts",
  "categories",
  "cost_centers",
  "assets",
  "support_tickets",
  "telegram_digests",
  "telegram_recipients",
  "bank_connections",
] as const;

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    for (const table of USER_OWNED_TABLES_IN_DELETE_ORDER) {
      const { error } = await supabaseAdmin.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(`Falha ao apagar ${table}: ${error.message}`);
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (profileError) throw new Error(`Falha ao apagar profile: ${profileError.message}`);

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) throw new Error(authError.message);

    return { ok: true };
  });
