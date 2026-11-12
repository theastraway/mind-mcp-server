/**
 * Dispatch-coverage tests for the Repo Folders actions on the mind_folders
 * tool (link_repo, pull_repo, push_repo, repo_status).
 *
 * Run: cd mcp-server && npm run build && npx vitest run test/repo-folders-dispatch.test.mjs
 */
import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const require = createRequire(import.meta.url);
const { createMindMcpServer } = require("../dist/server.js");

const METHODS = ["linkRepoFolder", "pullRepoFolder", "pushRepoFolder", "repoFolderStatus"];

function makeMockClient() {
  const calls = [];
  const mock = { __calls: calls };
  for (const m of METHODS) {
    mock[m] = (...args) => {
      calls.push({ method: m, args });
      return Promise.resolve({ ok: true, via: m });
    };
  }
  return mock;
}

async function connect(mock) {
  const server = createMindMcpServer(mock);
  const client = new Client({ name: "repo-folders-dispatch-test", version: "0.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}

const call = (client, args) => client.callTool({ name: "mind_folders", arguments: args });

test("link_repo reaches linkRepoFolder with owner, name, branch", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const res = await call(client, { action: "link_repo", folder_id: "f1", owner: "theastraway", name: "demo", branch: "main" });
  expect(res.isError).toBeFalsy();
  expect(mock.__calls).toEqual([{ method: "linkRepoFolder", args: ["f1", "theastraway", "demo", "main"] }]);
  await client.close();
});

test("link_repo without owner/name errors and never touches the client", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const res = await call(client, { action: "link_repo", folder_id: "f1", owner: "theastraway" });
  expect(res.isError).toBe(true);
  expect(mock.__calls.length).toBe(0);
  await client.close();
});

test("pull_repo starts a job, or polls one when job_id is passed", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  await call(client, { action: "pull_repo", folder_id: "f1" });
  await call(client, { action: "pull_repo", folder_id: "f1", job_id: "j9" });
  expect(mock.__calls).toEqual([
    { method: "pullRepoFolder", args: ["f1", undefined] },
    { method: "pullRepoFolder", args: ["f1", "j9"] },
  ]);
  await client.close();
});

test("push_repo needs a message and forwards paths", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const bad = await call(client, { action: "push_repo", folder_id: "f1" });
  expect(bad.isError).toBe(true);
  expect(mock.__calls.length).toBe(0);
  const ok = await call(client, { action: "push_repo", folder_id: "f1", message: "sync", paths: ["a.md"] });
  expect(ok.isError).toBeFalsy();
  expect(mock.__calls).toEqual([{ method: "pushRepoFolder", args: ["f1", "sync", ["a.md"]] }]);
  await client.close();
});

test("repo_status reaches repoFolderStatus", async () => {
  const mock = makeMockClient();
  const client = await connect(mock);
  const res = await call(client, { action: "repo_status", folder_id: "f1" });
  expect(res.isError).toBeFalsy();
  expect(mock.__calls).toEqual([{ method: "repoFolderStatus", args: ["f1"] }]);
  await client.close();
});
