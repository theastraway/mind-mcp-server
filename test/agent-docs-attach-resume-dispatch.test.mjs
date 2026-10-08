/**
 * Dispatch-coverage tests for the agent-doc / attachment / resume actions
 * added to the mind_sessions tool (src/server.ts, compiled to
 * dist/server.js) -- "agents with their own files, attached context, and
 * resume-anywhere" (contract, 2026-10-08).
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/agent-docs-attach-resume-dispatch.test.mjs
 *
 * Locks: (a) each new action reaches exactly its mapped MindClient method
 * with the arguments the REST contract expects, (b) required-param guards
 * return isError with the param name and never touch the client, (c) the
 * resume-agent-session MCP prompt makes the live resumeAgent call and hands
 * back resume_prompt verbatim, (d) the tool description + AGENT SESSION
 * PROTOCOL body both mention the new resume/agent-file behavior.
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");
const { MindApiError } = require("../dist/mind-client.js");

const NEW_METHODS = ["getAgentDoc", "updateAgentDoc", "setAgentAttachments", "resumeAgent"];

/** Mock MindClient: records every call; can throw or return canned values. */
function makeMockClient(canned = {}) {
  const calls = [];
  const state = { failure: null };
  const mock = {
    __calls: calls,
    __fail: (err) => (state.failure = err),
  };
  for (const method of NEW_METHODS) {
    mock[method] = async (...args) => {
      calls.push({ method, args });
      if (state.failure) throw state.failure;
      return canned[method] ?? { ok: true };
    };
  }
  return mock;
}

async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "agent-docs-attach-resume-dispatch-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const callSessions = (client, args) => client.callTool({ name: "mind_sessions", arguments: args });

const textOf = (result) => result.content.map((c) => c.text).join("\n");

test("agent_doc_get dispatches to getAgentDoc with agent_key", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "agent_doc_get", agent_key: "Meter" });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls).toEqual([{ method: "getAgentDoc", args: ["Meter"] }]);
  await client.close();
});

test("agent_doc_get requires agent_key", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, { action: "agent_doc_get" });
  expect(result.isError).toBe(true);
  expect(textOf(result)).toContain("agent_key");
  expect(mock.__calls).toHaveLength(0);
  await client.close();
});

test("agent_doc_update dispatches to updateAgentDoc with content/editor/note/base_version", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "agent_doc_update",
    agent_key: "meter",
    content: "# Meter\n\nWatches spend.",
    editor: "agent",
    note: "added a new standing rule",
    base_version: 3,
  });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls).toHaveLength(1);
  expect(mock.__calls[0].method).toBe("updateAgentDoc");
  expect(mock.__calls[0].args[0]).toBe("meter");
  expect(mock.__calls[0].args[1]).toMatchObject({
    content: "# Meter\n\nWatches spend.",
    editor: "agent",
    note: "added a new standing rule",
    base_version: 3,
  });
  await client.close();
});

test("agent_doc_update required-param guards", async () => {
  const cases = [
    { args: {}, mentions: "agent_key" },
    { args: { agent_key: "meter" }, mentions: "content" },
    { args: { agent_key: "meter", content: "x" }, mentions: "editor" },
  ];
  for (const { args, mentions } of cases) {
    const mock = makeMockClient();
    const client = await connect(mock);
    const result = await callSessions(client, { action: "agent_doc_update", ...args });
    expect(result.isError, `missing ${mentions} should error`).toBe(true);
    expect(textOf(result)).toContain(mentions);
    expect(mock.__calls).toHaveLength(0);
    await client.close();
  }
});

test("attach dispatches to setAgentAttachments with the full replacement list", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const attachments = [
    { kind: "project", id: "proj-1" },
    { kind: "repo", id: "theastraway/MINDapp", label: "MINDapp" },
  ];
  const result = await callSessions(client, { action: "attach", agent_key: "meter", attachments });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls).toEqual([{ method: "setAgentAttachments", args: ["meter", attachments] }]);
  await client.close();
});

test("attach required-param guards", async () => {
  const cases = [
    { args: {}, mentions: "agent_key" },
    { args: { agent_key: "meter" }, mentions: "attachments" },
  ];
  for (const { args, mentions } of cases) {
    const mock = makeMockClient();
    const client = await connect(mock);
    const result = await callSessions(client, { action: "attach", ...args });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(mentions);
    expect(mock.__calls).toHaveLength(0);
    await client.close();
  }
});

test("resume dispatches to resumeAgent with agent + optional hints", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "resume",
    agent: "Meter",
    runtime: "claude-code",
    source_key: "claude-code-1",
    external_session_id: "ext-99",
    title: "Picking up spend audit",
  });
  expect(result.isError, textOf(result)).toBeFalsy();
  expect(mock.__calls).toHaveLength(1);
  expect(mock.__calls[0].method).toBe("resumeAgent");
  expect(mock.__calls[0].args[0]).toMatchObject({
    agent: "Meter",
    runtime: "claude-code",
    source_key: "claude-code-1",
    external_session_id: "ext-99",
    title: "Picking up spend audit",
  });
  await client.close();
});

test("resume requires a plain-string agent, not the {key,label} object shape", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);

  const missing = await callSessions(client, { action: "resume" });
  expect(missing.isError).toBe(true);
  expect(textOf(missing)).toContain("agent");
  expect(mock.__calls).toHaveLength(0);

  const wrongShape = await callSessions(client, { action: "resume", agent: { key: "meter" } });
  expect(wrongShape.isError).toBe(true);
  expect(mock.__calls).toHaveLength(0);
  await client.close();
});

test("a 409 conflict surfaces the HTTP status and the current doc the backend sent back", async () => {
  // The real backend's 409 body is {"detail": <current doc>} (see
  // routes/agent_session_routes.py's save_agent_doc_route) -- apiDetail only
  // extracts a clean sentence out of a string or {message} detail, so a
  // structured conflict body (no .message) legitimately falls through to the
  // raw dump here, and that dump IS the useful information (the current
  // version to re-base on).
  const mock = makeMockClient();
  mock.__fail(new MindApiError(409, "status-409", JSON.stringify({ detail: { version: 4, content: "newer" } })));
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "agent_doc_update",
    agent_key: "meter",
    content: "stale edit",
    editor: "user",
    base_version: 1,
  });
  expect(result.isError).toBe(true);
  const text = textOf(result);
  expect(text).toContain("mind_sessions agent_doc_update failed (HTTP 409):");
  expect(text).toContain('"version":4');
  await client.close();
});

test("a 'detail.message' error IS curated into a clean sentence, never the raw wrapper", async () => {
  const mock = makeMockClient();
  mock.__fail(new MindApiError(400, "status-400", JSON.stringify({ detail: "note is required when editor='agent'" })));
  const client = await connect(mock);
  const result = await callSessions(client, {
    action: "agent_doc_update", agent_key: "meter", content: "x", editor: "agent",
  });
  expect(result.isError).toBe(true);
  const text = textOf(result);
  expect(text).toContain("note is required when editor='agent'");
  expect(text).not.toContain('{"detail"');
  await client.close();
});

test("tool description mentions agent_doc_get, agent_doc_update, attach and resume", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "mind_sessions");
  expect(tool).toBeDefined();
  expect(tool.description).toContain("agent_doc_get");
  expect(tool.description).toContain("agent_doc_update");
  expect(tool.description).toContain("attach");
  expect(tool.description).toContain("resume (");
  await client.close();
});

test("AGENT SESSION PROTOCOL body carries the resume/agent-file rule", () => {
  const { AGENT_SESSION_PROTOCOL_BODY } = require("../dist/integration-guide.js");
  expect(AGENT_SESSION_PROTOCOL_BODY).toContain("RESUME ANYWHERE");
  expect(AGENT_SESSION_PROTOCOL_BODY).toContain("action=resume agent=<Agent>");
  expect(AGENT_SESSION_PROTOCOL_BODY).toContain("action=agent_doc_update");
});

test("resume-agent-session prompt is advertised and adopts resume_prompt verbatim", async () => {
  const mock = makeMockClient({
    resumeAgent: {
      session_id: "s-new-1",
      agent_key: "meter",
      agent_doc: { content: "# Meter", version: 2 },
      attachments: [],
      previous_session: null,
      pending_replies: [],
      resume_prompt: "You are Meter. Here is your standing agent file:\n\n# Meter\n",
    },
  });
  const client = await connect(mock);
  const { prompts } = await client.listPrompts();
  const prompt = prompts.find((p) => p.name === "resume-agent-session");
  expect(prompt, "resume-agent-session should be listed").toBeTruthy();

  const result = await client.getPrompt({ name: "resume-agent-session", arguments: { agent: "Meter" } });
  expect(mock.__calls).toEqual([{ method: "resumeAgent", args: [{ agent: "Meter" }] }]);
  const text = result.messages[0].content.text;
  expect(text).toContain("You are Meter. Here is your standing agent file:");
  expect(text).toContain("s-new-1");
  await client.close();
});

test("resume-agent-session prompt requires a non-blank agent without calling the client", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await client.getPrompt({ name: "resume-agent-session", arguments: { agent: "   " } });
  expect(result.messages[0].content.text).toContain("'agent' is required");
  expect(mock.__calls).toHaveLength(0);
  await client.close();
});

test("resume-agent-session prompt curates a MindApiError instead of throwing", async () => {
  const mock = makeMockClient();
  mock.__fail(new MindApiError(404, "status-404", JSON.stringify({ detail: "agent not found" })));
  const client = await connect(mock);
  const result = await client.getPrompt({ name: "resume-agent-session", arguments: { agent: "Nobody" } });
  const text = result.messages[0].content.text;
  expect(text).toContain("Resume failed (HTTP 404):");
  expect(text).toContain("agent not found");
  await client.close();
});
