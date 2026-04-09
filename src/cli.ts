#!/usr/bin/env node
/**
 * MIND MCP Server — CLI Entry Point
 *
 * Usage:
 *   MIND_API_KEY=mind_xxx mind-mcp
 *   MIND_API_KEY=mind_xxx MIND_BASE_URL=https://m-i-n-d.ai mind-mcp
 *
 * Environment variables:
 *   MIND_API_KEY   — Required. Your MIND Developer API key.
 *   MIND_BASE_URL  — Optional. Defaults to https://m-i-n-d.ai
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MindClient } from "./mind-client.js";
import { createMindMcpServer } from "./server.js";

const API_KEY = process.env.MIND_API_KEY;
const BASE_URL = process.env.MIND_BASE_URL ?? "https://m-i-n-d.ai";

if (!API_KEY) {
  console.error(
    "Error: MIND_API_KEY environment variable is required.\n" +
      "Get your API key at https://m-i-n-d.ai → Settings → Developer → API Keys\n"
  );
  process.exit(1);
}

async function main() {
  const apiKey = API_KEY!;
  const client = new MindClient({ baseUrl: BASE_URL, apiKey });
  const server = createMindMcpServer(client);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP stdio protocol
  console.error(`MIND MCP Server v0.1.0 started`);
  console.error(`  → Base URL: ${BASE_URL}`);
  console.error(`  → API Key: ${apiKey.slice(0, 8)}...`);
  console.error(`  → Tools: mind_query, mind_remember, mind_context, mind_life, mind_crm, mind_graph`);
}

main().catch((err) => {
  console.error("Fatal error starting MIND MCP Server:", err);
  process.exit(1);
});
