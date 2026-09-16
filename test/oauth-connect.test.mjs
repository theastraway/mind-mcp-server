/**
 * Tests for src/oauth-connect.ts (compiled to dist/oauth-connect.js).
 *
 * Run:
 *   cd mcp-server && npm run build && node --test test/oauth-connect.test.mjs
 *
 * Spins up a mock MIND OAuth server (Node http, no deps) implementing
 * /oauth/mcp/register, /oauth/mcp/authorize, and /oauth/mcp/token with real
 * PKCE S256 verification, then drives connectViaBrowser() with the browser
 * disabled — the test plays the role of the user's browser by following the
 * 302 redirect by hand.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";

import { connectViaBrowser } from "../dist/oauth-connect.js";

// Belt and braces: never spawn a real browser from CI/tests.
process.env.MIND_CONNECT_NO_BROWSER = "1";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function s256(verifier) {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** Mock MIND backend OAuth surface. */
function createMockOAuthServer() {
  const captured = {
    registration: null,
    challenge: null,
    state: null,
    issuedCode: null,
    pkceVerified: false,
    tokenCalls: 0,
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url, "http://localhost");
      const json = (status, obj) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };

      if (req.method === "POST" && url.pathname === "/oauth/mcp/register") {
        captured.registration = JSON.parse(await readBody(req));
        json(201, {
          client_id: "mcp_client_test_abc",
          ...captured.registration,
          token_endpoint_auth_method: "none",
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/oauth/mcp/authorize") {
        captured.challenge = url.searchParams.get("code_challenge");
        captured.state = url.searchParams.get("state");
        captured.issuedCode = `test_code_${crypto.randomBytes(8).toString("hex")}`;
        const redirectUri = url.searchParams.get("redirect_uri");
        const params = new URLSearchParams({
          code: captured.issuedCode,
          state: captured.state ?? "",
        });
        // Skip the human consent page — redirect straight back with a code,
        // exactly what the backend does after the user clicks "Connect".
        res.writeHead(302, { Location: `${redirectUri}?${params}` });
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/oauth/mcp/token") {
        captured.tokenCalls += 1;
        const params = new URLSearchParams(await readBody(req));
        const codeOk = params.get("code") === captured.issuedCode;
        const pkceOk = s256(params.get("code_verifier") ?? "") === captured.challenge;
        captured.pkceVerified = pkceOk;
        if (params.get("grant_type") !== "authorization_code" || !codeOk || !pkceOk) {
          json(400, {
            error: "invalid_grant",
            error_description: !codeOk ? "code mismatch" : "PKCE verification failed",
          });
          return;
        }
        json(200, {
          access_token: "mind_test_key_123",
          token_type: "Bearer",
          refresh_token: "mind_rt_test",
          scope: "mind:full",
        });
        return;
      }

      json(404, { error: "not_found" });
    })().catch((err) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        captured,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

test("connectViaBrowser: full PKCE flow returns the minted mind_ key", async () => {
  const mock = await createMockOAuthServer();
  try {
    let resolveUrl;
    const authorizeUrlPromise = new Promise((r) => (resolveUrl = r));

    const keyPromise = connectViaBrowser(mock.baseUrl, {
      openBrowser: false,
      onAuthorizeUrl: resolveUrl,
    });

    const authorizeUrl = await authorizeUrlPromise;
    const parsedAuthorize = new URL(authorizeUrl);
    assert.equal(parsedAuthorize.pathname, "/oauth/mcp/authorize");
    assert.equal(parsedAuthorize.searchParams.get("response_type"), "code");
    assert.equal(parsedAuthorize.searchParams.get("code_challenge_method"), "S256");
    const sentState = parsedAuthorize.searchParams.get("state");
    assert.ok(sentState, "authorize URL carries a state param");

    // DCR happened with the right client name + loopback redirect.
    assert.equal(mock.captured.registration.client_name, "MIND Setup CLI");
    assert.match(
      mock.captured.registration.redirect_uris[0],
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/
    );

    // Play the browser: hit authorize, follow the 302 by hand.
    const authorizeRes = await fetch(authorizeUrl, { redirect: "manual" });
    assert.equal(authorizeRes.status, 302);
    const location = authorizeRes.headers.get("location");
    assert.ok(location, "authorize 302 has a Location header");

    // State round-trips: what we sent is what comes back on the callback URL.
    const callbackUrl = new URL(location);
    assert.equal(callbackUrl.searchParams.get("state"), sentState);

    const callbackRes = await fetch(callbackUrl);
    assert.equal(callbackRes.status, 200);
    const html = await callbackRes.text();
    assert.match(html, /Connected to MIND/);

    const key = await keyPromise;
    assert.equal(key, "mind_test_key_123");
    assert.equal(mock.captured.pkceVerified, true, "mock verified S256(code_verifier)");
    assert.equal(mock.captured.tokenCalls, 1);
  } finally {
    await mock.close();
  }
});

test("connectViaBrowser: wrong state on callback rejects the flow", async () => {
  const mock = await createMockOAuthServer();
  try {
    let resolveUrl;
    const authorizeUrlPromise = new Promise((r) => (resolveUrl = r));

    const keyPromise = connectViaBrowser(mock.baseUrl, {
      openBrowser: false,
      onAuthorizeUrl: resolveUrl,
    });
    // The rejection fires while we're still driving the browser steps below —
    // attach a no-op handler so it isn't flagged as an unhandled rejection
    // before assert.rejects() awaits it.
    keyPromise.catch(() => {});

    const authorizeUrl = await authorizeUrlPromise;
    const authorizeRes = await fetch(authorizeUrl, { redirect: "manual" });
    assert.equal(authorizeRes.status, 302);
    const callbackUrl = new URL(authorizeRes.headers.get("location"));

    // Tamper with the state before "the browser" hits the callback.
    callbackUrl.searchParams.set("state", "evil_forged_state");
    const callbackRes = await fetch(callbackUrl);
    assert.equal(callbackRes.status, 400);
    const html = await callbackRes.text();
    assert.match(html, /Connection failed/);

    await assert.rejects(keyPromise, /[Ss]tate mismatch/);
    assert.equal(mock.captured.tokenCalls, 0, "token endpoint never called on bad state");
  } finally {
    await mock.close();
  }
});
