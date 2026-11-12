/**
 * MindClient retries an HTML edge block (403/429/503 text/html) with a gzipped body, remembers
 * the working route for the session, and leaves normal calls and JSON errors alone.
 *
 * Run: cd mcp-server && npm run build && npx vitest run test/edge-fallback.test.mjs
 */
import { test, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { MindClient } = require("../dist/mind-client.js");
const { isEdgeBlock, alternateMindUrl, gzipInit, edgeFallbackFetch } = require("../dist/edge-fallback.js");

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const html403 = () => new Response("<html>blocked</html>", { status: 403, headers: { "content-type": "text/html" } });
const json200 = () => new Response(JSON.stringify({ response: "ok" }), { status: 200, headers: { "content-type": "application/json" } });
const BLOCKED = "what does cat ../../etc/passwd | bash do in our logs";

// Stub edge: plain bodies containing shell-looking text are blocked; gzip passes.
function installEdge(calls) {
  globalThis.fetch = async (url, init) => {
    const h = new Headers(init.headers);
    const gz = h.get("content-encoding") === "gzip";
    const text = gz ? gunzipSync(init.body).toString() : String(init.body ?? "");
    calls.push({ url: String(url), gz, text });
    if (!gz && /etc\/passwd|\| bash/.test(text)) return html403();
    return json200();
  };
}

test("plain request passes through once, not gzipped", async () => {
  const calls = [];
  installEdge(calls);
  const c = new MindClient({ baseUrl: "https://mindapp.onrender.com", apiKey: "k" });
  await c.query({ query: "what is springdose", mode: "naive" });
  expect(calls).toHaveLength(1);
  expect(calls[0].gz).toBe(false);
});

test("edge HTML 403 is retried gzipped, same URL, same body; route is remembered", async () => {
  const calls = [];
  installEdge(calls);
  const c = new MindClient({ baseUrl: "https://mindapp.onrender.com", apiKey: "k" });
  const r = await c.query({ query: BLOCKED, mode: "naive" });
  expect(r.response).toBe("ok");
  expect(calls).toHaveLength(2);
  expect(calls[0].gz).toBe(false);
  expect(calls[1].gz).toBe(true);
  expect(calls[1].url).toBe(calls[0].url);
  expect(JSON.parse(calls[1].text).query).toBe(BLOCKED);
  // next call goes straight to gzip (remembered for the session)
  await c.query({ query: "anything else", mode: "naive" });
  expect(calls).toHaveLength(3);
  expect(calls[2].gz).toBe(true);
});

test("a JSON 403 from MIND itself is NOT retried", async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return new Response('{"detail":"forbidden"}', { status: 403, headers: { "content-type": "application/json" } }); };
  const c = new MindClient({ baseUrl: "https://mindapp.onrender.com", apiKey: "k" });
  await expect(c.query({ query: "x", mode: "naive" })).rejects.toThrow();
  expect(n).toBe(1);
});

test("custom base URL (not a MIND host) is never rerouted", async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return html403(); };
  const c = new MindClient({ baseUrl: "http://localhost:9999", apiKey: "k" });
  await expect(c.query({ query: BLOCKED, mode: "naive" })).rejects.toThrow();
  expect(n).toBe(1);
});

test("helpers: isEdgeBlock, alternateMindUrl, gzipInit", () => {
  expect(isEdgeBlock(html403())).toBe(true);
  expect(isEdgeBlock(json200())).toBe(false);
  expect(isEdgeBlock(new Response("<html/>", { status: 500, headers: { "content-type": "text/html" } }))).toBe(false);
  expect(alternateMindUrl("https://m-i-n-d.ai/developer/v1/query")).toBe("https://mindapp.onrender.com/developer/v1/query");
  expect(alternateMindUrl("https://example.com/x")).toBeUndefined();
  const init = gzipInit({ method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
  expect(new Headers(init.headers).get("content-encoding")).toBe("gzip");
  expect(gunzipSync(init.body).toString()).toBe('{"a":1}');
});

test("falls back to the other MIND address when gzip is still blocked", async () => {
  const seen = [];
  const base = async (url) => { seen.push(String(url)); return String(url).includes("m-i-n-d.ai") ? json200() : html403(); };
  const f = edgeFallbackFetch(base);
  const res = await f("https://mindapp.onrender.com/developer/v1/query", { method: "POST", body: "{}" });
  expect(res.status).toBe(200);
  expect(seen[0]).toContain("mindapp.onrender.com");
  expect(seen[seen.length - 1]).toContain("m-i-n-d.ai");
});
