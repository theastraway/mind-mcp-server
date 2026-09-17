/**
 * Dispatch-coverage tests for the Secure Folders actions on the mind_folders
 * tool (src/server.ts, compiled to dist/server.js).
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/secure-folders-dispatch.test.mjs
 *
 * Locks: (a) each new action (secure, unsecure, unlock, reset_request,
 * reset) reaches exactly its mapped MindClient method with the right args,
 * (b) required-param guards fire and never touch the client, (c) a
 * successful `unlock` stores the returned token via
 * setSecureFolderUnlockToken so later calls this session ride it along, and
 * (d) `unsecure`/`reset` forget any stored token via
 * clearSecureFolderUnlockToken so a relocked/rotated folder is never read
 * with a stale unlock.
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

const SECURE_FOLDER_METHODS = [
  "secureFolder",
  "unsecureFolder",
  "unlockFolder",
  "requestFolderReset",
  "resetFolder",
  "setSecureFolderUnlockToken",
  "clearSecureFolderUnlockToken",
  "listFolders",
  "createFolder",
  "updateFolder",
  "deleteFolder",
  "moveDocuments",
];

/** Mock MindClient: records every call; can return canned values per method. */
function makeMockClient() {
  const calls = [];
  const state = { results: {} };
  const mock = {
    __calls: calls,
    __result: (method, value) => (state.results[method] = value),
  };
  for (const method of SECURE_FOLDER_METHODS) {
    mock[method] = (...args) => {
      calls.push({ method, args });
      const result = method in state.results ? state.results[method] : { ok: true };
      // setSecureFolderUnlockToken/clearSecureFolderUnlockToken are sync (void) on
      // the real client -- everything else is async.
      if (method === "setSecureFolderUnlockToken" || method === "clearSecureFolderUnlockToken") {
        return undefined;
      }
      return Promise.resolve(result);
    };
  }
  return mock;
}

async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "secure-folders-dispatch-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const callFolders = (client, args) =>
  client.callTool({ name: "mind_folders", arguments: args });

const textOf = (result) => result.content.map((c) => c.text).join("\n");

const DISPATCH = {
  secure: {
    args: { folder_id: "vault", passphrase: "correct horse battery staple" },
    method: "secureFolder",
    result: { status: "secured", folder_id: "vault" },
  },
  unsecure: {
    args: { folder_id: "vault" },
    method: "unsecureFolder",
    result: { status: "unsecured", folder_id: "vault" },
  },
  unlock: {
    args: { folder_id: "vault", passphrase: "correct horse battery staple" },
    method: "unlockFolder",
    result: { unlock_token: "tok-abc", expires_at: "2026-01-01T00:15:00Z", folder_id: "vault" },
  },
  reset_request: {
    args: { folder_id: "vault" },
    method: "requestFolderReset",
    result: { status: "sent", expires_at: "2026-01-01T00:15:00Z" },
  },
  reset: {
    args: { folder_id: "vault", token: "one-time-tok", new_passphrase: "another passphrase" },
    method: "resetFolder",
    result: { status: "reset", folder_id: "vault" },
  },
};

test("every Secure Folders action dispatches to exactly its mapped MindClient method", async () => {
  for (const [action, { args, method, result }] of Object.entries(DISPATCH)) {
    const mock = makeMockClient();
    mock.__result(method, result);
    const client = await connect(mock);
    const res = await callFolders(client, { action, ...args });
    expect(res.isError, `${action} should not error: ${textOf(res)}`).toBeFalsy();
    const primaryCalls = mock.__calls.filter((c) => c.method === method);
    expect(primaryCalls.length, `${action} should call ${method} exactly once`).toBe(1);
    await client.close();
  }
});

test("unlock stores the returned token via setSecureFolderUnlockToken", async () => {
  const mock = makeMockClient();
  mock.__result("unlockFolder", {
    unlock_token: "tok-xyz",
    expires_at: "2026-01-01T00:15:00Z",
    folder_id: "vault",
  });
  const client = await connect(mock);
  const res = await callFolders(client, {
    action: "unlock",
    folder_id: "vault",
    passphrase: "correct horse battery staple",
  });
  expect(res.isError).toBeFalsy();
  const stored = mock.__calls.find((c) => c.method === "setSecureFolderUnlockToken");
  expect(stored, "setSecureFolderUnlockToken should have been called").toBeTruthy();
  expect(stored.args).toEqual(["vault", "tok-xyz"]);
  await client.close();
});

test("unsecure forgets any stored unlock token", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const res = await callFolders(client, { action: "unsecure", folder_id: "vault" });
  expect(res.isError).toBeFalsy();
  const cleared = mock.__calls.find((c) => c.method === "clearSecureFolderUnlockToken");
  expect(cleared, "clearSecureFolderUnlockToken should have been called").toBeTruthy();
  expect(cleared.args).toEqual(["vault"]);
  await client.close();
});

test("reset forgets the (now stale) unlock token for the old passphrase", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const res = await callFolders(client, {
    action: "reset",
    folder_id: "vault",
    token: "one-time-tok",
    new_passphrase: "another passphrase",
  });
  expect(res.isError).toBeFalsy();
  const cleared = mock.__calls.find((c) => c.method === "clearSecureFolderUnlockToken");
  expect(cleared, "clearSecureFolderUnlockToken should have been called").toBeTruthy();
  expect(cleared.args).toEqual(["vault"]);
  await client.close();
});

// action → { args (missing something), mentions (substring expected in the guard error) }
const GUARDS = [
  { action: "secure", args: {}, mentions: "folder_id" },
  { action: "secure", args: { folder_id: "vault" }, mentions: "passphrase" },
  { action: "unsecure", args: {}, mentions: "folder_id" },
  { action: "unlock", args: {}, mentions: "folder_id" },
  { action: "unlock", args: { folder_id: "vault" }, mentions: "passphrase" },
  { action: "reset_request", args: {}, mentions: "folder_id" },
  { action: "reset", args: {}, mentions: "folder_id" },
  { action: "reset", args: { folder_id: "vault" }, mentions: "token" },
  {
    action: "reset",
    args: { folder_id: "vault", token: "t" },
    mentions: "new_passphrase",
  },
];

test("required-param guards fire before the client is ever called", async () => {
  for (const { action, args, mentions } of GUARDS) {
    const mock = makeMockClient();
    const client = await connect(mock);
    const res = await callFolders(client, { action, ...args });
    expect(res.isError, `${action} with ${JSON.stringify(args)} should error`).toBeTruthy();
    expect(textOf(res)).toContain(mentions);
    expect(mock.__calls.length, `${action} guard should never call the client`).toBe(0);
    await client.close();
  }
});
