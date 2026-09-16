import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // src/server.ts grew substantially with the v0.25.0 full-coverage tools
    // (12 new tools, ~150 new actions) — the default 5000ms per-test timeout
    // started tripping on the tsx transform + module-load cost alone, not on
    // any actual regression (every test passes comfortably under 20s local,
    // ~9s of that being one-time transform/collect overhead shared by the
    // whole file). Widen instead of shaving assertions to fit an arbitrary
    // budget.
    testTimeout: 20000,
  },
});
