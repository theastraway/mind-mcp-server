/**
 * Regression lock for the prompt-surface release (CHANGELOG 0.26.0).
 *
 * WHY THIS EXISTS: a description audit found 41 of the 44 shipped tool
 * descriptions were byte-identical across four minor versions (0.21.0 ->
 * 0.25.0) -- the tool description layer had effectively never been edited,
 * even though it is the only system prompt MIND controls on the connecting
 * agent's side. This test does not re-litigate wording; it locks the
 * load-bearing GUIDANCE that must survive every future edit to mind_query,
 * mind_context, and mind_remember so this layer cannot silently regress
 * back to a thin, boilerplate one-liner.
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/tool-descriptions.test.mjs
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// dist is CommonJS -- load it through Node's require cache, same pattern as
// the other dispatch tests in this directory.
const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

async function connect() {
  // listTools() never touches the MindClient, so an empty stub is enough.
  const server = createMindMcpServer({});
  const client = new Client({ name: "tool-descriptions-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function descriptionsByName(client) {
  const { tools } = await client.listTools();
  const map = new Map();
  for (const t of tools) map.set(t.name, t.description ?? "");
  return map;
}

test("mind_query description teaches how to ask, how to pick a mode, and how to read a negative", async () => {
  const client = await connect();
  try {
    const descriptions = await descriptionsByName(client);
    const desc = descriptions.get("mind_query");
    expect(desc, "mind_query tool must be registered").toBeTruthy();

    // How to ask: rich full-sentence questions, retrieve-then-write in one ask.
    expect(desc).toMatch(/full-sentence question/i);
    expect(desc).toMatch(/retrieve-then-write/i);
    // Name the expected document/entity — the naming-the-target instruction.
    expect(desc).toMatch(/Name the thing you expect to find/i);
    // Change the question, not the mode, when an answer is thin.
    expect(desc).toMatch(/change the QUESTION, not the mode/);
    // Mechanically accurate mode picker — all five modes named with a role.
    for (const mode of ["naive", "local", "global", "hybrid", "mix"]) {
      expect(desc, `mode picker must mention "${mode}"`).toMatch(new RegExp(mode, "i"));
    }
    // Negatives are the highest-risk answer class — never assert absence
    // from an empty result without re-asking and saying what was searched.
    expect(desc).toMatch(/NEGATIVES ARE THE HIGHEST-RISK ANSWER/);
    expect(desc).toMatch(/never proof the thing does not exist|not proof the thing does not exist/i);
    expect(desc).toMatch(/re-ask with different wording and say what you searched/i);
  } finally {
    await client.close();
  }
});

test("mind_context description sets retrieved-context, focused-payload, and empty-recent expectations", async () => {
  const client = await connect();
  try {
    const descriptions = await descriptionsByName(client);
    const desc = descriptions.get("mind_context");
    expect(desc, "mind_context tool must be registered").toBeTruthy();

    // Retrieved context, not a finished briefing.
    expect(desc).toMatch(/RETRIEVED CONTEXT/);
    expect(desc).toMatch(/not a finished briefing/i);
    // A focused payload beats a full one.
    expect(desc).toMatch(/focused payload measurably outperforms the full/i);
    // Dates carry facts; the newer fact wins on conflict.
    expect(desc).toMatch(/newer one wins/i);
    // An empty recent section means nothing was logged, not nothing happened.
    expect(desc).toMatch(/empty `recent` section means nothing was logged, not that nothing happened/i);
  } finally {
    await client.close();
  }
});

test("mind_remember description keeps the safety/title rule verbatim and adds write-time retrieval guidance", async () => {
  const client = await connect();
  try {
    const descriptions = await descriptionsByName(client);
    const desc = descriptions.get("mind_remember");
    expect(desc, "mind_remember tool must be registered").toBeTruthy();

    // Existing private/public safety text — must survive unchanged.
    expect(desc).toMatch(/PRIVATE vs PUBLIC/);
    expect(desc).toMatch(/NEVER use `feed_post`/);
    // Existing title rule — must survive unchanged.
    expect(desc).toMatch(/Lesson - Failure - <behavior>/);
    expect(desc).toMatch(/never put '\/' or parentheses in a title/);

    // New: retrieval quality is decided at write time, not query time.
    expect(desc).toMatch(/retrieval quality is decided here, not at query time/i);
    // New: put the entity name in the first sentence.
    expect(desc).toMatch(/entity name in the first sentence/i);
    // New: inline dates/ids/paths instead of vague references.
    expect(desc).toMatch(/"the PR"/);
    expect(desc).toMatch(/"yesterday"/);
    // New: say what a note supersedes.
    expect(desc).toMatch(/supersedes an earlier note/i);
    expect(desc).toMatch(/name what it replaces/i);
  } finally {
    await client.close();
  }
});

test("no tool description in the catalog is empty", async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.description && t.description.length > 0, `${t.name} has a non-empty description`).toBe(true);
    }
  } finally {
    await client.close();
  }
});
