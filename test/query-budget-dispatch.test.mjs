/**
 * mind_query forwards the optional max_context_tokens budget, and only when set.
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/query-budget-dispatch.test.mjs
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

async function connect(stub) {
  const server = createMindMcpServer(stub);
  const client = new Client({ name: "query-budget-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

test("max_context_tokens is advertised and forwarded", async () => {
  const calls = [];
  const client = await connect({ async query(req) { calls.push(req); return { response: "ok" }; } });
  const { tools } = await client.listTools();
  const props = tools.find((t) => t.name === "mind_query").inputSchema.properties;
  expect(props.max_context_tokens).toMatchObject({ type: "integer", minimum: 1000, maximum: 30000 });

  await client.callTool({ name: "mind_query", arguments: { query: "q" } });
  await client.callTool({ name: "mind_query", arguments: { query: "q", max_context_tokens: 8000 } });
  expect(calls[0].max_context_tokens).toBeUndefined();
  expect(calls[1].max_context_tokens).toBe(8000);
  await client.close();
});
