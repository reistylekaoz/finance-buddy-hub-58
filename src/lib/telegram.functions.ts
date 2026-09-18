import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Fixo (não window.location.origin): essa ação é chamada de dentro do
// editor da Lovable às vezes, cujo preview roda em preview--<app>.lovable.app
// — um domínio protegido que devolve 401 pro Telegram. O webhook só funciona
// registrado contra o domínio público de produção.
const PRODUCTION_BASE_URL = "https://finance-buddy-hub-58.lovable.app";

export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { setTelegramWebhook } = await import("@/lib/telegram.server");
    const webhookUrl = `${PRODUCTION_BASE_URL}/api/public/telegram/webhook`;
    await setTelegramWebhook(webhookUrl);
    return { webhookUrl };
  });
