// MIND is reachable at two public addresses behind different web edges: the API service itself
// (mindapp.onrender.com, Render's CDN) and the public site (m-i-n-d.ai, which proxies /developer/v1 to the same
// service). Both edges run managed rules that answer an HTML 403 when a plain-text request body contains
// SQL-, path-traversal- or shell-looking text (measured 2026-11-05: "' OR 1=1", "../../etc/passwd", "| bash").
// An agent conversation quotes code and logs constantly, so on the Atlas account every turn died with
// "MIND could not be reached (HTTP 403 from the web edge)". A gzip-compressed body passes both edges, and MIND
// decompresses `Content-Encoding: gzip` (MINDapp PR 2978 for the LLM routes, and a gzip request middleware for every route).
//
// On an edge block this wrapper retries: same address gzipped, then the other address plain, then the other
// address gzipped. The first combination that gets through is used first for the rest of the session.
import { gzipSync } from "node:zlib";

const PAIRS: Record<string, string> = {
  "mindapp.onrender.com": "m-i-n-d.ai",
  "m-i-n-d.ai": "mindapp.onrender.com",
  "www.m-i-n-d.ai": "mindapp.onrender.com",
};

/** A response from a web edge rather than MIND: a 403/429/503 whose body is an HTML page. */
export function isEdgeBlock(res: Response): boolean {
  if (![403, 429, 503].includes(res.status)) return false;
  return /text\/html/i.test(res.headers.get("content-type") ?? "");
}

/** The same URL on the other MIND address, or undefined when the host is not a MIND address. */
export function alternateMindUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const alt = PAIRS[u.hostname.toLowerCase()];
    if (!alt) return undefined;
    u.hostname = alt;
    return u.toString();
  } catch {
    return undefined;
  }
}

const withHost = (url: string, host: string): string => { const u = new URL(url); u.host = host; return u.toString(); };

/** The same request init with the string body gzipped and `Content-Encoding: gzip` set. */
export function gzipInit(init: RequestInit): RequestInit {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Encoding", "gzip");
  return { ...init, headers, body: gzipSync(Buffer.from(String(init.body), "utf8")) };
}

interface Route { host: string; gzip: boolean }

/**
 * Wrap fetch so a MIND call blocked by a web edge is retried (gzip on the same address, then the other address
 * plain and gzipped). The working route is remembered per blocked host for this wrapper instance. Non-MIND URLs
 * pass through. Only string bodies (every MIND JSON call) are replayed or compressed.
 */
export function edgeFallbackFetch(base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  const preferred = new Map<string, Route>(); // blocked host -> route that worked
  const wrapped = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (input instanceof Request) return base(input, init);
    const url = String(input);
    let host: string;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return base(input, init); }
    if (!PAIRS[host]) return base(input, init);
    const hasBody = typeof init?.body === "string" && init.body.length > 0;
    const replayable = init?.body === undefined || init?.body === null || typeof init.body === "string";
    const send = (r: Route): Promise<Response> => base(withHost(url, r.host), r.gzip && hasBody ? gzipInit(init!) : init);

    const pref = preferred.get(host);
    const first: Route = pref ?? { host: new URL(url).host, gzip: false };
    const res = await send(first);
    if (!isEdgeBlock(res) || !replayable) return res;

    const origHost = new URL(url).host;
    const altUrl = alternateMindUrl(url);
    const altHost = altUrl ? new URL(altUrl).host : undefined;
    const tries: Route[] = [];
    if (hasBody) tries.push({ host: origHost, gzip: true });
    if (altHost) tries.push({ host: altHost, gzip: false });
    if (altHost && hasBody) tries.push({ host: altHost, gzip: true });
    for (const r of tries) {
      if (r.host === first.host && r.gzip === first.gzip) continue;
      let next: Response;
      try { next = await send(r); } catch { continue; }
      if (isEdgeBlock(next)) continue;
      preferred.set(host, r);
      return next;
    }
    return res;
  };
  return wrapped as typeof fetch;
}
