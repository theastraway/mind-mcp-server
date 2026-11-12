/**
 * MIND reply poller — `mind-mcp poll --session <mind_session_id>`
 *
 * The AGENT SESSION REPLIES hard rule (integration-guide.ts) says an agent must
 * keep receiving its owner's replies for as long as its session is active. Under
 * Claude Code (or any runtime with a monitor / background-task tool) this
 * subcommand is the poll:
 *
 *   Monitor(command="npx -y @astramindapp/mcp-server poll --session <id>",
 *           description="BotsByMIND replies for this session")
 *
 * CONTRACT with the monitor: every line on STDOUT wakes the agent. So stdout carries
 * exactly one thing, a line per owner reply:
 *
 *   [BotsByMIND] <owner> replied in MIND (HH:MM): <content, newlines collapsed, max 2000 chars>
 *
 * Everything else (start-up note, HTTP errors, back-off, warnings) goes to STDERR.
 * The API key is never printed anywhere.
 *
 * Mechanics (modelled on the proven ~/.claude/scripts/mind-reply-poll.py):
 *   - Every `--interval` seconds (default 10, min 5): a NON-consuming
 *     GET /developer/v1/agent-sessions/{id}?limit=30. Only when it shows owner replies
 *     not yet delivered (origin "mind", role "user", no delivered_at) does it call
 *     GET /{id}/inbox, which marks them delivered and is the arbiter of what to print,
 *     so a reply another consumer took a moment earlier is never printed twice.
 *   - HTTP errors back off exponentially to 60s and never end the process. A session
 *     that keeps answering 404 does end it (exit 3): the id is wrong, not transient.
 *   - `--ppid <pid>`: exit 0 when that process is gone.
 *
 * Key resolution: MIND_API_KEY, else the env.MIND_API_KEY of an mcpServers entry that
 * runs this package / mind-mcp (or is named "mind"), found in Claude Code's config,
 * ./.mcp.json, Cursor, Windsurf, VS Code and Claude Desktop — exactly the files
 * `mind-mcp-setup` writes. Base URL: MIND_BASE_URL, else the entry's MIND_BASE_URL,
 * else the same default the MCP client uses.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Same default the stdio MCP server (cli.ts) uses. */
export const DEFAULT_BASE_URL = "https://www.m-i-n-d.ai";
const API_PREFIX = "/developer/v1/agent-sessions";
export const DEFAULT_INTERVAL_SEC = 10;
export const MIN_INTERVAL_SEC = 5;
export const MAX_BACKOFF_SEC = 60;
export const MAX_CONTENT_CHARS = 2000;
const MSG_LIMIT = 30;
const HTTP_TIMEOUT_MS = 15_000;
const MAX_CONSECUTIVE_404 = 5;
const SECRET_RE = /(api[_-]?key|secret|token|password)\s*=\s*\S+/gi;

// ─── key + base URL resolution ───────────────────────────────

export interface ResolvedCredentials {
  apiKey: string;
  baseUrl: string;
  /** Human-readable origin of the key, never the key itself. */
  source: string;
}

interface McpEntry {
  command?: unknown;
  args?: unknown;
  url?: unknown;
  env?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return undefined;
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function entryRunsMind(name: string, entry: McpEntry): boolean {
  if (name.toLowerCase() === "mind") return true;
  const args = Array.isArray(entry.args) ? entry.args.map(String) : [];
  const hay = [String(entry.command ?? ""), ...args].join(" ");
  return /@astramindapp\/mcp-server|(^|[\s/\\])mind-mcp(-setup)?(\s|$)|mcp-server[\\/]dist[\\/]cli\.js|mind-mcp-server/.test(hay);
}

function headerKey(entry: McpEntry): string | undefined {
  const h = entry.headers;
  if (!h) return undefined;
  for (const [k, v] of Object.entries(h)) {
    const s = typeof v === "string" ? v.trim() : "";
    if (k.toLowerCase() === "x-api-key" && s.startsWith("mind_")) return s;
    if (k.toLowerCase() === "authorization" && /^Bearer\s+mind_/.test(s)) return s.replace(/^Bearer\s+/, "");
  }
  return undefined;
}

function keyFromServers(servers: unknown, label: string): ResolvedCredentials | undefined {
  const map = asRecord(servers);
  if (!map) return undefined;
  for (const [name, raw] of Object.entries(map)) {
    const entry = asRecord(raw) as McpEntry | undefined;
    if (!entry) continue;
    const envKey = typeof entry.env?.MIND_API_KEY === "string" ? entry.env.MIND_API_KEY.trim() : "";
    if (envKey && entryRunsMind(name, entry)) {
      const base = typeof entry.env?.MIND_BASE_URL === "string" ? entry.env.MIND_BASE_URL.trim() : "";
      return { apiKey: envKey, baseUrl: base || DEFAULT_BASE_URL, source: `${label} mcpServers.${name}` };
    }
    const hk = headerKey(entry);
    if (hk && /m-i-n-d\.ai|mindapp/i.test(String(entry.url ?? ""))) {
      return { apiKey: hk, baseUrl: DEFAULT_BASE_URL, source: `${label} mcpServers.${name} (hosted headers)` };
    }
  }
  return undefined;
}

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  cwd?: string;
}

/** Find the MIND API key + base URL. Never throws; undefined when nothing is found. */
export function resolveCredentials(opts: ResolveOptions = {}): ResolvedCredentials | undefined {
  const env = opts.env ?? process.env;
  const home = opts.home ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const envBase = (env.MIND_BASE_URL ?? "").trim();

  const finish = (c: ResolvedCredentials): ResolvedCredentials => ({
    ...c,
    // An explicit MIND_BASE_URL in the environment always wins over a config file's.
    baseUrl: (envBase || c.baseUrl).replace(/\/+$/, ""),
  });

  const envKey = (env.MIND_API_KEY ?? "").trim();
  if (envKey) return finish({ apiKey: envKey, baseUrl: DEFAULT_BASE_URL, source: "MIND_API_KEY environment variable" });

  // Claude Code: local scope (projects[cwd]) > project scope (./.mcp.json) > user scope.
  const claudeJson = asRecord(readJson(path.join(home, ".claude.json")));
  const projects = asRecord(claudeJson?.projects);
  const local = keyFromServers(asRecord(projects?.[cwd])?.mcpServers, "~/.claude.json (this project)");
  if (local) return finish(local);

  const projectFile = keyFromServers(asRecord(readJson(path.join(cwd, ".mcp.json")))?.mcpServers, "./.mcp.json");
  if (projectFile) return finish(projectFile);

  const user = keyFromServers(claudeJson?.mcpServers, "~/.claude.json");
  if (user) return finish(user);

  const desktop =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
      : process.platform === "win32"
        ? path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
        : path.join(home, ".config", "Claude", "claude_desktop_config.json");
  // The same four files + Claude Desktop that mind-mcp-setup writes (setup.ts getToolConfigs).
  const setupFiles: Array<[string, string, string]> = [
    [path.join(home, ".cursor", "mcp.json"), "mcpServers", "~/.cursor/mcp.json"],
    [path.join(home, ".windsurf", "mcp.json"), "mcpServers", "~/.windsurf/mcp.json"],
    [path.join(home, ".vscode", "mcp.json"), "servers", "~/.vscode/mcp.json"],
    [desktop, "mcpServers", "Claude Desktop config"],
  ];
  for (const [file, key, label] of setupFiles) {
    const found = keyFromServers(asRecord(readJson(file))?.[key], label);
    if (found) return finish(found);
  }

  // Last: any project in ~/.claude.json that registered MIND (key is per account, not per project).
  for (const [dir, proj] of Object.entries(projects ?? {})) {
    const found = keyFromServers(asRecord(proj)?.mcpServers, `~/.claude.json (${path.basename(dir) || dir})`);
    if (found) return finish(found);
  }
  return undefined;
}

// ─── reply formatting ────────────────────────────────────────

export interface InboxReply {
  message_id?: string;
  content?: unknown;
  created_at?: unknown;
  meta?: { replied_by?: unknown } | null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function hhmm(iso: unknown, now: Date = new Date()): string {
  const d = typeof iso === "string" && iso ? new Date(iso) : now;
  const t = Number.isNaN(d.getTime()) ? now : d;
  return `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}

/** One reply -> one stdout line. Newlines collapsed, secrets redacted, capped. */
export function formatReply(r: InboxReply, ownerLabel: string, apiKey: string, now: Date = new Date()): string {
  const by = r.meta && typeof r.meta.replied_by === "string" ? r.meta.replied_by.trim() : "";
  const who = by ? `${by} (shared Editor)` : ownerLabel;
  let content = String(r.content ?? "");
  if (apiKey) content = content.split(apiKey).join("[redacted]");
  content = content.replace(SECRET_RE, (_m, k: string) => `${k}=[redacted]`).split(/\s+/).filter(Boolean).join(" ");
  if (!content) content = "(empty message)";
  if (content.length > MAX_CONTENT_CHARS) content = content.slice(0, MAX_CONTENT_CHARS - 1) + "…";
  return `[BotsByMIND] ${who} replied in MIND (${hhmm(r.created_at, now)}): ${content}`;
}

// ─── the poll loop ───────────────────────────────────────────

export interface PollOptions {
  session: string;
  apiKey: string;
  baseUrl: string;
  intervalSec: number;
  /** Exit 0 when this process is gone. */
  ppid?: number;
  /** One line per reply. The ONLY stdout channel. */
  out: (line: string) => void;
  /** Diagnostics. Goes to stderr. Never receives the key. */
  log: (msg: string) => void;
  signal?: AbortSignal;
  /** Bot workspace header, mirrors MindClient's MIND_BOT. */
  bot?: string;
}

class HttpError extends Error {
  constructor(public status: number, public label: string) {
    super(`HTTP ${status} ${label}`);
  }
}

function pidGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ESRCH";
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Runs until aborted, until `ppid` is gone, or until the session id proves bad.
 * Resolves with the process exit code.
 */
export async function runPoll(opts: PollOptions): Promise<number> {
  const { session, apiKey, baseUrl, out, log, signal } = opts;
  // The 5s floor is enforced where the interval is parsed (pollMain); tests pass fractions.
  const interval = opts.intervalSec > 0 ? opts.intervalSec : DEFAULT_INTERVAL_SEC;
  const sid = encodeURIComponent(session);
  const seenEmpty = new Set<string>();
  const printed = new Set<string>();
  let ownerLabel: string | undefined;
  let fails = 0;
  let notFound = 0;

  async function get(pathAndQuery: string): Promise<any> {
    const headers: Record<string, string> = { "X-API-Key": apiKey, Accept: "application/json" };
    if (opts.bot) headers["X-MIND-Bot"] = opts.bot;
    const label = pathAndQuery.split("?")[0].replace(sid, ":session");
    const res = await fetch(`${baseUrl}${pathAndQuery}`, {
      headers,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      throw new HttpError(res.status, `GET ${label}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async function owner(): Promise<string> {
    if (ownerLabel) return ownerLabel;
    try {
      const p = await get("/developer/v1/profile");
      ownerLabel = typeof p?.username === "string" && p.username ? p.username : "Your owner";
    } catch {
      return "Your owner"; // best effort; retried at the next reply
    }
    return ownerLabel as string;
  }

  /** True when the cycle finished, throws on HTTP failure. */
  async function cycle(): Promise<void> {
    const data = await get(`${API_PREFIX}/${sid}?limit=${MSG_LIMIT}`);
    const candidates = ((data?.messages as any[]) || []).filter(
      (m) => m && m.origin === "mind" && m.role === "user" && !m.delivered_at && !seenEmpty.has(m.message_id)
    );
    if (!candidates.length) return;
    const inbox = await get(`${API_PREFIX}/${sid}/inbox`);
    const replies: InboxReply[] = (inbox?.pending_replies as InboxReply[]) || [];
    if (!replies.length) {
      // Visible as undelivered but /inbox does not treat it as a reply: stop asking about it.
      for (const m of candidates) seenEmpty.add(m.message_id);
      if (seenEmpty.size > 500) seenEmpty.clear();
      return;
    }
    const label = await owner();
    for (const r of replies) {
      if (r.message_id && printed.has(r.message_id)) continue;
      out(formatReply(r, label, apiKey));
      if (r.message_id) printed.add(r.message_id);
    }
    if (printed.size > 500) printed.clear();
  }

  log(`polling session ${session} every ${interval}s at ${baseUrl}`);
  for (;;) {
    if (signal?.aborted) return 0;
    if (opts.ppid && pidGone(opts.ppid)) {
      log(`parent process ${opts.ppid} is gone; exiting`);
      return 0;
    }
    let delay = interval;
    try {
      await cycle();
      fails = 0;
      notFound = 0;
    } catch (e) {
      if (signal?.aborted) return 0;
      fails += 1;
      if (e instanceof HttpError) {
        log(`${e.message} (retry ${fails})`);
        if (e.status === 404 && ++notFound >= MAX_CONSECUTIVE_404) {
          log(`session ${session} was not found ${MAX_CONSECUTIVE_404} times in a row; check the session id. exiting`);
          return 3;
        }
        if (e.status !== 404) notFound = 0;
      } else {
        notFound = 0;
        log(`poll error: ${(e as Error).name}: ${(e as Error).message} (retry ${fails})`);
      }
      delay = Math.min(MAX_BACKOFF_SEC, interval * 2 ** Math.min(fails, 6));
    }
    // Sleep in 1s slices so a vanished --ppid or an abort ends the wait early.
    const end = Date.now() + delay * 1000;
    while (Date.now() < end) {
      if (signal?.aborted) return 0;
      if (opts.ppid && pidGone(opts.ppid)) {
        log(`parent process ${opts.ppid} is gone; exiting`);
        return 0;
      }
      await sleep(Math.min(1000, end - Date.now()), signal);
    }
  }
}

// ─── CLI entry ───────────────────────────────────────────────

export function pollUsage(): string {
  return `mind-mcp poll — print each owner reply of a MIND agent session as one stdout line

Usage:
  npx -y @astramindapp/mcp-server poll --session <mind_session_id>
  mind-mcp poll --session <mind_session_id> [--interval <seconds>] [--ppid <pid>]

Options:
  --session <id>     The session_id mind_sessions action=open returned. Required.
  --interval <sec>   Seconds between checks. Default ${DEFAULT_INTERVAL_SEC}, minimum ${MIN_INTERVAL_SEC}.
  --ppid <pid>       Exit when this process is gone.

Run it under Claude Code's Monitor tool (description "BotsByMIND replies for this
session"); each stdout line is one reply from your owner and wakes the agent.
Monitor runs cap at 30 minutes, so re-arm it when it expires.

Key: MIND_API_KEY, else the MIND entry in your MCP config (written by mind-mcp-setup).
Base URL: MIND_BASE_URL, default ${DEFAULT_BASE_URL}. Logs go to stderr only.`;
}

export interface ParsedPollArgs {
  session?: string;
  interval?: number;
  ppid?: number;
  help?: boolean;
  error?: string;
}

export function parsePollArgs(argv: string[]): ParsedPollArgs {
  const out: ParsedPollArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (raw === "--help" || raw === "-h") {
      out.help = true;
      continue;
    }
    const eq = raw.indexOf("=");
    const flag = eq > 0 ? raw.slice(0, eq) : raw;
    const take = (): string | undefined => (eq > 0 ? raw.slice(eq + 1) : argv[++i]);
    if (flag === "--session") out.session = take();
    else if (flag === "--interval") {
      const v = Number(take());
      if (!Number.isFinite(v) || v <= 0) out.error = "--interval must be a number of seconds";
      else out.interval = v;
    } else if (flag === "--ppid") {
      const v = Number(take());
      if (!Number.isInteger(v) || v <= 0) out.error = "--ppid must be a process id";
      else out.ppid = v;
    } else out.error = `unknown option: ${raw}`;
  }
  if (!out.help && !out.error && !out.session) out.error = "--session <mind_session_id> is required";
  return out;
}

/** `mind-mcp poll ...` — argv excludes the word "poll". Resolves to the exit code. */
export async function pollMain(argv: string[]): Promise<number> {
  const args = parsePollArgs(argv);
  const stderr = (m: string) => process.stderr.write(`mind-mcp poll: ${m}\n`);
  if (args.help) {
    process.stdout.write(pollUsage() + "\n");
    return 0;
  }
  if (args.error) {
    stderr(args.error + "\n" + pollUsage());
    return 2;
  }
  const creds = resolveCredentials();
  if (!creds) {
    stderr(
      "no MIND API key found. Set MIND_API_KEY, or run `npx -y --package=@astramindapp/mcp-server mind-mcp-setup --key <mind_...>` so your MCP config holds it."
    );
    return 2;
  }
  let interval = args.interval ?? DEFAULT_INTERVAL_SEC;
  if (interval < MIN_INTERVAL_SEC) {
    stderr(`--interval raised to the ${MIN_INTERVAL_SEC}s minimum`);
    interval = MIN_INTERVAL_SEC;
  }
  stderr(`key from ${creds.source}`);

  const ctl = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => ctl.abort());
  // The monitor reader going away closes stdout; nothing is left to wake.
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EPIPE") ctl.abort();
  });

  return runPoll({
    session: args.session as string,
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl,
    intervalSec: interval,
    ppid: args.ppid,
    bot: (process.env.MIND_BOT || "").trim() || undefined,
    out: (line) => {
      process.stdout.write(line + "\n");
    },
    log: stderr,
    signal: ctl.signal,
  });
}
