/**
 * AGENT SESSION REPLIES - HARD RULE (2026-10-29) over the stdio MCP server, plus the three
 * flat wake-target actions (wake_target_set / wake_targets / wake_target_clear).
 *
 * Run: cd mcp-server && npm run build && npx vitest run test/agent-session-replies-rule.test.mjs
 */
import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");
const { AGENT_SESSION_REPLIES_RULE } = require("../dist/integration-guide.js");

const RULE_HEAD = "AGENT SESSION REPLIES - HARD RULE. Your owner talks to you from BotsByMIND (the MINDbots app) and MIND Chat -> Agents.";

function makeMockClient() {
  const calls = [];
  return {
    __calls: calls,
    setAgentWakeTarget: async (...a) => (calls.push(["set", ...a]), { ok: true, wake_target: { agent_key: "meter", has_secret: true } }),
    listAgentWakeTargets: async (...a) => (calls.push(["list", ...a]), { wake_targets: [], count: 0 }),
    clearAgentWakeTarget: async (...a) => (calls.push(["clear", ...a]), { ok: true }),
  };
}

async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "replies-rule-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

test("the rule is in the server instructions and the mind_sessions tool description", async () => {
  const client = await connect(makeMockClient());
  expect(AGENT_SESSION_REPLIES_RULE.startsWith(RULE_HEAD)).toBe(true);
  expect(client.getInstructions()).toContain(AGENT_SESSION_REPLIES_RULE);
  const tools = (await client.listTools()).tools;
  const desc = tools.find((t) => t.name === "mind_sessions").description;
  expect(desc).toContain(AGENT_SESSION_REPLIES_RULE);
  expect(desc).toContain("wake_target_set");
});

test("the rule names the npx poll command under Monitor, the curl fallback, the Grok MIND wake routine and the per-turn fallback", () => {
  // (1) Claude Code: the packaged poller, armed under Monitor, with the exact command and description.
  expect(AGENT_SESSION_REPLIES_RULE).toContain("arm Claude Code's Monitor tool with `npx -y @astramindapp/mcp-server poll --session <your MIND session_id>`");
  expect(AGENT_SESSION_REPLIES_RULE).toContain('(description "BotsByMIND replies for this session"; load Monitor with ToolSearch first if it is deferred)');
  expect(AGENT_SESSION_REPLIES_RULE).toMatch(/Re-arm it the moment it expires \(Monitor runs cap at 30 minutes\)/);
  // the no-npm fallback stays
  expect(AGENT_SESSION_REPLIES_RULE).toMatch(/every 10 to 15 seconds/);
  expect(AGENT_SESSION_REPLIES_RULE).toContain("while true; do curl -s -H");
  // (2) Grok and (3) every other runtime
  expect(AGENT_SESSION_REPLIES_RULE).toMatch(/routine named "MIND wake" with a webhook trigger/);
  expect(AGENT_SESSION_REPLIES_RULE).toMatch(/action=wake_target_set \(agent=<your bot name>, url, secret=<key>, runtime=grok\)/);
  expect(AGENT_SESSION_REPLIES_RULE).toMatch(/wake_setup_required: true and a wake_setup text/);
  expect(AGENT_SESSION_REPLIES_RULE).toMatch(/at least once per turn and at least every 60 seconds/);
});

test("wake_target_set dispatches agent, url, secret, runtime (default grok)", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const r = await client.callTool({ name: "mind_sessions", arguments: { action: "wake_target_set", agent: "Meter", url: "https://x.test/hooks/abcd", secret: "key-123" } });
  expect(r.isError).toBeFalsy();
  expect(mock.__calls).toEqual([["set", { agent: "Meter", url: "https://x.test/hooks/abcd", secret: "key-123", runtime: "grok" }]]);
  expect(JSON.stringify(r)).not.toContain("key-123"); // never echoed back
});

test("wake_targets lists and wake_target_clear removes", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  await client.callTool({ name: "mind_sessions", arguments: { action: "wake_targets" } });
  await client.callTool({ name: "mind_sessions", arguments: { action: "wake_target_clear", agent: "Meter" } });
  await client.callTool({ name: "mind_sessions", arguments: { action: "wake_target_clear", agent: "Meter", runtime: "grok" } });
  expect(mock.__calls).toEqual([["list"], ["clear", "Meter", "grok"], ["clear", "Meter", "grok"]]);
});

test("wake actions validate their required arguments without touching the client", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const a = await client.callTool({ name: "mind_sessions", arguments: { action: "wake_target_set", url: "https://x.test/h" } });
  const b = await client.callTool({ name: "mind_sessions", arguments: { action: "wake_target_set", agent: "Meter" } });
  const c = await client.callTool({ name: "mind_sessions", arguments: { action: "wake_target_clear" } });
  for (const r of [a, b, c]) expect(r.isError).toBe(true);
  expect(mock.__calls).toEqual([]);
});
