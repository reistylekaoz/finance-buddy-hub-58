import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Endpoint de consulta somente-leitura ao banco, para ferramentas externas de
// debug (ex.: agentes conectados via GitHub). Protegido por token no header
// Authorization: Bearer <DEBUG_SQL_TOKEN>.
export async function handleDebugSql(request: Request): Promise<Response> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }

  const expected = process.env["DEBUG_SQL_TOKEN"];
  if (!expected) {
    return json({ error: "DEBUG_SQL_TOKEN não configurado." }, 500);
  }

  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);

  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  if (!timingSafeEqual(digest(token), digest(expected))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let query: unknown;
  try {
    ({ query } = (await request.json()) as { query?: unknown });
  } catch {
    return json({ error: "Corpo inválido: envie {\"query\": \"select ...\"}" }, 400);
  }
  if (typeof query !== "string" || !query.trim()) {
    return json({ error: 'Informe {"query": "select ..."}' }, 400);
  }
  if (query.length > 20000) {
    return json({ error: "Consulta muito longa." }, 400);
  }

  const { data, error } = await supabaseAdmin.rpc("debug_readonly_sql", { query });
  if (error) return json({ error: error.message }, 400);
  const rows = Array.isArray(data) ? data : [];
  return json({ rowCount: rows.length, rows }, 200);
}
