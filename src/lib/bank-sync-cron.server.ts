import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { createSupportTicket, syncConnection } from "@/lib/pluggy.functions";

// Disparado diariamente às 01:00 pelo agendador da Lovable Cloud (protegido
// por LOVABLE_CRON_SECRET) para trazer as movimentações do dia anterior de
// todas as conexões bancárias, sem o usuário precisar clicar em nada.
export async function handleBankSyncCron(request: Request): Promise<Response> {
  const authError = await authenticateCronRequest(request);
  if (authError) return authError;

  const { data: connections, error } = await supabaseAdmin
    .from("bank_connections")
    .select("id, user_id, pluggy_item_id");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let synced = 0;
  let failed = 0;
  for (const connection of connections ?? []) {
    try {
      await syncConnection(supabaseAdmin, connection.user_id, connection);
      synced += 1;
    } catch (syncError) {
      failed += 1;
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      await supabaseAdmin
        .from("bank_connections")
        .update({ status: "error", status_detail: message })
        .eq("id", connection.id);
      await createSupportTicket(supabaseAdmin, {
        user_id: connection.user_id,
        bank_connection_id: connection.id,
        title: "Falha na sincronização automática diária",
        description: message,
      });
    }
  }

  return new Response(JSON.stringify({ synced, failed }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
