#!/usr/bin/env node
/**
 * Export the live MCP tool catalog into backend/data/mcp_tools.json.
 *
 * WHY: backend/data/mcp_tools.json is the catalog the HOSTED /mcp route
 * (backend/routes/mcp_server_routes.py) reports to remote clients. It must
 * describe the exact same tool set as the published stdio npm server
 * (src/server.ts), or the two surfaces drift out of sync (this happened —
 * the file's `resources[0].description` still said "all 23 tools" while the
 * server had already grown to 31, then 43).
 *
 * WHAT THIS DOES: builds nothing itself. It spawns the ALREADY-BUILT stdio
 * server (`dist/cli.js`) as a child process with a placeholder API key (no
 * network call happens for `initialize`/`tools/list`/`resources/*` — those
 * are pure local handshake/reflection), drives it over stdio using the
 * official MCP SDK client, and rewrites mcp_tools.json with the fresh
 * `tools`, `resources`, and `resource_contents` — while preserving every
 * other top-level key exactly as it was (icons, websiteUrl, instructions,
 * protocolVersion, capabilities). `serverInfo` is preserved too, except its
 * `.version` field, which is bumped to package.json's version.
 *
 * `instructions` IS partially regenerated: the hosted route's instructions
 * string is SERVER_INSTRUCTIONS (from src/integration-guide.ts) plus one
 * hosted-only "MCP IS RETRIEVAL, YOU ARE THE REASONER" section appended at
 * the end that the local stdio server does not carry. Rather than overwrite
 * the whole string (which would silently drop that section) or leave it
 * frozen forever (which is what let the TOOL MAP block go stale at "31
 * tools" while the catalog grew to 43), `buildHostedInstructions()` below
 * takes everything BEFORE the "═══ TOOL MAP" marker and everything FROM the
 * "═══ MCP IS RETRIEVAL" marker onward from the file *as it currently is*
 * (untouched except for one live-computed number — see below), and splices
 * in a freshly-built "═══ TOOL MAP …" block sourced from SERVER_INSTRUCTIONS
 * in between.
 *
 * The AUTH line's "a regular connected MIND sees the other N" is computed
 * live too (N = total tool count minus the 4 admin-key-only tools), instead
 * of being frozen text a human has to hand-patch every time the tool count
 * changes (it drifted to a hand-patched "39" once already — the actual
 * answer for 44 tools is 40, and this script now owns getting that right
 * forever). Everything else in the string is byte-identical to what was
 * there before this script ran.
 *
 * Usage: npm run export-catalog   (after `npm run build`)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SERVER_INSTRUCTIONS } from "../dist/integration-guide.js";

const TOOL_MAP_MARKER = "═══ TOOL MAP";
const RETRIEVAL_MARKER = "═══ MCP IS RETRIEVAL";

// The admin-scoped-key-only tools mentioned by the AUTH line. Every other
// tool is usable by a regular connected MIND. Keep this list in sync with
// the tools actually gated behind an admin key (mind_admin, mind_agents,
// mind_tickets, mind_personas today).
const ADMIN_ONLY_TOOLS = ["mind_admin", "mind_agents", "mind_tickets", "mind_personas"];

/**
 * Merge the hosted-only wrapper (preamble + trailing retrieval section)
 * around a fresh TOOL MAP block taken from SERVER_INSTRUCTIONS, and recompute
 * the "sees the other N" count in the preamble from the live tool count.
 * Falls back to SERVER_INSTRUCTIONS verbatim if the current file doesn't
 * have the expected markers (e.g. first run, or the hosted section was
 * removed).
 */
function buildHostedInstructions(currentInstructions, toolCount) {
  if (
    typeof currentInstructions !== "string" ||
    !currentInstructions.includes(TOOL_MAP_MARKER) ||
    !currentInstructions.includes(RETRIEVAL_MARKER) ||
    !SERVER_INSTRUCTIONS.includes(TOOL_MAP_MARKER)
  ) {
    return SERVER_INSTRUCTIONS;
  }
  let preamble = currentInstructions.split(TOOL_MAP_MARKER)[0];
  const otherCount = toolCount - ADMIN_ONLY_TOOLS.length;
  preamble = preamble.replace(/sees the other \d+\./, `sees the other ${otherCount}.`);
  const retrieval = RETRIEVAL_MARKER + currentInstructions.split(RETRIEVAL_MARKER)[1];
  const freshToolMapTail = SERVER_INSTRUCTIONS.split(TOOL_MAP_MARKER)[1]; // " — 44 tools ═══\n...guide`."
  return preamble + TOOL_MAP_MARKER + freshToolMapTail.replace(/\s+$/, "") + "\n\n" + retrieval;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const cliPath = resolve(root, "dist", "cli.js");
const catalogPath = resolve(root, "..", "backend", "data", "mcp_tools.json");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const expectedVersion = pkg.version;
if (!expectedVersion) {
  console.error("✗ export-catalog: package.json has no version");
  process.exit(1);
}

let existing;
try {
  existing = JSON.parse(readFileSync(catalogPath, "utf8"));
} catch (e) {
  console.error(`✗ export-catalog: could not read ${catalogPath}: ${e.message}`);
  process.exit(1);
}

const client = new Client({ name: "mind-mcp-export-catalog", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath, // this node binary
  args: [cliPath],
  env: {
    // Only what dist/cli.js needs to start the stdio server without a
    // network call — a placeholder key is fine since initialize/tools/list/
    // resources/* never hit the MIND API.
    MIND_API_KEY: "mind_placeholder",
    PATH: process.env.PATH ?? "",
  },
});

try {
  await client.connect(transport);

  const serverVersion = client.getServerVersion(); // { name, version } — no icons/websiteUrl locally
  if (serverVersion?.version !== expectedVersion) {
    console.error(
      `✗ export-catalog: live stdio server reports version ${serverVersion?.version}, expected ${expectedVersion} (rebuild with \`npm run build\` first)`
    );
    process.exit(1);
  }

  const { tools } = await client.listTools();
  const { resources } = await client.listResources();

  const resource_contents = {};
  for (const r of resources) {
    const read = await client.readResource({ uri: r.uri });
    const content = read.contents?.[0];
    if (content && typeof content.text === "string") {
      resource_contents[r.uri] = content.text;
    }
  }

  const updated = {
    serverInfo: {
      ...existing.serverInfo,
      version: expectedVersion,
    },
    protocolVersion: existing.protocolVersion,
    capabilities: existing.capabilities,
    instructions: buildHostedInstructions(existing.instructions, tools.length),
    tools,
    resources,
    resource_contents,
  };

  // Preserve any other top-level keys the existing file happened to carry
  // that this script doesn't know about, without letting them shadow the
  // fields above.
  for (const [k, v] of Object.entries(existing)) {
    if (!(k in updated)) updated[k] = v;
  }

  writeFileSync(catalogPath, JSON.stringify(updated, null, 2) + "\n", "utf8");

  console.log(`✓ export-catalog: wrote ${catalogPath}`);
  console.log(`  serverInfo.version = ${updated.serverInfo.version}`);
  console.log(`  tools = ${tools.length}`);
  console.log(`  resources = ${resources.length}`);
} finally {
  await client.close().catch(() => {});
}
