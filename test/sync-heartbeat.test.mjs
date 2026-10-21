/**
 * MIND sync heartbeat (AGENTS.md section 2.11) over the stdio MCP server:
 * mind_sessions action=heartbeat, the mind-sync-heartbeat prompt, the
 * instructions paragraph, and the mind://sessions/pending resource with
 * resources/subscribe + notifications/resources/updated.
 */
import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

function mockClient() {
  const state = { pending: [], beats: [] };
  return {
    state,
    agentSessionHeartbeat: async (req) => {
      state.beats.push(req);
      return { ok: true, pending_replies: state.pending, next_beat_seconds: 900 };
    },
    pendingAgentReplies: async () => ({ pending: state.pending, count: state.pending.length }),
  };
}

async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "hb-test", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}

test("heartbeat dispatches source_key, agent, runtime, unsynced", async () => {
  const mock = mockClient();
  const client = await connect(mock);
  const unsynced = [{ session_id: "s1", role: "assistant", content: "x" }];
  const r = await client.callTool({ name: "mind_sessions", arguments: { action: "heartbeat", source_key: "grokbot", agent: "Pulse", runtime: "grok", unsynced } });
  expect(r.isError).toBeFalsy();
  expect(mock.state.beats[0]).toEqual({ source_key: "grokbot", agent: "Pulse", runtime: "grok", unsynced });
  const bad = await client.callTool({ name: "mind_sessions", arguments: { action: "heartbeat" } });
  expect(bad.isError).toBe(true);
  await client.close();
});

test("instructions state the rule; prompt carries the beat body", async () => {
  const client = await connect(mockClient());
  expect(client.getInstructions()).toMatch(/MIND SYNC HEARTBEAT/);
  expect(client.getInstructions()).toMatch(/every 15 minutes/);
  expect(client.getInstructions()).toMatch(/mind-sync-heartbeat/);
  const { prompts } = await client.listPrompts();
  expect(prompts.map((p) => p.name)).toContain("mind-sync-heartbeat");
  const got = await client.getPrompt({ name: "mind-sync-heartbeat" });
  expect(got.messages[0].content.text).toMatch(/action=heartbeat/);
  await client.close();
});

test("pending resource is readable, advertises subscribe, and notifies on a new reply", async () => {
  process.env.MIND_PENDING_POLL_MS = "40";
  const mock = mockClient();
  const client = await connect(mock);
  expect(client.getServerCapabilities().resources.subscribe).toBe(true);
  const read = await client.readResource({ uri: "mind://sessions/pending" });
  expect(JSON.parse(read.contents[0].text)).toEqual({ pending_replies: [] });
  const updated = new Promise((resolve) =>
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => resolve(n.params.uri)),
  );
  await client.subscribeResource({ uri: "mind://sessions/pending" });
  await new Promise((r) => setTimeout(r, 120)); // baseline poll sees nothing
  mock.state.pending = [{ session_id: "s1", reply_id: "r1", content: "hi", created_at: "t" }];
  expect(await updated).toBe("mind://sessions/pending");
  await client.unsubscribeResource({ uri: "mind://sessions/pending" });
  await client.close();
});
