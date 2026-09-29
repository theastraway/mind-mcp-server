/**
 * mind_remember forwards `supersedes` for entries, only when set.
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/remember-supersedes-dispatch.test.mjs
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

test("supersedes is advertised and forwarded for entries only when set", async () => {
  const calls = [];
  const server = createMindMcpServer({
    async createEntry(req) { calls.push(req); return { entry_id: "e", title: "t" }; },
  });
  const client = new Client({ name: "remember-supersedes", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  const { tools } = await client.listTools();
  const props = tools.find((t) => t.name === "mind_remember").inputSchema.properties;
  expect(props.supersedes).toMatchObject({ type: "array", maxItems: 10 });
  await client.callTool({ name: "mind_remember", arguments: { content: "a" } });
  await client.callTool({ name: "mind_remember", arguments: { content: "b", supersedes: ["Old Title"] } });
  expect(calls[0].supersedes).toBeUndefined();
  expect(calls[1].supersedes).toEqual(["Old Title"]);
  await client.close();
});
