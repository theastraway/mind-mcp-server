#!/usr/bin/env node
/**
 * Refresh the embedded MIND Agent Standard from github.com/theastraway/agents.
 *
 *   node scripts/sync-agent-standard.mjs [--ref main] [--check]
 *
 * Rewrites AGENT_STANDARD_MD in src/integration-guide.ts verbatim from
 * upstream AGENTS.md, and rewrites the provenance comment above it (commit,
 * version, bytes, lines, sha256) from the bytes actually written — so the
 * comment can never describe a copy that is not there.
 *
 * With --check it writes nothing and exits 1 on drift (used by CI).
 *
 * After a real sync, run `npm run build && npm run export-catalog` and commit
 * backend/data/mcp_tools.json — the hosted /mcp route serves the generated
 * catalog, not this TypeScript, and keeps serving the old copy without it.
 */
import { writeFileSync } from "node:fs";
import {
  GUIDE_PATH, OPEN, escapeForTemplate, fetchUpstream, readEmbed, readProvenance, sha256,
} from "./agent-standard-lib.mjs";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const ref = (args.includes("--ref") ? args[args.indexOf("--ref") + 1] : "main") || "main";

const upstream = await fetchUpstream(ref);
const embed = readEmbed();
const prov = readProvenance(embed.source);

const upstreamSha = sha256(upstream.raw);
const embedSha = sha256(embed.raw);

// The provenance comment must describe the bytes that are actually embedded.
if (embedSha !== prov.sha256) {
  console.error(`✗ agent-standard: the embed does not match its own provenance comment.`);
  console.error(`    embedded sha256 = ${embedSha}`);
  console.error(`    comment  sha256 = ${prov.sha256}`);
  console.error(`  Someone edited AGENT_STANDARD_MD by hand. Re-run this script without --check to repair it.`);
  if (checkOnly) process.exit(1);
}

if (upstreamSha === embedSha) {
  console.log(`✓ agent-standard: embed is current with theastraway/agents@${ref} (${prov.version ?? "?"}, ${Buffer.byteLength(upstream.raw, "utf8")} bytes, ${upstreamSha.slice(0, 12)}…)`);
  process.exit(0);
}

const version = (upstream.raw.match(/^\*\*Version:\*\*\s*(v[\d.]+)/m) || [])[1] ?? "unknown";
const lines = upstream.raw.split("\n").length - 1;
const bytes = Buffer.byteLength(upstream.raw, "utf8");

console.log(`  upstream ${version} — ${bytes} bytes, ${lines} lines, ${upstreamSha.slice(0, 12)}…`);
console.log(`  embedded ${prov.version ?? "?"} — ${Buffer.byteLength(embed.raw, "utf8")} bytes, ${prov.lines ?? "?"} lines, ${embedSha.slice(0, 12)}…`);

if (checkOnly) {
  console.error(`\n✗ agent-standard: the embedded standard is STALE.`);
  console.error(`  Run:  cd mcp-server && node scripts/sync-agent-standard.mjs && npm run build && npm run export-catalog`);
  console.error(`  Then commit src/integration-guide.ts AND ../backend/data/mcp_tools.json.\n`);
  process.exit(1);
}

const header = embed.source
  .slice(0, embed.start)
  .replace(/^(\/\/ Source commit:\s*).*$/m, `$1${upstream.sha}`)
  .replace(/^(\/\/ Source version:\s*).*$/m, `$1${version} — ${bytes.toLocaleString("en-US")} bytes, ${lines.toLocaleString("en-US")} lines`)
  .replace(/^(\/\/ Source sha256:\s*).*$/m, `$1${upstreamSha}`);

const next = header + OPEN + escapeForTemplate(upstream.raw) + embed.source.slice(embed.end + 1);
writeFileSync(GUIDE_PATH, next);

// Prove the file we just wrote reads back byte-identical to upstream.
const after = readEmbed();
if (sha256(after.raw) !== upstreamSha) {
  console.error(`\n✗ agent-standard: wrote the embed but it does not read back identical to upstream. NOT safe to ship.`);
  process.exit(1);
}
console.log(`\n✓ agent-standard: embedded ${version} from theastraway/agents@${upstream.sha.slice(0, 7)} and verified byte-identical.`);
console.log(`  Next: npm run build && npm run export-catalog, then commit backend/data/mcp_tools.json.`);
