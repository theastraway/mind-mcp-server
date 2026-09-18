/**
 * Dispatch-coverage tests for the mind_sessions tool (src/server.ts, compiled
 * to dist/server.js) — "Agent Sessions in MIND Chat".
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/agent-sessions-dispatch.test.mjs
 *
 * Locks: (a) every action reaches exactly its mapped MindClient method with
 * the arguments the REST contract expects, (b) required-param guards return
 * isError with the param name and never touch the client, (c) action=reply
 * is sugar over appendAgentSession with a single assistant-role message
 * (never the low-level replyAgentSession/REST-/reply client method), (d) the
 * tool description carries the compact AGENT SESSION PROTOCOL, (e) the
 * sync-agent-session prompt is advertised and interpolates runtime/source_key.
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");
const { MindApiError } = require("../dist/mind-client.js");

const AGENT_SESSION_METHODS = [
  "openAgentSession",
  "appendAgentSession",
  "closeAgentSession",
  "listAgentSessions",
  "getAgentSession",
  "replyAgentSession",
  "agentSessionInbox",
  "handoffAgentSession",
  "deleteAgentSession",
  "listAgentSessionSources",
  "createAgentSessionSource",
  "updateAgentSessionSource",
  "deleteAgentSessionSource",
];

/** Mock MindClient: records every agent-session call; can throw or return canned values. */
function makeMockClient() {
  const calls = [];
  const state = { failure: null };
  const mock = {
    __calls: calls,
    __fail: (err) => (state.failure = err),
  };
  for (const method of AGENT_SESSION_METHODS) {
    mock[method] = async (...args) => {
      calls.push({ method, args });
      if (state.failure) throw state.failure;
      return { ok: true };
    };
  }
  return mock;
}

async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "agent-sessions-dispatch-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const callSessions = (client, args) => client.callTool({ name: "mind_sessions", arguments: args });

const textOf = (result) => result.content.map((c) => c.text).join("\n");

test("open dispatches to openAgentSession with every field", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "open",
    source_key: "claude-code-1",
    external_session_id: "sess-1",
    runtime: "claude-code",
    title: "Fix the export pipeline",
    machine: "mac1",
    cwd: "/repo",
    repo: "MINDapp",
    branch: "main",
    model: "claude-sonnet-5",
    tags: ["mcp"],
  });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls).toHaveLength(1);
  expect(mock.__calls[0].method).toBe("openAgentSession");
  expect(mock.__calls[0].args[0]).toMatchObject({
    source_key: "claude-code-1",
    external_session_id: "sess-1",
    runtime: "claude-code",
    title: "Fix the export pipeline",
    repo: "MINDapp",
  });
  await client.close();
});

test("append dispatches to appendAgentSession with session_id, messages, title", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const messages = [
    { role: "user", content: "do the thing" },
    { role: "assistant", content: "done" },
  ];
  const result = await callSessions(client, { action: "append", session_id: "s1", messages, title: "New title" });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("appendAgentSession");
  expect(mock.__calls[0].args).toEqual(["s1", messages, "New title"]);
  await client.close();
});

test("reply is sugar over appendAgentSession with a single assistant message, never replyAgentSession", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "reply", session_id: "s1", content: "here you go" });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls).toHaveLength(1);
  expect(mock.__calls[0].method).toBe("appendAgentSession");
  expect(mock.__calls[0].args[0]).toBe("s1");
  expect(mock.__calls[0].args[1]).toEqual([{ role: "assistant", content: "here you go" }]);
  await client.close();
});

test("close dispatches to closeAgentSession with summary/status", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "close", session_id: "s1", summary: "shipped PR 42", status: "ended" });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("closeAgentSession");
  expect(mock.__calls[0].args[0]).toBe("s1");
  expect(mock.__calls[0].args[1]).toMatchObject({ summary: "shipped PR 42", status: "ended" });
  await client.close();
});

test("list dispatches to listAgentSessions with filters", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "list", source_key: "claude-code-1", status: "active", limit: 10 });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("listAgentSessions");
  expect(mock.__calls[0].args[0]).toMatchObject({ source_key: "claude-code-1", status: "active", limit: 10 });
  await client.close();
});

test("get dispatches to getAgentSession", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "get", session_id: "s1", limit: 50 });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("getAgentSession");
  expect(mock.__calls[0].args[0]).toBe("s1");
  expect(mock.__calls[0].args[1]).toMatchObject({ limit: 50 });
  await client.close();
});

test("inbox dispatches to agentSessionInbox", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "inbox", session_id: "s1" });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("agentSessionInbox");
  expect(mock.__calls[0].args[0]).toBe("s1");
  await client.close();
});

test("handoff dispatches to handoffAgentSession", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "handoff", session_id: "s1", to_source_key: "codex-1" });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("handoffAgentSession");
  expect(mock.__calls[0].args).toEqual(["s1", "codex-1"]);
  await client.close();
});

test("sources action defaults to list", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "sources" });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("listAgentSessionSources");
  await client.close();
});

test("sources action=create dispatches to createAgentSessionSource", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "sources",
    source_action: "create",
    key: "codex-1",
    label: "Codex 1",
    runtime: "codex",
  });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("createAgentSessionSource");
  expect(mock.__calls[0].args[0]).toMatchObject({ key: "codex-1", label: "Codex 1", runtime: "codex" });
  await client.close();
});

test("sources action=update dispatches to updateAgentSessionSource", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "sources",
    source_action: "update",
    source_id: "src1",
    label: "Renamed",
  });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("updateAgentSessionSource");
  expect(mock.__calls[0].args[0]).toBe("src1");
  expect(mock.__calls[0].args[1]).toMatchObject({ label: "Renamed" });
  await client.close();
});

test("sources action=delete dispatches to deleteAgentSessionSource", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "sources",
    source_action: "delete",
    source_id: "src1",
    force: true,
  });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls[0].method).toBe("deleteAgentSessionSource");
  expect(mock.__calls[0].args).toEqual(["src1", true]);
  await client.close();
});

// action → { args (missing something), mentions (param name in the guard message) }
const GUARDS = [
  { action: "open", args: {}, mentions: "source_key" },
  { action: "open", args: { source_key: "x" }, mentions: "external_session_id" },
  { action: "append", args: {}, mentions: "session_id" },
  { action: "append", args: { session_id: "s1" }, mentions: "messages" },
  { action: "reply", args: {}, mentions: "session_id" },
  { action: "reply", args: { session_id: "s1" }, mentions: "content" },
  { action: "close", args: {}, mentions: "session_id" },
  { action: "get", args: {}, mentions: "session_id" },
  { action: "inbox", args: {}, mentions: "session_id" },
  { action: "handoff", args: {}, mentions: "session_id" },
  { action: "handoff", args: { session_id: "s1" }, mentions: "to_source_key" },
];

test("required-param guards return isError with the param name and never hit the client", async () => {
  for (const { action, args, mentions } of GUARDS) {
    const mock = makeMockClient();
    const client = await connect(mock);
    const result = await callSessions(client, { action, ...args });
    expect(result.isError, `${action} without ${mentions} should be an error`).toBe(true);
    expect(textOf(result)).toContain(mentions);
    expect(mock.__calls.length, `${action} guard should block the client call`).toBe(0);
    await client.close();
  }
});

test("sources sub-action guards return isError and never hit the client", async () => {
  const cases = [
    { source_action: "create", args: {}, mentions: "key" },
    { source_action: "create", args: { key: "k" }, mentions: "label" },
    { source_action: "create", args: { key: "k", label: "L" }, mentions: "runtime" },
    { source_action: "update", args: {}, mentions: "source_id" },
    { source_action: "delete", args: {}, mentions: "source_id" },
  ];
  for (const { source_action, args, mentions } of cases) {
    const mock = makeMockClient();
    const client = await connect(mock);
    const result = await callSessions(client, { action: "sources", source_action, ...args });
    expect(result.isError, `sources ${source_action} without ${mentions} should be an error`).toBe(true);
    expect(textOf(result)).toContain(mentions);
    expect(mock.__calls.length).toBe(0);
    await client.close();
  }
});

test("MindApiError is curated into an actionable message, never a raw JSON dump", async () => {
  const mock = makeMockClient();
  mock.__fail(new MindApiError(422, "status-422", JSON.stringify({ detail: "external_session_id already in use" })));
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "open",
    source_key: "claude-code-1",
    external_session_id: "dup",
  });
  expect(result.isError).toBe(true);
  const text = textOf(result);
  expect(text).toContain("mind_sessions open failed (HTTP 422):");
  expect(text).toContain("external_session_id already in use");
  expect(text).not.toContain('{"detail"');
  await client.close();
});

test("tool description embeds the compact AGENT SESSION PROTOCOL", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "mind_sessions");
  expect(tool).toBeDefined();
  expect(tool.description).toMatch(/CONNECT/);
  expect(tool.description).toContain("action=open");
  expect(tool.description).toContain("action=append");
  expect(tool.description).toContain("action=close");
  expect(tool.description).toContain("pending_replies");
  expect(tool.description).toContain("alias for append of one assistant message");
  await client.close();
});

test("sync-agent-session prompt is advertised and interpolates runtime/source_key", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const { prompts } = await client.listPrompts();
  const prompt = prompts.find((p) => p.name === "sync-agent-session");
  expect(prompt, "sync-agent-session should be listed").toBeTruthy();

  const withArgs = await client.getPrompt({
    name: "sync-agent-session",
    arguments: { runtime: "codex", source_key: "codex-1" },
  });
  const text = withArgs.messages[0].content.text;
  expect(text).toContain('runtime "codex"');
  expect(text).toContain('"codex-1"');
  expect(text).toContain("AGENT SESSION PROTOCOL");
  expect(text).toContain("mind_sessions action=open");

  const noArgs = await client.getPrompt({ name: "sync-agent-session", arguments: {} });
  expect(noArgs.messages[0].content.text).toContain('runtime "your runtime"');
  await client.close();
});

test("SERVER_INSTRUCTIONS carries the AGENT SESSION PROTOCOL block and mind_sessions in the tool map", () => {
  const { SERVER_INSTRUCTIONS } = require("../dist/integration-guide.js");
  expect(SERVER_INSTRUCTIONS).toContain("AGENT SESSION PROTOCOL");
  expect(SERVER_INSTRUCTIONS).toContain("mind_sessions");
  expect(SERVER_INSTRUCTIONS).toMatch(/TOOL MAP — 45 tools/);
});
