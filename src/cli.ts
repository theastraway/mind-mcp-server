#!/usr/bin/env node
/**
 * MIND MCP Server — CLI Entry Point
 *
 * Usage:
 *   MIND_API_KEY=mind_xxx mind-mcp
 *   MIND_API_KEY=mind_xxx MIND_BASE_URL=https://www.m-i-n-d.ai mind-mcp
 *   mind-mcp --version
 *   mind-mcp --help
 *   mind-mcp setup [...]        (delegates to the setup wizard — see setup.ts)
 *
 * Environment variables:
 *   MIND_API_KEY   — Required. Your MIND Developer API key.
 *   MIND_BASE_URL  — Optional. Defaults to https://www.m-i-n-d.ai
 */

import * as fs from "fs";
import * as path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MindClient } from "./mind-client.js";
import { createMindMcpServer } from "./server.js";

function readVersion(): string {
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
  return pkg.version ?? "unknown";
}

function printHelp() {
  console.log(`mind-mcp — MIND MCP Server (stdio)

Usage:
  MIND_API_KEY=mind_xxx mind-mcp          Start the MCP server over stdio
  mind-mcp --version                      Print the installed version
  mind-mcp --help                         Show this help
  mind-mcp setup [--key <mind_xxx>]       Run the setup wizard (writes MCP configs)

Environment variables:
  MIND_API_KEY   Required to start the server. Your MIND Developer API key.
  MIND_BASE_URL  Optional. Defaults to https://www.m-i-n-d.ai

No install, no key handling — connect remotely instead:
  claude mcp add --transport http mind https://www.m-i-n-d.ai/mcp

Get a key: https://m-i-n-d.ai → Settings → Developer → API Keys`);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(readVersion());
    process.exit(0);
    return;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
    return;
  }

  if (argv[0] === "setup" || argv[0] === "mind-mcp-setup") {
    // Rewrite argv so the setup module sees `setup` plus any remaining args
    // (e.g. `--key mind_xxx`), matching how mind-mcp-setup's own entry point
    // parses argv.
    process.argv = [process.argv[0], process.argv[1], "setup", ...argv.slice(1)];
    await import("./setup.js");
    return;
  }

  const API_KEY = process.env.MIND_API_KEY;
  const BASE_URL = process.env.MIND_BASE_URL ?? "https://www.m-i-n-d.ai";

  if (!API_KEY) {
    console.error(
      "Error: MIND_API_KEY environment variable is required.\n" +
        "\n" +
        "Three ways to connect:\n" +
        "  1. Remote, no install:  claude mcp add --transport http mind https://www.m-i-n-d.ai/mcp\n" +
        "  2. Local stdio setup:   npx -y --package=@astramindapp/mcp-server mind-mcp-setup --key <mind_...>\n" +
        "  3. Mint a key at:       https://m-i-n-d.ai → Settings → Developer → API Keys\n"
    );
    process.exit(1);
    return;
  }

  const client = new MindClient({ baseUrl: BASE_URL, apiKey: API_KEY });
  const server = createMindMcpServer(client);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP stdio protocol
  console.error(`MIND MCP Server v${readVersion()} started`);
  console.error(`  → Base URL: ${BASE_URL}`);
  console.error(`  → API Key: ${API_KEY.slice(0, 8)}...`);
  console.error(`  → Tools: mind_query, mind_remember, mind_context, mind_life, mind_crm, mind_graph`);
}

main().catch((err) => {
  console.error("Fatal error starting MIND MCP Server:", err);
  process.exit(1);
});
