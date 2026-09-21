import { supabase } from "@/integrations/supabase/client";

// Registra que um lançamento vindo do banco foi removido de propósito, para
// que a sincronização diária não o recrie (e ele não volte para a fila de
// conciliação).
export async function ignoreExternalIds(
  userId: string,
  externalIds: (string | null | undefined)[],
  reason: string,
) {
  const ids = Array.from(new Set(externalIds.filter((id): id is string => !!id)));
  if (!ids.length) return;
  await supabase
    .from("ignored_external_ids")
    .upsert(
      ids.map((external_id) => ({ user_id: userId, external_id, reason })),
      { onConflict: "user_id,external_id", ignoreDuplicates: true },
    );
}
