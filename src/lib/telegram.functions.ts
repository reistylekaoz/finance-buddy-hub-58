import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { baseUrl: string }) => input)
  .handler(async ({ data }) => {
    const { setTelegramWebhook } = await import("@/lib/telegram.server");
    const webhookUrl = `${data.baseUrl.replace(/\/$/, "")}/api/public/telegram/webhook`;
    await setTelegramWebhook(webhookUrl);
    return { webhookUrl };
  });
