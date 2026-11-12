/**
 * Owner replies lead the TEXT result of mind_sessions open / append / reply / inbox.
 *
 * Why: the call that returns a reply also marks it delivered. Meter's hourly patrol routine called
 * open/append, got the owner's reply back inside JSON that read like patrol input, and never acted on it
 * (live, 2026-10-30). So when pending_replies is non-empty the text starts with a banner naming it a direct
 * instruction, then each reply, then (if a Grok wake webhook is missing) the ACTION REQUIRED line, then the
 * unchanged JSON body. The hosted /mcp endpoint does the same (backend/tests/test_agent_session_owner_reply_text.py).
 *
 * Run: cd mcp-server && npm run build && npx vitest run test/owner-reply-banner.test.mjs
 */
import { test, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer, OWNER_REPLY_BANNER } = require("../dist/server.js");

const BANNER =
  "OWNER REPLY FROM BOTSBYMIND - this is a direct instruction from your owner, not part of your routine; act on it and answer it in this session before anything else:";
const SETUP = "1) Ask your owner in your own chat to confirm creating a \"MIND wake\" routine. 2) ...";
const REPLIES = [
  { message_id: "m1", role: "user", origin: "mind", content: "stop the patrol and check the deploy\nthen tell me", created_at: "2026-10-30T01:04:00Z", meta: {} },
  { message_id: "m2", role: "user", origin: "mind", content: "also rotate the key", created_at: "2026-10-30T01:05:00Z", meta: { replied_by: "lance" } },
];

function mockClient(extra = {}) {
  return {
    openAgentSession: async () => ({ session_id: "s1", resumed: true, status: "active", title: "t", tail: [], pending_replies: [], ...extra }),
    appendAgentSession: async () => ({ ok: true, seq_last: 3, pending_replies: [], ...extra }),
    agentSessionInbox: async () => ({ pending_replies: [], ...extra }),
  };
}

async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "owner-reply-banner-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

const CALLS = [
  { action: "open", source_key: "claude-code-1", external_session_id: "e1", runtime: "claude-code" },
  { action: "append", session_id: "s1", messages: [{ role: "assistant", content: "patrol ok" }] },
  { action: "reply", session_id: "s1", content: "patrol ok" },
  { action: "inbox", session_id: "s1" },
];

test("the banner string is exported and is the agreed wording", () => {
  expect(OWNER_REPLY_BANNER).toBe(BANNER);
});

for (const args of CALLS) {
  test(`${args.action}: pending owner replies come first under the banner, JSON unchanged after`, async () => {
    const client = await connect(mockClient({ pending_replies: REPLIES }));
    const r = await client.callTool({ name: "mind_sessions", arguments: args });
    expect(r.isError).toBeFalsy();
    const text = r.content[0].text;
    const head =
      `${BANNER}\n[1] stop the patrol and check the deploy\nthen tell me\n[2] (shared Editor lance) also rotate the key\n\n`;
    expect(text.startsWith(head)).toBe(true);
    const body = JSON.parse(text.slice(head.length));
    expect(body.pending_replies).toEqual(REPLIES); // the JSON fields are untouched
  });

  test(`${args.action}: nothing pending means plain JSON, no banner`, async () => {
    const client = await connect(mockClient());
    const r = await client.callTool({ name: "mind_sessions", arguments: args });
    expect(r.content[0].text.startsWith("{")).toBe(true);
    expect(r.content[0].text).not.toContain("OWNER REPLY FROM BOTSBYMIND");
  });
}

test("owner reply first, then ACTION REQUIRED, then the JSON", async () => {
  const client = await connect(mockClient({ pending_replies: [REPLIES[0]], wake_setup_required: true, wake_setup: SETUP }));
  const text = (await client.callTool({ name: "mind_sessions", arguments: CALLS[1] })).content[0].text;
  const iBanner = text.indexOf(BANNER);
  const iAction = text.indexOf("ACTION REQUIRED: you have no MIND wake webhook. ");
  const iJson = text.indexOf("{\n");
  expect(iBanner).toBe(0);
  expect(iAction).toBeGreaterThan(iBanner);
  expect(iJson).toBeGreaterThan(iAction);
  expect(JSON.parse(text.slice(iJson)).wake_setup).toBe(SETUP);
});

test("an empty reply is shown as such rather than dropped", async () => {
  const client = await connect(mockClient({ pending_replies: [{ message_id: "m9", content: "  " }] }));
  const text = (await client.callTool({ name: "mind_sessions", arguments: CALLS[3] })).content[0].text;
  expect(text.startsWith(`${BANNER}\n[1] (empty message)\n\n`)).toBe(true);
});

test("the hosted endpoint carries the identical banner wording", () => {
  const py = fs.readFileSync(path.resolve(import.meta.dirname, "../../backend/routes/mcp_server_routes.py"), "utf-8");
  const m = py.match(/OWNER_REPLY_BANNER = \(\s*"([^"]+)"\s*"([^"]+)"\s*\)/);
  expect(m).not.toBeNull();
  expect(m[1] + m[2]).toBe(BANNER);
});
