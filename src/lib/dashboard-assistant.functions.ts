import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WidgetId } from "@/lib/dashboard-widgets";

export const interpretDashboardRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { text: string; currentOrder: WidgetId[] }) => input)
  .handler(async ({ data }) => {
    const { interpretDashboardWidgets } = await import("@/lib/dashboard-assistant.server");
    return await interpretDashboardWidgets(data.text, data.currentOrder);
  });
