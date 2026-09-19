import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const CRON_BANK_SYNC_PATH = "/api/public/cron/bank-sync";
const DEBUG_SQL_PATH = "/api/public/debug/sql";
const TELEGRAM_WEBHOOK_PATH = "/api/public/telegram/webhook";

// Aplicados em toda resposta (SSR, server functions e as três rotas
// /api/public/* acima) — nenhuma delas tinha nenhum header de segurança
// antes. CSP fica limitada a diretivas que não arriscam quebrar o app: o
// SSR do TanStack Start emite <script> inline sem nonce na hidratação, e
// travar script-src/default-src sem plumbing de nonce deixaria a tela em
// branco em produção. object-src/frame-ancestors/base-uri/form-action não
// dependem disso e já cobrem clickjacking e injeção de <base>/formulário.
function withSecurityHeaders(response: Response): Response {
  // Reconstrói em vez de mutar response.headers diretamente: em runtimes
  // como Cloudflare Workers, algumas respostas (ex.: vindas de outro
  // fetch/redirect) têm headers imutáveis e `.set()` lançaria erro ali.
  const headers = new Headers(response.headers);
  headers.set(
    "content-security-policy",
    "object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  headers.set("x-frame-options", "DENY");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === CRON_BANK_SYNC_PATH) {
        const { handleBankSyncCron } = await import("./lib/bank-sync-cron.server");
        return withSecurityHeaders(await handleBankSyncCron(request));
      }
      if (pathname === DEBUG_SQL_PATH) {
        const { handleDebugSql } = await import("./lib/debug-sql.server");
        return withSecurityHeaders(await handleDebugSql(request));
      }
      if (pathname === TELEGRAM_WEBHOOK_PATH) {
        const { handleTelegramWebhook } = await import("./lib/telegram.server");
        return withSecurityHeaders(await handleTelegramWebhook(request));
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
