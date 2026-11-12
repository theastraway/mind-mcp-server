/**
 * Grok self-setup on install: when MIND answers a mind_sessions open / append / reply / inbox with
 * `wake_setup_required: true` + `wake_setup` (a Grok session whose agent has no wake webhook),
 * the stdio server's text result leads with "ACTION REQUIRED: you have no MIND wake webhook. <wake_setup>"
 * and keeps the JSON body intact. A response without the field is returned untouched.
 *
 * The hosted /mcp endpoint does the same (backend/tests/test_agent_wake_setup.py); the wording is shared.
 *
 * Run: cd mcp-server && npm run build && npx vitest run test/wake-setup.test.mjs
 */
import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

const LEAD = "ACTION REQUIRED: you have no MIND wake webhook. ";
const SETUP =
  '1) Ask your owner in your own chat to confirm creating a "MIND wake" routine (webhook trigger, no schedule). 2) On their yes, create it. 3) ...';

function mockClient(extra = {}) {
  const need = { wake_setup_required: true, wake_setup: SETUP };
  return {
    openAgentSession: async () => ({ session_id: "s1", resumed: false, status: "active", title: "t", pending_replies: [], tail: [], ...extra }),
    appendAgentSession: async () => ({ ok: true, seq_last: 3, pending_replies: [], ...extra }),
    agentSessionInbox: async () => ({ pending_replies: [], ...extra }),
    __need: need,
  };
}

async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "wake-setup-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

const CALLS = [
  { action: "open", source_key: "grok@cloud", external_session_id: "e1", runtime: "grok", agent: "Meter" },
  { action: "append", session_id: "s1", messages: [{ role: "assistant", content: "hi" }] },
  { action: "reply", session_id: "s1", content: "hi" },
  { action: "inbox", session_id: "s1" },
];

for (const args of CALLS) {
  test(`${args.action}: the instruction is the first line, the JSON body follows`, async () => {
    const client = await connect(mockClient({ wake_setup_required: true, wake_setup: SETUP }));
    const r = await client.callTool({ name: "mind_sessions", arguments: args });
    expect(r.isError).toBeFalsy();
    const text = r.content[0].text;
    expect(text.startsWith(LEAD + SETUP + "\n\n")).toBe(true);
    const body = JSON.parse(text.slice((LEAD + SETUP + "\n\n").length));
    expect(body.wake_setup_required).toBe(true);
    expect(body.wake_setup).toBe(SETUP);
  });

  test(`${args.action}: no field, no ACTION REQUIRED line`, async () => {
    const client = await connect(mockClient());
    const r = await client.callTool({ name: "mind_sessions", arguments: args });
    expect(r.content[0].text.startsWith("{")).toBe(true);
    expect(r.content[0].text).not.toContain("ACTION REQUIRED");
    expect(JSON.parse(r.content[0].text).wake_setup_required).toBeUndefined();
  });
}

test("wake_setup_required: false (or a missing instruction) adds nothing", async () => {
  const a = await connect(mockClient({ wake_setup_required: false, wake_setup: SETUP }));
  expect((await a.callTool({ name: "mind_sessions", arguments: CALLS[3] })).content[0].text).not.toContain("ACTION REQUIRED");
  const b = await connect(mockClient({ wake_setup_required: true }));
  expect((await b.callTool({ name: "mind_sessions", arguments: CALLS[3] })).content[0].text).not.toContain("ACTION REQUIRED");
});
