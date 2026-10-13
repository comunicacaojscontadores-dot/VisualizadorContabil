import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import bioPageHtml from "./assets/jscontadores-bio.html?raw";

const BIO_PAGE_PATH = "/bio";

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
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  // Keepalive contra a pausa por inatividade do plano gratuito (7 dias sem uso).
  //
  // A versão anterior só fazia um SELECT com a chave pública, a cada 3 dias. Duas
  // falhas seguidas já estouravam a janela — e uma leitura barrada pelo RLS responde
  // sem tocar em dado nenhum, o que é um sinal de atividade fraco.
  //
  // Agora: escrita de verdade (UPDATE na tabela keepalive) com a service_role, duas
  // vezes por dia. Mesmo que falhe vários dias seguidos, sobra folga na janela.
  async scheduled(_event: unknown, env: Record<string, string>, _ctx: unknown) {
    const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
    const service = (env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/^﻿/, "").trim();
    const anon = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

    if (!url) {
      console.error("[keepalive] FALHOU: SUPABASE_URL ausente");
      return;
    }

    // 1) Escrita — o sinal de atividade que mais conta.
    if (service) {
      try {
        const res = await fetch(`${url}/rest/v1/keepalive?id=eq.1`, {
          method: "PATCH",
          headers: {
            apikey: service,
            Authorization: `Bearer ${service}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ ultima_execucao: new Date().toISOString() }),
        });
        const corpo = await res.text();
        if (res.ok) {
          console.log("[keepalive] escrita OK:", corpo.slice(0, 120));
        } else {
          // 404 aqui significa que a tabela keepalive ainda não foi criada —
          // rode supabase/recuperacao/tabelas-faltantes.sql.
          console.error("[keepalive] escrita FALHOU:", res.status, corpo.slice(0, 200));
        }
      } catch (e) {
        console.error("[keepalive] escrita FALHOU (rede):", e);
      }
    } else {
      console.error("[keepalive] SUPABASE_SERVICE_ROLE_KEY ausente — só leitura");
    }

    // 2) Leitura, como segunda via: se a escrita falhar por permissão, o projeto
    //    ainda recebe tráfego.
    if (anon) {
      try {
        const res = await fetch(`${url}/rest/v1/demonstrativos?select=id&limit=1`, {
          headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
        });
        console.log("[keepalive] leitura:", res.status);
      } catch (e) {
        console.error("[keepalive] leitura FALHOU:", e);
      }
    }

    // 3) Auth — outro serviço do projeto, para o sinal não depender só do PostgREST.
    try {
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon || service } });
      console.log("[keepalive] auth:", res.status);
    } catch (e) {
      console.error("[keepalive] auth FALHOU:", e);
    }
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname === BIO_PAGE_PATH) {
      return new Response(bioPageHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);

      // Impede cache de HTML pelo browser/CDN — JS/CSS têm hash no nome e podem ser cacheados
      const ct = normalized.headers.get("content-type") ?? "";
      if (ct.includes("text/html") && normalized.status < 400) {
        const headers = new Headers(normalized.headers);
        headers.set("Cache-Control", "no-store");
        return new Response(normalized.body, { status: normalized.status, headers });
      }
      return normalized;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  },
};
