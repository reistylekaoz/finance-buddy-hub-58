import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Limite de chamadas por minuto — o token é estático e o endpoint fica em
// /api/public/debug/sql, então isso é a única barreira contra um script
// varrendo tabela por tabela caso o token vaze.
const MAX_QUERIES_PER_MINUTE = 20;

async function isRateLimited(): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("debug_sql_audit_log")
    .select("id", { count: "exact", head: true })
    .gte("requested_at", since);
  return (count ?? 0) >= MAX_QUERIES_PER_MINUTE;
}

async function auditLog(query: string, rowCount: number | null, error: string | null) {
  await supabaseAdmin.from("debug_sql_audit_log").insert({ query, row_count: rowCount, error });
}

// Endpoint de consulta somente-leitura ao banco, para ferramentas externas de
// debug (ex.: agentes conectados via GitHub). Protegido por token no header
// Authorization: Bearer <DEBUG_SQL_TOKEN>. A função debug_readonly_sql roda
// com um papel de banco próprio (debug_sql_role) sem acesso ao schema auth
// nem às colunas de credencial (pluggy_client_secret, link_token) — ver
// migração 20260920050000 — então mesmo um token vazado não expõe segredos
// nem dados fora do schema public. Toda chamada fica registrada em
// debug_sql_audit_log para detectar uso indevido.
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

  if (await isRateLimited()) {
    return json({ error: "Muitas consultas em pouco tempo — aguarde um minuto." }, 429);
  }

  let query: unknown;
  try {
    ({ query } = (await request.json()) as { query?: unknown });
  } catch {
    return json({ error: 'Corpo inválido: envie {"query": "select ..."}' }, 400);
  }
  if (typeof query !== "string" || !query.trim()) {
    return json({ error: 'Informe {"query": "select ..."}' }, 400);
  }
  if (query.length > 20000) {
    return json({ error: "Consulta muito longa." }, 400);
  }

  const { data, error } = await supabaseAdmin.rpc("debug_readonly_sql", { query });
  if (error) {
    await auditLog(query, null, error.message);
    return json({ error: error.message }, 400);
  }
  const rows = Array.isArray(data) ? data : [];
  await auditLog(query, rows.length, null);
  return json({ rowCount: rows.length, rows }, 200);
}
