/**
 * Coverage for the `sync-local-docs-to-mind` MCP prompt (src/server.ts +
 * src/integration-guide.ts, compiled to dist/server.js + dist/integration-guide.js).
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/sync-prompt.test.mjs
 *
 * Locks: (a) the server advertises the prompt via prompts/list with the
 * right name, title and arguments, (b) prompts/get with no arguments
 * defaults to a dry run and mentions the current working directory,
 * (c) prompts/get with root + dry_run:"false" interpolates both into the
 * returned text, (d) the returned text carries every load-bearing rule from
 * the shipped copy (secret exclusion, sequential-upload/no-duplicate,
 * PRIVATE-document-never-feed, classify-failures-by-status-code), and
 * (e) SERVER_INSTRUCTIONS (the MCP `initialize` response) carries the new
 * "LOCAL FILES BELONG IN MIND" standing rule.
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");
const { SERVER_INSTRUCTIONS } = require("../dist/integration-guide.js");

/** The prompt never touches MindClient, so an empty mock is sufficient. */
function makeMockClient() {
  return {};
}

async function connect(mock = makeMockClient()) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "sync-prompt-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const PROMPT_NAME = "sync-local-docs-to-mind";

test("prompts/list advertises sync-local-docs-to-mind with the right name, title and arguments", async () => {
  const client = await connect();
  const { prompts } = await client.listPrompts();
  const prompt = prompts.find((p) => p.name === PROMPT_NAME);
  expect(prompt, `${PROMPT_NAME} should be listed`).toBeTruthy();
  expect(prompt.title).toBe("Sync local documents into MIND");
  expect(prompt.description).toContain("Back up every durable document on this machine");

  const argNames = (prompt.arguments ?? []).map((a) => a.name).sort();
  expect(argNames).toEqual(["dry_run", "root", "since"]);
  // None of the three are required -- all optional per the copy spec.
  for (const arg of prompt.arguments ?? []) {
    expect(arg.required, `${arg.name} should be optional`).toBeFalsy();
  }
  await client.close();
});

test("prompts/get with no arguments defaults to a dry run and mentions the current working directory", async () => {
  const client = await connect();
  const result = await client.getPrompt({ name: PROMPT_NAME, arguments: {} });
  expect(result.messages).toHaveLength(1);
  const [message] = result.messages;
  expect(message.role).toBe("user");
  expect(message.content.type).toBe("text");
  const text = message.content.text;

  expect(text).toContain("the current working directory");
  expect(text.toLowerCase()).toContain("dry run");
  expect(text).toMatch(/dry_run is "true"/);
  await client.close();
});

test("prompts/get with root and dry_run:\"false\" interpolates both into the returned text", async () => {
  const client = await connect();
  const result = await client.getPrompt({
    name: PROMPT_NAME,
    arguments: { root: "/Users/anthonyjconti/Documents", dry_run: "false" },
  });
  const text = result.messages[0].content.text;

  expect(text).toContain("/Users/anthonyjconti/Documents");
  expect(text).not.toContain("the current working directory");
  expect(text.toUpperCase()).toContain("LIVE");
  expect(text).toMatch(/dry_run is "false"/);
  await client.close();
});

test("prompts/get with since interpolates the modification-date filter", async () => {
  const client = await connect();
  const result = await client.getPrompt({
    name: PROMPT_NAME,
    arguments: { since: "2026-01-01" },
  });
  const text = result.messages[0].content.text;
  expect(text).toContain("2026-01-01");
  await client.close();
});

test("the returned prompt text carries every load-bearing rule from the shipped copy", async () => {
  const client = await connect();
  const result = await client.getPrompt({ name: PROMPT_NAME, arguments: {} });
  const text = result.messages[0].content.text;

  // Secret-file exclusion rule.
  expect(text).toContain(".env");
  expect(text).toContain("credentials*");
  expect(text).toContain("BEGIN PRIVATE KEY");
  expect(text).toContain("skip silently on a hit");

  // Sequential-upload / no-duplicate rule.
  expect(text).toContain("Never create duplicates");
  expect(text).toContain("Upload **sequentially**");
  expect(text).toContain("Parallel uploads race the title check");

  // PRIVATE-document-never-feed rule.
  expect(text).toContain("Store with `mind_remember` as a PRIVATE `document`");
  expect(text).toContain("Never use `feed_post` or a thought");

  // Classify-failures-by-status-code rule.
  expect(text).toContain("Classify failures by their status code");
  expect(text).toContain("`400` with an extraction error");
  expect(text).toContain("`5xx` and connection failures are infrastructure");

  await client.close();
});

test("SERVER_INSTRUCTIONS carries the new LOCAL FILES BELONG IN MIND standing rule", () => {
  expect(SERVER_INSTRUCTIONS).toContain("LOCAL FILES BELONG IN MIND");
  expect(SERVER_INSTRUCTIONS).toContain("sync-local-docs-to-mind");
  // Positioned after the PRIVATE vs PUBLIC warning, before the tool map.
  const privateVsPublicIdx = SERVER_INSTRUCTIONS.indexOf("PRIVATE vs PUBLIC");
  const localFilesIdx = SERVER_INSTRUCTIONS.indexOf("LOCAL FILES BELONG IN MIND");
  const toolMapIdx = SERVER_INSTRUCTIONS.indexOf("TOOL MAP");
  expect(privateVsPublicIdx).toBeGreaterThan(-1);
  expect(localFilesIdx).toBeGreaterThan(privateVsPublicIdx);
  expect(toolMapIdx).toBeGreaterThan(localFilesIdx);
});
