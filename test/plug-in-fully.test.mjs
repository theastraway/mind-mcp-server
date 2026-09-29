/**
 * Regression lock: every connecting agent is told, in the initialize
 * instructions, to plug fully into MIND before asking the user for access.
 *
 * Run:
 *   cd mcp-server && npm run build && npx vitest run test/plug-in-fully.test.mjs
 */
import { test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SERVER_INSTRUCTIONS } = require("../dist/integration-guide.js");

test("server instructions carry the plug-in-fully standard before the session protocol", () => {
  const i = SERVER_INSTRUCTIONS.indexOf("PLUG IN FULLY");
  expect(i).toBeGreaterThan(-1);
  expect(i).toBeLessThan(SERVER_INSTRUCTIONS.indexOf("SESSION PROTOCOL — do this every session"));
  expect(SERVER_INSTRUCTIONS).toMatch(/source of truth/);
  expect(SERVER_INSTRUCTIONS).toMatch(/Never ask the user for a key, a connection or access until you have checked every path/);
  expect(SERVER_INSTRUCTIONS).toMatch(/stale list, not a limit/);
  expect(SERVER_INSTRUCTIONS).toMatch(/Never print, log or store secret values/);
});
