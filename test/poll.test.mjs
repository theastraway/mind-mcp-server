/**
 * `mind-mcp poll --session <id>` against a fake MIND API.
 *
 * Contract under test (the Monitor tool turns every stdout line into a wake-up):
 *   - one stdout line per owner reply, nothing else on stdout
 *   - /inbox (which marks delivered) is called only when the non-consuming session GET shows an
 *     undelivered owner reply, and exactly once per such reply
 *   - silent when nothing is pending
 *   - the API key never appears in stdout or stderr
 *   - HTTP errors back off and never end the process; a session that keeps 404ing does
 *
 * Run: cd mcp-server && npm run build && npx vitest run test/poll.test.mjs
 */
import { test, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const poll = require("../dist/poll.js");
const CLI = path.resolve(import.meta.dirname, "../dist/cli.js");

const KEY = "mind_test_key_0123456789abcdef0123456789abcdef";
const SID = "sess-123";

let server;
let base;
let state;

function reply(id, content, extra = {}) {
  return {
    message_id: id,
    seq: 1,
    role: "user",
    origin: "mind",
    content,
    created_at: "2026-10-30T14:05:00Z",
    delivered_at: null,
    ...extra,
  };
}

beforeEach(async () => {
  state = {
    messages: [],
    requests: [],
    // statuses to answer the session GET with before behaving normally
    failGets: [],
    sessionStatus: null,
  };
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    state.requests.push({ method: req.method, path: url.pathname, query: url.search, key: req.headers["x-api-key"] });
    const json = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/developer/v1/profile") return json(200, { username: "anthonyjconti" });
    if (url.pathname === `/developer/v1/agent-sessions/${SID}/inbox`) {
      const pending = state.messages.filter((m) => m.origin === "mind" && !m.delivered_at && !m.nonReply);
      for (const m of pending) m.delivered_at = "2026-10-30T14:05:12Z";
      return json(200, { pending_replies: pending.map((m) => ({ ...m })) });
    }
    if (url.pathname === `/developer/v1/agent-sessions/${SID}`) {
      if (state.sessionStatus) return json(state.sessionStatus, { detail: "nope" });
      if (state.failGets.length) return json(state.failGets.shift(), { detail: "boom" });
      return json(200, { session: { session_id: SID }, messages: state.messages.map((m) => ({ ...m })) });
    }
    return json(404, { detail: "Agent session not found" });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
});

/** Run the poll loop until `until()` is true (or 4s), then abort. Returns {out, log, code}. */
async function runUntil(until, extra = {}) {
  const out = [];
  const log = [];
  const ctl = new AbortController();
  const done = poll.runPoll({
    session: SID,
    apiKey: KEY,
    baseUrl: base,
    intervalSec: 0.05,
    out: (l) => out.push(l),
    log: (m) => log.push(m),
    signal: ctl.signal,
    ...extra,
  });
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && !until({ out, log })) await new Promise((r) => setTimeout(r, 20));
  ctl.abort();
  const code = await done;
  return { out, log, code };
}

const inboxCalls = () => state.requests.filter((r) => r.path.endsWith("/inbox")).length;
const sessionGets = () => state.requests.filter((r) => r.path === `/developer/v1/agent-sessions/${SID}`);

test("prints exactly one stdout line per owner reply and calls /inbox once", async () => {
  state.messages = [reply("m1", "ship the fix"), reply("m2", "line one\n\nline   two\tend")];
  const { out } = await runUntil(({ out }) => out.length >= 2);
  // Let a couple more cycles run so a duplicate print would show up.
  await new Promise((r) => setTimeout(r, 250));
  expect(out).toHaveLength(2);
  expect(out[0]).toMatch(/^\[BotsByMIND\] anthonyjconti replied in MIND \(\d\d:\d\d\): ship the fix$/);
  expect(out[1]).toMatch(/\): line one line two end$/);
  for (const l of out) expect(l).not.toContain("\n");
  expect(inboxCalls()).toBe(1);
});

test("the session GET is the non-consuming one: ?limit=30 with the API key header", async () => {
  state.messages = [reply("m1", "hi")];
  await runUntil(({ out }) => out.length >= 1);
  const get = sessionGets()[0];
  expect(get.query).toBe("?limit=30");
  expect(get.key).toBe(KEY);
  expect(get.method).toBe("GET");
});

test("silent when nothing is pending: no stdout, /inbox never called", async () => {
  state.messages = [
    reply("a1", "already delivered", { delivered_at: "2026-10-30T13:00:00Z" }),
    reply("a2", "agent said this", { origin: "agent", role: "assistant" }),
    reply("a3", "owner but assistant role", { role: "assistant" }),
  ];
  const { out } = await runUntil(() => sessionGets().length >= 4);
  expect(out).toEqual([]);
  expect(inboxCalls()).toBe(0);
});

test("a reply that arrives later is printed once, the next cycle", async () => {
  state.messages = [];
  const run = runUntil(({ out }) => out.length >= 1);
  await new Promise((r) => setTimeout(r, 200));
  state.messages.push(reply("late1", "now do the other thing"));
  const { out } = await run;
  expect(out).toHaveLength(1);
  expect(out[0]).toContain("now do the other thing");
  expect(inboxCalls()).toBe(1);
});

test("an undelivered message /inbox does not treat as a reply is asked about only once", async () => {
  state.messages = [reply("odd1", "not a reply", { nonReply: true })];
  const { out } = await runUntil(() => sessionGets().length >= 5);
  expect(out).toEqual([]);
  expect(inboxCalls()).toBe(1);
});

test("the API key never reaches stdout or the log, even when a reply quotes it", async () => {
  state.messages = [reply("k1", `here is the key ${KEY} and api_key=abcd1234 and secret = hunter2`)];
  const { out, log } = await runUntil(({ out }) => out.length >= 1);
  const everything = out.join("\n") + "\n" + log.join("\n");
  expect(everything).not.toContain(KEY);
  expect(everything).not.toContain("abcd1234");
  expect(everything).not.toContain("hunter2");
  expect(out[0]).toContain("[redacted]");
});

test("content is capped at 2000 characters", async () => {
  state.messages = [reply("big1", "x".repeat(5000))];
  const { out } = await runUntil(({ out }) => out.length >= 1);
  const content = out[0].split("): ").slice(1).join("): ");
  expect(content.length).toBe(2000);
  expect(content.endsWith("…")).toBe(true);
});

test("a shared editor reply is attributed to them", async () => {
  state.messages = [reply("e1", "from my editor", { meta: { replied_by: "lance" } })];
  const { out } = await runUntil(({ out }) => out.length >= 1);
  expect(out[0]).toContain("lance (shared Editor) replied in MIND");
});

test("HTTP errors back off, never end the process, and the reply still arrives", async () => {
  state.failGets = [500, 502, 503];
  state.messages = [reply("r1", "after the outage")];
  const { out, log, code } = await runUntil(({ out }) => out.length >= 1);
  expect(out).toHaveLength(1);
  expect(out[0]).toContain("after the outage");
  expect(log.filter((l) => l.startsWith("HTTP 5")).length).toBe(3);
  expect(code).toBe(0);
});

test("a session id that keeps answering 404 ends the poll with exit code 3", async () => {
  state.sessionStatus = 404;
  const out = [];
  const log = [];
  // backoff doubles from 0.001s, so five 404s finish well inside the test timeout
  const code = await poll.runPoll({
    session: SID, apiKey: KEY, baseUrl: base, intervalSec: 0.001, out: (l) => out.push(l), log: (m) => log.push(m),
  });
  expect(code).toBe(3);
  expect(out).toEqual([]);
  expect(log.some((l) => l.includes("not found"))).toBe(true);
});

test("--ppid: exits 0 without polling when that process is already gone", async () => {
  const r = spawnSync(process.execPath, ["-e", "0"]);
  const deadPid = r.pid;
  const code = await poll.runPoll({
    session: SID, apiKey: KEY, baseUrl: base, intervalSec: 0.05, ppid: deadPid, out: () => {}, log: () => {},
  });
  expect(code).toBe(0);
  expect(sessionGets()).toHaveLength(0);
});

test("--ppid: exits 0 once the parent dies mid-run", async () => {
  const parent = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 800)"]);
  const t0 = Date.now();
  const out = [];
  const code = await poll.runPoll({
    session: SID, apiKey: KEY, baseUrl: base, intervalSec: 0.05, ppid: parent.pid, out: (l) => out.push(l), log: () => {},
  });
  expect(code).toBe(0);
  expect(Date.now() - t0).toBeGreaterThan(300);
  expect(Date.now() - t0).toBeLessThan(4000);
});

// ─── argument parsing ───────────────────────────────────────────────

test("parsePollArgs", () => {
  expect(poll.parsePollArgs(["--session", "abc"])).toEqual({ session: "abc" });
  expect(poll.parsePollArgs(["--session=abc", "--interval", "7", "--ppid=42"])).toEqual({ session: "abc", interval: 7, ppid: 42 });
  expect(poll.parsePollArgs([]).error).toMatch(/--session/);
  expect(poll.parsePollArgs(["--session", "a", "--bogus"]).error).toMatch(/unknown option/);
  expect(poll.parsePollArgs(["--session", "a", "--interval", "x"]).error).toMatch(/interval/);
  expect(poll.parsePollArgs(["--help"]).help).toBe(true);
});

// ─── key + base URL resolution ──────────────────────────────────────

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mind-poll-home-"));
}
function write(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
}

test("key: MIND_API_KEY wins, MIND_BASE_URL overrides the default", () => {
  const c = poll.resolveCredentials({ env: { MIND_API_KEY: "mind_envkey", MIND_BASE_URL: "http://x.test/" }, home: tmpHome(), cwd: "/nowhere" });
  expect(c.apiKey).toBe("mind_envkey");
  expect(c.baseUrl).toBe("http://x.test");
  const d = poll.resolveCredentials({ env: { MIND_API_KEY: "mind_envkey" }, home: tmpHome(), cwd: "/nowhere" });
  expect(d.baseUrl).toBe("https://www.m-i-n-d.ai");
});

test("key: ~/.claude.json entry that runs this package, with its MIND_BASE_URL", () => {
  const home = tmpHome();
  write(path.join(home, ".claude.json"), {
    mcpServers: {
      other: { command: "node", args: ["x.js"], env: { MIND_API_KEY: "mind_wrong" } },
      brain: { command: "npx", args: ["-y", "-p", "@astramindapp/mcp-server@0.29.2", "mind-mcp"], env: { MIND_API_KEY: "mind_claude_json", MIND_BASE_URL: "https://mindapp.onrender.com" } },
    },
  });
  const c = poll.resolveCredentials({ env: {}, home, cwd: "/nowhere" });
  expect(c.apiKey).toBe("mind_claude_json");
  expect(c.baseUrl).toBe("https://mindapp.onrender.com");
  expect(c.source).toContain("~/.claude.json");
  expect(c.source).not.toContain("mind_claude_json");
});

test("key: an entry named mind counts; local scope beats ./.mcp.json beats user scope", () => {
  const home = tmpHome();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mind-poll-cwd-"));
  write(path.join(home, ".claude.json"), {
    mcpServers: { mind: { command: "x", env: { MIND_API_KEY: "mind_user_scope" } } },
    projects: { [cwd]: { mcpServers: { mind: { command: "x", env: { MIND_API_KEY: "mind_local_scope" } } } } },
  });
  write(path.join(cwd, ".mcp.json"), { mcpServers: { mind: { command: "x", env: { MIND_API_KEY: "mind_project_scope" } } } });
  expect(poll.resolveCredentials({ env: {}, home, cwd }).apiKey).toBe("mind_local_scope");
  write(path.join(home, ".claude.json"), { mcpServers: { mind: { command: "x", env: { MIND_API_KEY: "mind_user_scope" } } } });
  expect(poll.resolveCredentials({ env: {}, home, cwd }).apiKey).toBe("mind_project_scope");
  fs.rmSync(path.join(cwd, ".mcp.json"));
  expect(poll.resolveCredentials({ env: {}, home, cwd }).apiKey).toBe("mind_user_scope");
});

test("key: falls back to the files mind-mcp-setup writes (Cursor, Windsurf, VS Code)", () => {
  const home = tmpHome();
  write(path.join(home, ".cursor", "mcp.json"), { mcpServers: { mind: { command: "node", args: ["/a/mcp-server/dist/cli.js"], env: { MIND_API_KEY: "mind_cursor" } } } });
  expect(poll.resolveCredentials({ env: {}, home, cwd: "/nowhere" }).apiKey).toBe("mind_cursor");
  fs.rmSync(path.join(home, ".cursor"), { recursive: true });
  write(path.join(home, ".vscode", "mcp.json"), { servers: { mind: { command: "node", args: ["/a/mcp-server/dist/cli.js"], env: { MIND_API_KEY: "mind_vscode" } } } });
  expect(poll.resolveCredentials({ env: {}, home, cwd: "/nowhere" }).apiKey).toBe("mind_vscode");
});

test("key: a hosted http entry carrying an X-API-Key header", () => {
  const home = tmpHome();
  write(path.join(home, ".claude.json"), { mcpServers: { brain: { type: "http", url: "https://www.m-i-n-d.ai/mcp", headers: { "X-API-Key": "mind_hosted_header" } } } });
  expect(poll.resolveCredentials({ env: {}, home, cwd: "/nowhere" }).apiKey).toBe("mind_hosted_header");
});

test("key: nothing found -> undefined, and unrelated MCP servers are ignored", () => {
  const home = tmpHome();
  write(path.join(home, ".claude.json"), { mcpServers: { github: { command: "gh-mcp", env: { MIND_API_KEY: "mind_not_ours" } } } });
  expect(poll.resolveCredentials({ env: {}, home, cwd: "/nowhere" })).toBeUndefined();
});

// ─── the real CLI, as an external client runs it ────────────────────

function cli(args, env, { killAfterLines = 0, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { PATH: process.env.PATH, HOME: tmpHome(), ...env },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d;
      if (killAfterLines && stdout.split("\n").filter(Boolean).length >= killAfterLines) {
        setTimeout(() => child.kill("SIGTERM"), 400); // time for any stray second line
      }
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test("CLI: poll prints only the reply line on stdout, the key stays out of both streams, SIGTERM exits 0", async () => {
  state.messages = [reply("c1", "cli reply\nsecond line")];
  const r = await cli(["poll", "--session", SID], { MIND_API_KEY: KEY, MIND_BASE_URL: base }, { killAfterLines: 1 });
  expect(r.stdout.split("\n").filter(Boolean)).toHaveLength(1);
  expect(r.stdout).toMatch(/^\[BotsByMIND\] anthonyjconti replied in MIND \(\d\d:\d\d\): cli reply second line\n$/);
  expect(r.stdout).not.toContain(KEY);
  expect(r.stderr).not.toContain(KEY);
  expect(r.stderr).toContain("key from MIND_API_KEY environment variable");
  expect(r.code).toBe(0);
  expect(inboxCalls()).toBe(1);
});

test("CLI: no key anywhere -> exit 2, nothing on stdout", async () => {
  const r = await cli(["poll", "--session", SID], {});
  expect(r.code).toBe(2);
  expect(r.stdout).toBe("");
  expect(r.stderr).toMatch(/no MIND API key found/);
});

test("CLI: missing --session -> exit 2, nothing on stdout; poll --help is the poll usage", async () => {
  const bad = await cli(["poll"], { MIND_API_KEY: KEY });
  expect(bad.code).toBe(2);
  expect(bad.stdout).toBe("");
  expect(bad.stderr).toMatch(/--session/);
  const help = await cli(["poll", "--help"], {});
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("mind-mcp poll");
  expect(help.stdout).toContain("--session");
});

test("CLI: the interval floor is 5 seconds", async () => {
  const r = await cli(["poll", "--session", SID, "--interval", "1"], { MIND_API_KEY: KEY, MIND_BASE_URL: base }, { timeoutMs: 3500 });
  expect(r.stderr).toContain("raised to the 5s minimum");
  expect(r.stderr).toContain("every 5s");
});
