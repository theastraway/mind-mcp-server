#!/usr/bin/env node
/**
 * MIND MCP Server — Interactive Setup Wizard
 *
 * Usage:
 *   npx -y --package=@astramindapp/mcp-server mind-mcp-setup
 *   mind-mcp-setup            Browser connect (default) — opens m-i-n-d.ai,
 *                             click "Connect", key arrives automatically
 *   mind-mcp-setup --key      Manual mode — paste an API key instead
 *   mind-mcp-setup --key <k>  Manual mode with the key inline
 *   mind-mcp-setup --help     Show usage and exit (no wizard)
 *
 * Auto-detects installed AI tools and configures MIND as their memory layer.
 *
 * NON-INTERACTIVE / AGENT SAFETY: this wizard's default mode opens a browser
 * and blocks waiting for a human click — fine for a person at a terminal,
 * fatal for an AI agent in a non-TTY shell (it would hang forever). When
 * stdin is not a TTY, or `CI` is set, or `MIND_NONINTERACTIVE=1`, and no key
 * was resolved from `--key` or `MIND_API_KEY`, the wizard prints the
 * non-interactive options and exits with code 2 instead of opening a
 * browser or blocking on a readline prompt. If a key WAS resolved (inline
 * `--key <value>` or `MIND_API_KEY` in the environment), it proceeds and
 * writes every detected tool's config without prompting.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import { connectViaBrowser } from "./oauth-connect.js";

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

function printUsage() {
  print("MIND MCP Server Setup");
  print("");
  print("Usage:");
  print("  mind-mcp-setup            Run setup — browser connect by default");
  print("                            (opens m-i-n-d.ai, click \"Connect\", done)");
  print("  mind-mcp-setup --key      Paste an API key manually instead");
  print("  mind-mcp-setup --key <k>  Manual mode with the key inline");
  print("  mind-mcp-setup setup      Same as the default");
  print("  mind-mcp-setup --help     Show this help and exit");
  print("");
  print("Non-interactive shells (CI, agents, piped stdin) never open a");
  print("browser or block on a prompt. Pass --key, or set MIND_API_KEY, or");
  print("connect remotely with no install at all:");
  print("  claude mcp add --transport http mind https://www.m-i-n-d.ai/mcp");
}

function isNonInteractive(): boolean {
  return (
    !process.stdin.isTTY ||
    Boolean(process.env.CI) ||
    process.env.MIND_NONINTERACTIVE === "1"
  );
}

function printNonInteractiveHelp() {
  print("");
  print("══════════════════════════════════════════");
  print("Non-interactive shell detected");
  print("══════════════════════════════════════════");
  print("");
  print("This wizard's default mode opens a browser and waits for a click —");
  print("that never completes in a non-interactive shell (CI, an agent, or");
  print("piped stdin), so no browser was opened and nothing is blocking.");
  print("");
  print("Pick one:");
  print("  1. Remote, no install:");
  print("     claude mcp add --transport http mind https://www.m-i-n-d.ai/mcp");
  print("  2. Local stdio setup with a key:");
  print("     npx -y --package=@astramindapp/mcp-server mind-mcp-setup --key <mind_...>");
  print("  3. Mint a key at:");
  print("     https://m-i-n-d.ai → Settings → Developer → API Keys");
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
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
    return;
  }

  printHeader();

  const nonInteractive = isNonInteractive();
  const rl = createRL();

  // Step 1: API Key — default is browser OAuth; --key switches to manual paste
  print("Step 1: Connect to your MIND");
  print("─────────────────────────────");

  const baseUrl = process.env.MIND_BASE_URL ?? "https://www.m-i-n-d.ai";
  const keyFlagIndex = argv.indexOf("--key");
  const manualMode = keyFlagIndex !== -1;

  let apiKey = "";

  // --key <value> inline
  if (manualMode) {
    const flagValue = argv[keyFlagIndex + 1];
    if (flagValue && !flagValue.startsWith("--") && flagValue !== "setup") {
      apiKey = flagValue.trim();
    }
  }

  // Existing MIND_API_KEY in the environment (kept as a convenience path)
  if (!apiKey) {
    const envKey = process.env.MIND_API_KEY ?? "";
    if (envKey) {
      if (nonInteractive) {
        print(`Using MIND_API_KEY from environment: ${envKey.slice(0, 12)}... (non-interactive, no prompt)`);
        apiKey = envKey;
      } else {
        print(`Found MIND_API_KEY in environment: ${envKey.slice(0, 12)}...`);
        const useExisting = await ask(rl, "Use this key? (Y/n): ");
        apiKey = useExisting.toLowerCase() === "n" ? "" : envKey;
      }
    }
  }

  // DEFAULT: browser OAuth — one click on m-i-n-d.ai, key arrives automatically.
  // Never attempted in a non-interactive shell — it would open nothing
  // useful and block on a click that can never come.
  if (!apiKey && !manualMode) {
    if (nonInteractive) {
      printNonInteractiveHelp();
      rl.close();
      process.exit(2);
      return;
    }
    print("Connecting via your browser — sign in to m-i-n-d.ai and click \"Connect\".");
    print("(Prefer to paste a key instead? Re-run with --key)");
    print("");
    try {
      apiKey = await connectViaBrowser(baseUrl);
      print("");
      print(`✅ Connected! Received your MIND API key automatically: ${apiKey.slice(0, 12)}...`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      print(`\n⚠️  Browser connect failed: ${message}`);
      print("Or paste an API key from m-i-n-d.ai Settings → Developer:");
    }
  }

  // Manual fallback (also the --key path when no inline value was given).
  // Never blocks on a readline prompt in a non-interactive shell.
  if (!apiKey) {
    if (nonInteractive) {
      printNonInteractiveHelp();
      rl.close();
      process.exit(2);
      return;
    }
    if (manualMode) {
      print("Get a key at: https://m-i-n-d.ai → Settings → Developer → API Keys");
    }
    apiKey = await ask(rl, "Paste your MIND API key: ");
  }

  if (!apiKey) {
    print("\n❌ No API key provided. Exiting.");
    rl.close();
    process.exit(1);
    return;
  }

  // Validate
  print("\nValidating API key...");
  const validation = await validateApiKey(apiKey, baseUrl);

  if (!validation.valid) {
    print(`\n⚠️  Could not validate key: ${validation.error}`);
    if (nonInteractive) {
      print("Non-interactive shell — proceeding with the provided key anyway.");
    } else {
      const proceed = await ask(rl, "Continue anyway? (y/N): ");
      if (proceed.toLowerCase() !== "y") {
        rl.close();
        process.exit(1);
        return;
      }
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
    let proceed = true;
    if (!nonInteractive) {
      const answer = await ask(rl, `Add MIND to ${tool.name}? (Y/n): `);
      proceed = answer.toLowerCase() !== "n";
    }
    if (!proceed) {
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

  // Also offer non-detected tools (interactive only — non-interactive runs
  // default to NOT writing config for tools that were never detected).
  if (!nonInteractive) {
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
    print("  npx -y --package=@astramindapp/mcp-server mind-mcp-setup");
  }

  print("");
  print("Your AI agents now have persistent memory. 🧠");
  print("Everything they learn gets stored in your MIND knowledge graph.");
  print("");

  rl.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
