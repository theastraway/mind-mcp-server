/**
 * mind_context: legacy five-query path vs POST /developer/v1/context behind
 * the dark MIND_CONTEXT_V1 flag.
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/context-v1-dispatch.test.mjs
 */

import { test, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

const V1 = {
  sections: [
    { section: "recent", status: "ok", omitted_count: 1,
      items: [{ text: "Shipped the weekly report", date: "2026-09-27", source: "entry:abc" }] },
  ],
  max_tokens: 3000, estimated_tokens: 420, total_omitted: 1,
};

function stubClient() {
  const calls = [];
  return {
    calls,
    async query(req) { calls.push(["query", req]); return { response: `legacy ${req.query.slice(0, 8)}` }; },
    async context(req) { calls.push(["context", req]); return V1; },
  };
}

async function callContext(stub, args) {
  const server = createMindMcpServer(stub);
  const client = new Client({ name: "context-v1-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  try {
    const res = await client.callTool({ name: "mind_context", arguments: args });
    return res.content[0].text;
  } finally {
    await client.close();
  }
}

afterEach(() => { delete process.env.MIND_CONTEXT_V1; });

test("flag off keeps the legacy five mix queries", async () => {
  const stub = stubClient();
  const text = await callContext(stub, {});
  expect(stub.calls.map((c) => c[0])).toEqual(["query", "query", "query", "query", "query"]);
  expect(stub.calls.every((c) => c[1].mode === "mix" && c[1].retrieve_only === true)).toBe(true);
  expect(text).toMatch(/^## SOUL/);
});

test("flag on calls /v1/context with for_task and max_tokens and renders dated items", async () => {
  process.env.MIND_CONTEXT_V1 = "1";
  const stub = stubClient();
  const text = await callContext(stub, {
    sections: ["recent"], for_task: "draft a status update", max_tokens: 3000,
  });
  expect(stub.calls).toEqual([
    ["context", { sections: ["recent"], for_task: "draft a status update", max_tokens: 3000 }],
  ]);
  expect(text).toContain("## RECENT (ok, 1 omitted for budget)");
  expect(text).toContain("- Shipped the weekly report [2026-09-27, entry:abc]");
  expect(text).toContain("~420 of 3000 tokens");
});

test("mind_context advertises optional for_task and max_tokens", async () => {
  const server = createMindMcpServer({});
  const client = new Client({ name: "context-v1-schema", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  const { tools } = await client.listTools();
  const props = tools.find((t) => t.name === "mind_context").inputSchema.properties;
  expect(Object.keys(props).sort()).toEqual(["action", "for_task", "max_tokens", "pins", "sections"]);
  await client.close();
});

test("get_pins and set_pins call the pins endpoints and skip context loading", async () => {
  const calls = [];
  const stub = {
    async getContextPins() { calls.push(["get"]); return { pins: { user: ["d1"] } }; },
    async setContextPins(p) { calls.push(["set", p]); return { pins: p, rejected: [] }; },
    async query() { calls.push(["query"]); return { response: "x" }; },
  };
  const server = createMindMcpServer(stub);
  const client = new Client({ name: "pins-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  const got = await client.callTool({ name: "mind_context", arguments: { action: "get_pins" } });
  await client.callTool({ name: "mind_context", arguments: { action: "set_pins", pins: { user: ["d1"] } } });
  expect(calls).toEqual([["get"], ["set", { user: ["d1"] }]]);
  expect(got.content[0].text).toContain("d1");
  await client.close();
});
