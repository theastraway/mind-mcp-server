#!/usr/bin/env node
/**
 * Embed-integrity guard — runs before `tsc` on every build. OFFLINE by design.
 *
 * WHY THIS EXISTS: AGENT_STANDARD_MD in src/integration-guide.ts is a verbatim
 * copy of AGENTS.md from github.com/theastraway/agents, carried in the package
 * so that stdio clients — which may never reach the network — still receive the
 * MIND Agent Standard on connect. A carried copy can rot, and this one did: npm
 * shipped v1.3 of the standard while upstream main was at v1.6.
 *
 * This guard is the cheap half of the defence and runs everywhere, including in
 * an npm publish context with no repo checkout and no credentials:
 *   the embedded bytes must hash to the sha256 recorded in the provenance
 *   comment directly above them.
 *
 * That catches a hand edit, a bad merge, or a truncated paste — any case where
 * the comment describes a copy that is not actually there.
 *
 * It CANNOT detect "upstream moved on", because that needs the network and a
 * credential for a private repo. That is the other half:
 *   scripts/sync-agent-standard.mjs --check   (run by .github/workflows/check-agent-standard.yml)
 */
import { readEmbed, readProvenance, sha256 } from "./agent-standard-lib.mjs";

const embed = readEmbed();
const prov = readProvenance(embed.source);
const actual = sha256(embed.raw);
const bytes = Buffer.byteLength(embed.raw, "utf8");
const lines = embed.raw.split("\n").length - 1;

const errors = [];
if (!prov.sha256) errors.push("provenance comment has no `// Source sha256:` line");
else if (prov.sha256 !== actual) {
  errors.push(
    `embedded AGENT_STANDARD_MD does not match its provenance sha256\n` +
      `      embedded: ${actual} (${bytes} bytes, ${lines} lines)\n` +
      `      comment:  ${prov.sha256} (${prov.bytes ?? "?"} bytes, ${prov.lines ?? "?"} lines)`,
  );
}
if (prov.bytes && prov.bytes !== bytes) errors.push(`provenance says ${prov.bytes} bytes, embed is ${bytes}`);
if (prov.lines && prov.lines !== lines) errors.push(`provenance says ${prov.lines} lines, embed is ${lines}`);

if (errors.length) {
  console.error(`\n✗ agent-standard integrity: \n  - ${errors.join("\n  - ")}`);
  console.error(`\n  AGENT_STANDARD_MD is generated. Do not edit it by hand — repair it with:`);
  console.error(`    cd mcp-server && node scripts/sync-agent-standard.mjs && npm run build && npm run export-catalog\n`);
  process.exit(1);
}
console.log(`✓ agent-standard integrity: embed matches provenance (${prov.version ?? "?"}, ${bytes} bytes, ${actual.slice(0, 12)}…)`);
