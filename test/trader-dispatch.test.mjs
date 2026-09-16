/**
 * Dispatch-coverage tests for the mind_trader tool (src/server.ts, compiled
 * to dist/server.js).
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/trader-dispatch.test.mjs
 *
 * Locks the 25-action matrix three ways:
 *   (a) every action reaches exactly its mapped MindClient method,
 *   (b) every required-param guard returns isError with the param name and
 *       never touches the client,
 *   (c) synthetic MindApiError(404/422/429/...) responses produce the curated,
 *       actionable error strings — never a raw JSON body dump.
 * Plus the limit-clamp table and the unsave no-op hint.
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// dist is CommonJS — load it through Node's require cache so the MindApiError
// class the test throws is the SAME class instance server.js checks with
// instanceof (vitest's ESM transform would otherwise dual-load the module).
const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");
const { MindApiError } = require("../dist/mind-client.js");

const TRADER_METHODS = [
  "traderFeed",
  "traderForecastLatest",
  "traderForecasts",
  "traderBarScores",
  "traderCandles",
  "traderCycles",
  "traderHealth",
  "traderCalibration",
  "traderAiJournal",
  "traderInteract",
  "traderUninteract",
  "traderInteractions",
  "traderCounts",
  "traderNote",
  "traderNotes",
  "traderJournalList",
  "traderJournalCreate",
  "traderJournalGet",
  "traderJournalUpdate",
  "traderJournalDelete",
  "traderSaved",
  "traderInsights",
];

/** Mock MindClient: records every trader call; can throw or return canned values. */
function makeMockClient() {
  const calls = [];
  const state = { failure: null, results: {} };
  const mock = {
    __calls: calls,
    __fail: (err) => (state.failure = err),
    __result: (method, value) => (state.results[method] = value),
  };
  for (const method of TRADER_METHODS) {
    mock[method] = async (...args) => {
      calls.push({ method, args });
      if (state.failure) throw state.failure;
      return method in state.results ? state.results[method] : { ok: true };
    };
  }
  return mock;
}

/** Wire the real MCP server to a real MCP client over an in-memory pipe. */
async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "trader-dispatch-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const callTrader = (client, args) =>
  client.callTool({ name: "mind_trader", arguments: args });

const textOf = (result) => result.content.map((c) => c.text).join("\n");

// action → { args (minimal valid), method (mapped MindClient method) }
const DISPATCH = {
  feed: { args: {}, method: "traderFeed" },
  forecast_latest: { args: { symbol: "es" }, method: "traderForecastLatest" },
  forecasts: { args: {}, method: "traderForecasts" },
  bar_scores: { args: { forecast_id: 1 }, method: "traderBarScores" },
  candles: { args: { symbol: "ES" }, method: "traderCandles" },
  cycles: { args: {}, method: "traderCycles" },
  health: { args: {}, method: "traderHealth" },
  calibration: { args: {}, method: "traderCalibration" },
  ai_journal: { args: {}, method: "traderAiJournal" },
  save: { args: { object_type: "forecast", object_id: "f1" }, method: "traderInteract" },
  star: { args: { object_type: "idea", object_id: "i1" }, method: "traderInteract" },
  like: { args: { object_type: "journal_ai", object_id: "j1" }, method: "traderInteract" },
  unsave: {
    args: { object_type: "forecast", object_id: "f1", undo_action: "save" },
    method: "traderUninteract",
  },
  note: {
    args: { object_type: "forecast", object_id: "f1", text: "watching this" },
    method: "traderNote",
  },
  feedback: {
    args: { object_type: "forecast", object_id: "f1", text: "agree", tag: "agree" },
    method: "traderNote",
  },
  notes: { args: {}, method: "traderNotes" },
  interactions: { args: { object_ids: ["f1"] }, method: "traderInteractions" },
  counts: { args: { object_ids: ["f1"] }, method: "traderCounts" },
  journal_list: { args: {}, method: "traderJournalList" },
  journal_create: { args: { title: "Plan" }, method: "traderJournalCreate" },
  journal_get: { args: { entry_id: "e1" }, method: "traderJournalGet" },
  journal_update: { args: { entry_id: "e1", title: "Plan v2" }, method: "traderJournalUpdate" },
  journal_delete: { args: { entry_id: "e1" }, method: "traderJournalDelete" },
  saved: { args: {}, method: "traderSaved" },
  insights: { args: {}, method: "traderInsights" },
};

test("every action dispatches to exactly its mapped MindClient method", async () => {
  for (const [action, { args, method }] of Object.entries(DISPATCH)) {
    const mock = makeMockClient();
    if (action === "unsave") mock.__result("traderUninteract", { ok: true, deleted: true });
    const client = await connect(mock);
    const result = await callTrader(client, { action, ...args });
    expect(result.isError, `${action} should not error: ${textOf(result)}`).toBeFalsy();
    expect(mock.__calls.length, `${action} should make exactly one client call`).toBe(1);
    expect(mock.__calls[0].method, `${action} should call ${method}`).toBe(method);
    await client.close();
  }
});

// action → { args (missing something), mentions (param name in the guard message) }
const GUARDS = [
  { action: "forecast_latest", args: {}, mentions: "symbol" },
  { action: "candles", args: {}, mentions: "symbol" },
  { action: "bar_scores", args: {}, mentions: "forecast_id" },
  { action: "save", args: { object_id: "f1" }, mentions: "object_type" },
  { action: "star", args: { object_type: "forecast" }, mentions: "object_id" },
  { action: "like", args: {}, mentions: "object_type" },
  {
    action: "unsave",
    args: { object_type: "forecast", object_id: "f1" },
    mentions: "undo_action",
  },
  { action: "note", args: { object_type: "forecast", object_id: "f1" }, mentions: "text" },
  { action: "feedback", args: { object_type: "forecast", object_id: "f1" }, mentions: "text" },
  { action: "interactions", args: {}, mentions: "object_ids" },
  { action: "counts", args: {}, mentions: "object_ids" },
  { action: "journal_create", args: {}, mentions: "title" },
  { action: "journal_get", args: {}, mentions: "entry_id" },
  { action: "journal_update", args: {}, mentions: "entry_id" },
  { action: "journal_update", args: { entry_id: "e1" }, mentions: "at least one" },
  { action: "journal_delete", args: {}, mentions: "entry_id" },
];

test("required-param guards return isError with the param name and never hit the client", async () => {
  for (const { action, args, mentions } of GUARDS) {
    const mock = makeMockClient();
    const client = await connect(mock);
    const result = await callTrader(client, { action, ...args });
    expect(result.isError, `${action} without ${mentions} should be an error`).toBe(true);
    expect(textOf(result)).toContain(mentions);
    expect(mock.__calls.length, `${action} guard should block the client call`).toBe(0);
    await client.close();
  }
});

test("limit is clamped to each action's backend cap before the wire", async () => {
  // [action, extra args, requested limit, expected limit sent, arg index or key]
  const cases = [
    { action: "feed", args: {}, requested: 2000, expected: 200, pick: (a) => a[0].limit },
    { action: "forecasts", args: {}, requested: 2000, expected: 500, pick: (a) => a[1] },
    { action: "candles", args: { symbol: "ES" }, requested: 2000, expected: 2000, pick: (a) => a[2] },
    { action: "cycles", args: {}, requested: 999, expected: 200, pick: (a) => a[0] },
    { action: "ai_journal", args: {}, requested: 500, expected: 200, pick: (a) => a[1] },
    { action: "notes", args: {}, requested: 1000, expected: 500, pick: (a) => a[0].limit },
    { action: "journal_list", args: {}, requested: 500, expected: 200, pick: (a) => a[0] },
    { action: "saved", args: {}, requested: 501, expected: 500, pick: (a) => a[0].limit },
  ];
  for (const { action, args, requested, expected, pick } of cases) {
    const mock = makeMockClient();
    const client = await connect(mock);
    const result = await callTrader(client, { action, ...args, limit: requested });
    expect(result.isError, `${action} limit clamp should not error`).toBeFalsy();
    expect(pick(mock.__calls[0].args), `${action}: limit ${requested} → ${expected}`).toBe(expected);
    await client.close();
  }
});

test("small limits pass through unclamped", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  await callTrader(client, { action: "feed", limit: 25 });
  expect(mock.__calls[0].args[0].limit).toBe(25);
  await client.close();
});

const apiError = (status, body) =>
  new MindApiError(status, `status-${status}`, JSON.stringify(body));

test("404 curation: forecast_latest, journal_*, bar_scores get next-step guidance", async () => {
  const cases = [
    {
      action: "forecast_latest",
      args: { symbol: "zzz" },
      expects: ["No forecast yet for ZZZ", "action=feed"],
    },
    {
      action: "journal_get",
      args: { entry_id: "e1" },
      expects: ["No journal entry with entry_id 'e1'", "action=journal_list"],
    },
    {
      action: "journal_update",
      args: { entry_id: "e1", title: "x" },
      expects: ["No journal entry with entry_id 'e1'", "action=journal_list"],
    },
    {
      action: "journal_delete",
      args: { entry_id: "e1" },
      expects: ["No journal entry with entry_id 'e1'", "action=journal_list"],
    },
    {
      action: "bar_scores",
      args: { forecast_id: 42 },
      expects: ["No bar scores for forecast_id 42", "action=forecasts"],
    },
  ];
  for (const { action, args, expects } of cases) {
    const mock = makeMockClient();
    mock.__fail(apiError(404, { detail: "Not Found" }));
    const client = await connect(mock);
    const result = await callTrader(client, { action, ...args });
    expect(result.isError, `${action} 404 should be an error result`).toBe(true);
    const text = textOf(result);
    for (const needle of expects) expect(text).toContain(needle);
    await client.close();
  }
});

test("429 curation: surfaces the backend detail plus concrete write ceilings", async () => {
  const mock = makeMockClient();
  mock.__fail(apiError(429, { detail: "Rate limit exceeded: max 300 interactions per hour." }));
  const client = await connect(mock);
  const result = await callTrader(client, {
    action: "save",
    object_type: "forecast",
    object_id: "f1",
  });
  expect(result.isError).toBe(true);
  const text = textOf(result);
  expect(text).toContain("Rate limit exceeded: max 300 interactions per hour.");
  expect(text).toContain("300 save/star/like per hour");
  expect(text).toContain("60 notes/feedback per hour");
  expect(text).not.toContain('{"detail"');
  await client.close();
});

test("generic 4xx curation: string detail is extracted, raw JSON body never dumped", async () => {
  const mock = makeMockClient();
  mock.__fail(apiError(422, { detail: "symbol must be 1-12 characters of A-Z, 0-9, '.' or '-'" }));
  const client = await connect(mock);
  const result = await callTrader(client, { action: "forecasts", symbol: "ES" });
  expect(result.isError).toBe(true);
  const text = textOf(result);
  expect(text).toContain("mind_trader forecasts failed (HTTP 422):");
  expect(text).toContain("symbol must be 1-12 characters");
  expect(text).not.toContain('{"detail"');
  await client.close();
});

test("generic 4xx curation: dict detail extracts .message", async () => {
  const mock = makeMockClient();
  mock.__fail(apiError(409, { detail: { error: "conflict", message: "already exists" } }));
  const client = await connect(mock);
  const result = await callTrader(client, { action: "journal_create", title: "Plan" });
  expect(result.isError).toBe(true);
  const text = textOf(result);
  expect(text).toContain("mind_trader journal_create failed (HTTP 409):");
  expect(text).toContain("already exists");
  await client.close();
});

test("auth and engine-down errors keep their curated messages", async () => {
  const authMock = makeMockClient();
  authMock.__fail(apiError(401, { detail: "Invalid API key" }));
  const authClient = await connect(authMock);
  const authResult = await callTrader(authClient, { action: "insights" });
  expect(authResult.isError).toBe(true);
  expect(textOf(authResult)).toContain("the MIND API key was rejected");
  await authClient.close();

  const downMock = makeMockClient();
  downMock.__fail(apiError(503, { detail: "engine offline" }));
  const downClient = await connect(downMock);
  const downResult = await callTrader(downClient, { action: "cycles" });
  expect(downResult.isError).toBe(true);
  expect(textOf(downResult)).toContain("action=health");
  await downClient.close();
});

test("unsave no-op (deleted: false) returns an actionable hint", async () => {
  const mock = makeMockClient();
  mock.__result("traderUninteract", { ok: true, deleted: false });
  const client = await connect(mock);
  const result = await callTrader(client, {
    action: "unsave",
    object_type: "forecast",
    object_id: "f1",
    undo_action: "star",
  });
  expect(result.isError).toBeFalsy();
  const text = textOf(result);
  expect(text).toContain("Nothing was deleted");
  expect(text).toContain("star");
  expect(text).toContain("action=interactions");
  await client.close();
});

test("malformed symbol is rejected by the schema before any client call", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const result = await callTrader(client, { action: "forecast_latest", symbol: "e s!" });
  expect(result.isError, "invalid symbol should be a schema error").toBe(true);
  expect(mock.__calls.length, "schema rejection must not reach the client").toBe(0);
  await client.close();
});

test("page is wired through for notes and saved", async () => {
  const notesMock = makeMockClient();
  const notesClient = await connect(notesMock);
  await callTrader(notesClient, { action: "notes", page: 3 });
  expect(notesMock.__calls[0].method).toBe("traderNotes");
  expect(notesMock.__calls[0].args[0].page).toBe(3);
  await notesClient.close();

  const savedMock = makeMockClient();
  const savedClient = await connect(savedMock);
  await callTrader(savedClient, { action: "saved", page: 2 });
  expect(savedMock.__calls[0].method).toBe("traderSaved");
  expect(savedMock.__calls[0].args[0].page).toBe(2);
  await savedClient.close();
});

test("429 guidance is honest: counts IS rate-limited, other reads are not", async () => {
  const mock = makeMockClient();
  mock.__fail(apiError(429, { detail: "Rate limit exceeded: max 60 counts requests per minute." }));
  const client = await connect(mock);
  const result = await callTrader(client, { action: "counts", object_ids: ["f1"] });
  expect(result.isError).toBe(true);
  const text = textOf(result);
  expect(text).not.toContain("reads are not rate-limited");
  expect(text).toContain("60/min");
  await client.close();
});

test("tool description states the true auth split (engine reads are public)", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const { tools } = await client.listTools();
  const trader = tools.find((t) => t.name === "mind_trader");
  expect(trader).toBeDefined();
  expect(trader.description).toContain("engine reads");
  expect(trader.description).toContain("are public");
  expect(trader.description).toContain("authenticate as the key's owner");
  await client.close();
});

test("unsave real deletion passes through without a hint", async () => {
  const mock = makeMockClient();
  mock.__result("traderUninteract", { ok: true, deleted: true });
  const client = await connect(mock);
  const result = await callTrader(client, {
    action: "unsave",
    object_type: "forecast",
    object_id: "f1",
    undo_action: "save",
  });
  expect(result.isError).toBeFalsy();
  expect(textOf(result)).not.toContain("Nothing was deleted");
  await client.close();
});
