#!/usr/bin/env node
/**
 * Version-sync guard — runs before `tsc` on every build.
 *
 * WHY THIS EXISTS: the MCP server version is declared in several places, and
 * the AGENT-FACING version (the `serverInfo.version` reported in the MCP
 * `initialize` handshake) drifted to 0.17.0 while package.json advanced to
 * 0.22.0. Every publish bumped package.json but not the string agents actually
 * see, so connecting agents were told the server was "v0.17.0" for months.
 *
 * This guard makes package.json the single source of truth and FAILS the build
 * if any of the agent-facing version strings disagree. It can never drift again
 * silently: a mismatched publish now errors instead of shipping.
 *
 * Checked (all must equal package.json "version"):
 *   - mcp-server/server.json          → "version" and packages[0].version (MCP registry manifest)
 *   - mcp-server/src/server.ts        → the McpServer({ name: "mind", version: "…" }) handshake string
 *   - mcp-server/package-lock.json    → root "version" and packages[""].version — a mismatch here
 *                                       makes `npm ci` fail in CI with EUSAGE
 *   - backend/data/mcp_tools.json     → serverInfo.version (the REMOTE hosted /mcp handshake) — soft-checked; only if present
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const read = (p) => readFileSync(p, "utf8");
const fail = (msg) => {
  console.error(`\n✗ version-sync: ${msg}\n`);
  process.exit(1);
};

const pkg = JSON.parse(read(resolve(root, "package.json")));
const expected = pkg.version;
if (!expected) fail("package.json has no version");

const errors = [];

// server.json (MCP registry manifest)
try {
  const sj = JSON.parse(read(resolve(root, "server.json")));
  if (sj.version !== expected) errors.push(`server.json version=${sj.version} (expected ${expected})`);
  const pkgVer = sj.packages?.[0]?.version;
  if (pkgVer !== expected) errors.push(`server.json packages[0].version=${pkgVer} (expected ${expected})`);
} catch (e) {
  errors.push(`could not read server.json: ${e.message}`);
}

// src/server.ts — the serverInfo.version reported to every connecting agent
try {
  const ts = read(resolve(root, "src/server.ts"));
  const m = ts.match(/name:\s*"mind",\s*version:\s*"([^"]+)"/);
  if (!m) errors.push(`could not find McpServer version string in src/server.ts`);
  else if (m[1] !== expected) errors.push(`src/server.ts serverInfo.version=${m[1]} (expected ${expected})`);
} catch (e) {
  errors.push(`could not read src/server.ts: ${e.message}`);
}

// package-lock.json — npm records the root package version in two places, and
// `npm ci` refuses to install when they disagree with package.json.
try {
  const lock = JSON.parse(read(resolve(root, "package-lock.json")));
  if (lock.version !== expected) errors.push(`package-lock.json version=${lock.version} (expected ${expected})`);
  const rootPkg = lock.packages?.[""]?.version;
  if (rootPkg !== expected) errors.push(`package-lock.json packages[""].version=${rootPkg} (expected ${expected})`);
} catch (e) {
  errors.push(`could not read package-lock.json: ${e.message}`);
}

// backend/data/mcp_tools.json — the REMOTE hosted /mcp handshake version (soft: only if repo layout present)
try {
  const catalogPath = resolve(root, "..", "backend", "data", "mcp_tools.json");
  const catalog = JSON.parse(read(catalogPath));
  const remoteVer = catalog.serverInfo?.version;
  if (remoteVer !== expected) {
    errors.push(`backend/data/mcp_tools.json serverInfo.version=${remoteVer} (expected ${expected}) — the REMOTE /mcp handshake will report the wrong version`);
  }
} catch {
  // backend not present in this checkout (e.g. isolated npm publish context) — skip silently
}

if (errors.length) {
  fail(`version drift detected (package.json = ${expected}):\n  - ${errors.join("\n  - ")}`);
}
console.log(`✓ version-sync: all agent-facing versions match package.json (${expected})`);
