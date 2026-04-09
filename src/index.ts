/**
 * @mindapp/mcp-server
 *
 * MIND MCP Server — Universal AI memory layer.
 * Give any LLM agent persistent memory via the Model Context Protocol.
 *
 * Programmatic usage:
 *   import { createMindMcpServer, MindClient } from "@mindapp/mcp-server";
 *   const client = new MindClient({ baseUrl: "https://m-i-n-d.ai", apiKey: "mind_xxx" });
 *   const server = createMindMcpServer(client);
 */

export { createMindMcpServer } from "./server.js";
export { MindClient } from "./mind-client.js";
export type * from "./mind-client.js";
