import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Direito de portabilidade (LGPD art. 18, V): dump de tudo que o usuário
// tem cadastrado, num formato legível.
//
// Todo filtro abaixo é por user_id = context.userId, mesmo nas tabelas
// onde o RLS já deixaria passar mais linhas: com contas compartilhadas,
// "select *" respeitando RLS traria também os dados do DONO de uma conta
// que esse usuário só acessa como membro — o que seria exportar o dado
// financeiro de outra pessoa, não "os meus dados". account_members é a
// única exceção: inclui as duas direções (convites que ele criou e
// convites que ele aceitou), porque essa relação em si pertence a ele nos
// dois sentidos — sem nunca incluir invite_token (token de convite ainda
// válido) nem os dados financeiros de quem ele está mencionado como membro.
export const exportUserData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const userId = context.userId;

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
      investments,
      investmentTransactions,
      budgets,
      budgetRecipients,
      budgetAlertsSent,
      ignoredExternalIds,
      memberships,
    ] = await Promise.all([
      db
        .from("profiles")
        .select(
          "id, display_name, preferred_currency, pluggy_configured, dashboard_widgets, dashboard_filters, transactions_filters, active_filters, created_at, updated_at",
        )
        .eq("id", userId)
        .maybeSingle(),
      db.from("accounts").select("*").eq("user_id", userId),
      db.from("categories").select("*").eq("user_id", userId),
      db.from("transactions").select("*").eq("user_id", userId),
      db.from("assets").select("*").eq("user_id", userId),
      db.from("cost_centers").select("*").eq("user_id", userId),
      db.from("credit_cards").select("*").eq("user_id", userId),
      db.from("credit_card_transactions").select("*").eq("user_id", userId),
      db.from("bank_connections").select("*").eq("user_id", userId),
      db.from("support_tickets").select("*").eq("user_id", userId),
      db
        .from("telegram_recipients")
        .select(
          "id, label, telegram_username, telegram_chat_id, notify_daily, notify_weekly, notify_monthly, all_accounts, account_ids, card_ids, created_at, updated_at",
        )
        .eq("user_id", userId),
      db.from("telegram_digests").select("*").eq("user_id", userId),
      db.from("investments").select("*").eq("user_id", userId),
      db.from("investment_transactions").select("*").eq("user_id", userId),
      db.from("budgets").select("*").eq("user_id", userId),
      db.from("budget_recipients").select("*").eq("user_id", userId),
      db.from("budget_alerts_sent").select("*").eq("user_id", userId),
      db.from("ignored_external_ids").select("*").eq("user_id", userId),
      db
        .from("account_members")
        .select(
          "id, owner_user_id, member_user_id, email, status, can_edit, can_manage_connections, can_manage_members, invited_at, accepted_at, created_at, updated_at",
        )
        .or(`owner_user_id.eq.${userId},member_user_id.eq.${userId}`),
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
      investments: investments.data ?? [],
      investment_transactions: investmentTransactions.data ?? [],
      budgets: budgets.data ?? [],
      budget_recipients: budgetRecipients.data ?? [],
      budget_alerts_sent: budgetAlertsSent.data ?? [],
      ignored_external_ids: ignoredExternalIds.data ?? [],
      account_memberships: memberships.data ?? [],
    };
  });

// Direito de exclusão (LGPD art. 18, VI / art. 8º §5º): apaga todos os
// dados do usuário e a própria conta de autenticação.
//
// Usa supabaseAdmin (service_role) em vez do client autenticado porque
// support_tickets, telegram_digests, budget_recipients, budget_alerts_sent
// e investment_transactions não têm política de RLS para DELETE (só
// select/insert/update) — pelo client autenticado essas tabelas não
// apagariam nada, deixando resíduo. Por isso todo filtro abaixo é
// explícito por user_id/id: sem RLS de proteção aqui, um filtro esquecido
// apagaria a tabela inteira de todo mundo.
//
// account_members (nas duas direções) e pluggy_credentials têm
// "REFERENCES auth.users(id) ON DELETE CASCADE" — apagar o usuário em
// auth.users já limpa essas duas sozinho, sem precisar apagar aqui.
//
// Ordem importa pelas FKs com ON DELETE RESTRICT entre lançamentos e
// contas/cartões: filhos antes dos pais.
const USER_OWNED_TABLES_IN_DELETE_ORDER = [
  "investment_transactions",
  "credit_card_transactions",
  "transactions",
  "budget_alerts_sent",
  "budget_recipients",
  "investments",
  "budgets",
  "credit_cards",
  "accounts",
  "categories",
  "cost_centers",
  "assets",
  "support_tickets",
  "telegram_digests",
  "telegram_recipients",
  "bank_connections",
  "ignored_external_ids",
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
