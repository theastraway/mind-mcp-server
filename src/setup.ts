#!/usr/bin/env node
/**
 * MIND MCP Server — Interactive Setup Wizard
 *
 * Usage:
 *   npx @mindapp/mcp-server setup
 *   mind-mcp-setup
 *
 * Auto-detects installed AI tools and configures MIND as their memory layer.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";

const HOME = os.homedir();

// ─── AI Tool Configs ──────────────────────────────────────

interface ToolConfig {
  name: string;
  configPath: string;
  configKey: string; // key in the JSON where MCP servers live
  detected: boolean;
}

function getToolConfigs(): ToolConfig[] {
  const platform = process.platform;
  const tools: ToolConfig[] = [];

  // Claude Desktop
  if (platform === "darwin") {
    tools.push({
      name: "Claude Desktop",
      configPath: path.join(
        HOME,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      ),
      configKey: "mcpServers",
      detected: false,
    });
  } else if (platform === "win32") {
    tools.push({
      name: "Claude Desktop",
      configPath: path.join(
        process.env.APPDATA ?? path.join(HOME, "AppData", "Roaming"),
        "Claude",
        "claude_desktop_config.json"
      ),
      configKey: "mcpServers",
      detected: false,
    });
  } else {
    // Linux
    tools.push({
      name: "Claude Desktop",
      configPath: path.join(
        HOME,
        ".config",
        "Claude",
        "claude_desktop_config.json"
      ),
      configKey: "mcpServers",
      detected: false,
    });
  }

  // Cursor
  const cursorConfig = path.join(HOME, ".cursor", "mcp.json");
  tools.push({
    name: "Cursor",
    configPath: cursorConfig,
    configKey: "mcpServers",
    detected: false,
  });

  // Windsurf
  const windsurfConfig = path.join(HOME, ".windsurf", "mcp.json");
  tools.push({
    name: "Windsurf",
    configPath: windsurfConfig,
    configKey: "mcpServers",
    detected: false,
  });

  // VS Code (Copilot MCP)
  const vscodeConfig = path.join(HOME, ".vscode", "mcp.json");
  tools.push({
    name: "VS Code (Copilot)",
    configPath: vscodeConfig,
    configKey: "servers",
    detected: false,
  });

  // Detect which tools exist
  for (const tool of tools) {
    const configDir = path.dirname(tool.configPath);
    tool.detected = fs.existsSync(configDir);
  }

  return tools;
}

// ─── CLI Helpers ──────────────────────────────────────────

function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function print(msg: string) {
  console.log(msg);
}

function printHeader() {
  print("");
  print("╔══════════════════════════════════════════╗");
  print("║     🧠 MIND MCP Server — Setup Wizard    ║");
  print("║  Give your AI agents persistent memory   ║");
  print("╚══════════════════════════════════════════╝");
  print("");
}

// ─── Config Writing ───────────────────────────────────────

function getMindServerConfig(apiKey: string): Record<string, unknown> {
  // Use the globally installed CLI path, or fall back to local
  const cliPath = path.resolve(__dirname, "cli.js");

  return {
    command: "node",
    args: [cliPath],
    env: {
      MIND_API_KEY: apiKey,
    },
  };
}

function writeToolConfig(
  tool: ToolConfig,
  apiKey: string
): { success: boolean; error?: string } {
  try {
    const configDir = path.dirname(tool.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(tool.configPath)) {
      try {
        const raw = fs.readFileSync(tool.configPath, "utf-8");
        config = JSON.parse(raw);
      } catch {
        // If the file exists but is invalid JSON, start fresh
        config = {};
      }
    }

    // Get or create the MCP servers section
    const serversKey = tool.configKey;
    if (!config[serversKey] || typeof config[serversKey] !== "object") {
      config[serversKey] = {};
    }

    // Add MIND server
    (config[serversKey] as Record<string, unknown>)["mind"] =
      getMindServerConfig(apiKey);

    // Write back
    fs.writeFileSync(
      tool.configPath,
      JSON.stringify(config, null, 2) + "\n",
      "utf-8"
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── API Key Validation ──────────────────────────────────

async function validateApiKey(
  apiKey: string,
  baseUrl: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/developer/v1/profile`, {
      headers: { "X-API-Key": apiKey },
    });
    if (res.ok) {
      return { valid: true };
    }
    return { valid: false, error: `API returned ${res.status}: ${res.statusText}` };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  printHeader();

  const rl = createRL();

  // Step 1: API Key
  print("Step 1: Connect to your MIND");
  print("─────────────────────────────");
  print("You need a MIND API key. Get one at: https://m-i-n-d.ai → Settings → Developer → API Keys");
  print("");

  let apiKey = process.env.MIND_API_KEY ?? "";
  if (apiKey) {
    print(`Found MIND_API_KEY in environment: ${apiKey.slice(0, 12)}...`);
    const useExisting = await ask(rl, "Use this key? (Y/n): ");
    if (useExisting.toLowerCase() === "n") {
      apiKey = "";
    }
  }

  if (!apiKey) {
    apiKey = await ask(rl, "Paste your MIND API key: ");
  }

  if (!apiKey) {
    print("\n❌ No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  // Validate
  const baseUrl = process.env.MIND_BASE_URL ?? "https://m-i-n-d.ai";
  print("\nValidating API key...");
  const validation = await validateApiKey(apiKey, baseUrl);

  if (!validation.valid) {
    print(`\n⚠️  Could not validate key: ${validation.error}`);
    const proceed = await ask(rl, "Continue anyway? (y/N): ");
    if (proceed.toLowerCase() !== "y") {
      rl.close();
      process.exit(1);
    }
  } else {
    print("✅ API key is valid!\n");
  }

  // Step 2: Detect AI tools
  print("Step 2: Detect your AI tools");
  print("─────────────────────────────");

  const tools = getToolConfigs();
  const detected = tools.filter((t) => t.detected);
  const notDetected = tools.filter((t) => !t.detected);

  if (detected.length > 0) {
    print("Found these AI tools on your machine:");
    for (const tool of detected) {
      print(`  ✅ ${tool.name}`);
    }
  }

  if (notDetected.length > 0) {
    print("\nNot detected (you can still configure manually):");
    for (const tool of notDetected) {
      print(`  ⬜ ${tool.name}`);
    }
  }

  print("");

  // Step 3: Configure each detected tool
  print("Step 3: Configure MIND memory");
  print("──────────────────────────────");

  const configured: string[] = [];

  for (const tool of detected) {
    const answer = await ask(rl, `Add MIND to ${tool.name}? (Y/n): `);
    if (answer.toLowerCase() === "n") {
      print(`  ⏭️  Skipped ${tool.name}`);
      continue;
    }

    const result = writeToolConfig(tool, apiKey);
    if (result.success) {
      print(`  ✅ ${tool.name} configured!`);
      configured.push(tool.name);
    } else {
      print(`  ❌ Failed: ${result.error}`);
    }
  }

  // Also offer non-detected tools
  for (const tool of notDetected) {
    const answer = await ask(
      rl,
      `Configure MIND for ${tool.name} anyway? (y/N): `
    );
    if (answer.toLowerCase() !== "y") continue;

    const result = writeToolConfig(tool, apiKey);
    if (result.success) {
      print(`  ✅ ${tool.name} configured!`);
      configured.push(tool.name);
    } else {
      print(`  ❌ Failed: ${result.error}`);
    }
  }

  // Done
  print("");
  print("══════════════════════════════════════════");
  print("🧠 MIND MCP Server setup complete!");
  print("══════════════════════════════════════════");
  print("");

  if (configured.length > 0) {
    print("Configured for:");
    for (const name of configured) {
      print(`  ✅ ${name}`);
    }
    print("");
    print("⚠️  Restart your AI tools for changes to take effect.");
    print("   (Fully quit and reopen — not just close the window)");
  } else {
    print("No tools configured. You can run this again anytime:");
    print("  npx @mindapp/mcp-server setup");
  }

  print("");
  print("Your AI agents now have persistent memory. 🧠");
  print("Everything they learn gets stored in your MIND knowledge graph.");
  print("");

  rl.close();
}

// Entry point
const args = process.argv.slice(2);
if (args.includes("setup") || args.includes("--setup")) {
  main().catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  });
} else {
  // If called directly without "setup", show help
  print("MIND MCP Server Setup");
  print("");
  print("Usage:");
  print("  mind-mcp-setup          Run interactive setup wizard");
  print("  mind-mcp-setup setup    Same as above");
  print("");
  main().catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  });
}
