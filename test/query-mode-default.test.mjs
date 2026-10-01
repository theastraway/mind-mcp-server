/**
 * mind_query mode: no schema default (so a client that fills schema defaults
 * cannot pin hybrid over the server's choice), hybrid when omitted, mix when
 * MIND_QUERY_DEFAULT_MIX opts in, and an explicit mode always wins.
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/query-mode-default.test.mjs
 */

import { test, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

async function connect(stub) {
  const server = createMindMcpServer(stub);
  const client = new Client({ name: "query-mode-test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

afterEach(() => { delete process.env.MIND_QUERY_DEFAULT_MIX; });

test("mode is optional with no schema default", async () => {
  const client = await connect({ async query() { return { response: "ok" }; } });
  const { tools } = await client.listTools();
  const t = tools.find((x) => x.name === "mind_query");
  expect(t.inputSchema.properties.mode.default).toBeUndefined();
  expect(t.inputSchema.required || []).not.toContain("mode");
  expect(t.description).not.toContain("hybrid is the default");
  await client.close();
});

test("omitted mode is hybrid by default and mix when opted in; explicit wins", async () => {
  const calls = [];
  const client = await connect({ async query(req) { calls.push(req); return { response: "ok" }; } });
  await client.callTool({ name: "mind_query", arguments: { query: "q" } });
  process.env.MIND_QUERY_DEFAULT_MIX = "1";
  await client.callTool({ name: "mind_query", arguments: { query: "q" } });
  await client.callTool({ name: "mind_query", arguments: { query: "q", mode: "naive" } });
  expect(calls.map((c) => c.mode)).toEqual(["hybrid", "mix", "naive"]);
  await client.close();
});
