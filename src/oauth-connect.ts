/**
 * MIND MCP Setup — browser OAuth connect.
 *
 * Implements the loopback OAuth 2.1 Authorization Code + PKCE flow against
 * the MIND backend (backend/routes/mcp_oauth_routes.py):
 *
 *   1. Start a local HTTP server on 127.0.0.1 (OS-assigned port), path /callback.
 *   2. Dynamically register a public client (RFC 7591) at {base}/oauth/mcp/register.
 *   3. Open {base}/oauth/mcp/authorize in the default browser — the user clicks
 *      "Connect" on the m-i-n-d.ai consent page.
 *   4. The browser is redirected back to the loopback server with ?code=...&state=...
 *   5. Exchange the code at {base}/oauth/mcp/token (PKCE verified) and receive a
 *      standard `mind_` API key as the access token.
 *
 * No dependencies beyond Node built-ins (http, crypto, child_process) and the
 * global fetch available in Node 18+.
 */

import * as http from "http";
import * as crypto from "crypto";
import { spawn } from "child_process";
import type { AddressInfo } from "net";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CALLBACK_PATH = "/callback";
const DEFAULT_CLIENT_NAME = "MIND Setup CLI";

export interface ConnectViaBrowserOptions {
  /**
   * Open the system browser automatically. Defaults to true; set to false
   * (or set env MIND_CONNECT_NO_BROWSER=1) to print the URL instead.
   */
  openBrowser?: boolean;
  /** Invoked with the authorize URL once it is known (always called). */
  onAuthorizeUrl?: (url: string) => void;
  /** OAuth client display name shown on the consent screen. */
  clientName?: string;
  /** Flow timeout in milliseconds (default 5 minutes). */
  timeoutMs?: number;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** RFC 7636 §4.1 — 43–128 char base64url verifier. 64 random bytes → 86 chars. */
function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash("sha256").update(verifier, "ascii").digest());
  return { verifier, challenge };
}

function openInBrowser(url: string): boolean {
  try {
    let child;
    if (process.platform === "darwin") {
      child = spawn("open", [url], { detached: true, stdio: "ignore" });
    } else if (process.platform === "win32") {
      // `start` is a cmd built-in; empty "" is the window title slot.
      child = spawn("cmd", ["/c", "start", "", url.replace(/&/g, "^&")], {
        detached: true,
        stdio: "ignore",
      });
    } else {
      child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    }
    child.on("error", () => {
      /* swallow — the URL is printed as a fallback either way */
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function htmlPage(title: string, heading: string, body: string, ok: boolean): string {
  const accent = ok ? "#10b981" : "#ef4444";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #0b0f19; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card { text-align: center; padding: 48px 56px; border-radius: 16px; background: #111827;
          border: 1px solid #1f2937; box-shadow: 0 20px 60px rgba(0,0,0,.5); max-width: 440px; }
  .badge { font-size: 44px; line-height: 1; margin-bottom: 18px; color: ${accent}; }
  h1 { font-size: 20px; margin: 0 0 10px; font-weight: 600; }
  p { margin: 0; color: #9ca3af; font-size: 14px; line-height: 1.6; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">${ok ? "✓" : "✕"}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}

const SUCCESS_PAGE = htmlPage(
  "Connected to MIND",
  "✓ Connected to MIND",
  "You can close this tab and return to your terminal.",
  true
);

function errorPage(detail: string): string {
  return htmlPage(
    "MIND connection failed",
    "Connection failed",
    `${detail} — close this tab and retry from your terminal.`,
    false
  );
}

async function registerClient(
  base: string,
  redirectUri: string,
  clientName: string
): Promise<string> {
  const res = await fetch(`${base}/oauth/mcp/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      client_name: clientName,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Client registration failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { client_id?: string };
  if (!data.client_id) {
    throw new Error("Client registration response did not include a client_id.");
  }
  return data.client_id;
}

async function exchangeCode(
  base: string,
  code: string,
  redirectUri: string,
  clientId: string,
  verifier: string
): Promise<string> {
  const res = await fetch(`${base}/oauth/mcp/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Token exchange failed: ${detail}`);
  }
  return data.access_token;
}

/**
 * Run the full browser OAuth flow against a MIND backend and return the
 * minted `mind_` API key.
 */
export async function connectViaBrowser(
  baseUrl: string,
  options: ConnectViaBrowserOptions = {}
): Promise<string> {
  const base = baseUrl.replace(/\/+$/, "");
  const clientName = options.clientName ?? DEFAULT_CLIENT_NAME;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shouldOpenBrowser =
    options.openBrowser ?? process.env.MIND_CONNECT_NO_BROWSER !== "1";

  const { verifier, challenge } = generatePkcePair();
  const state = base64url(crypto.randomBytes(24));

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const server = http.createServer();

    const finish = (err: Error | null, key?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      // Stop accepting connections; in-flight responses use "Connection: close"
      // so they flush fully and the server drains on its own.
      server.close();
      // Drop any lingering idle keep-alive sockets so the CLI exits promptly
      // (Node 18.2+). Responses are flushed before this runs because every
      // handler ends the response before calling finish().
      setImmediate(() => {
        (server as http.Server & { closeIdleConnections?: () => void }).closeIdleConnections?.();
      });
      if (err) reject(err);
      else resolve(key as string);
    };

    server.on("error", (err) => finish(new Error(`Local callback server error: ${err.message}`)));

    server.on("request", (req, res) => {
      void (async () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== CALLBACK_PATH) {
          res.writeHead(404, { "Content-Type": "text/plain", Connection: "close" });
          res.end("Not found");
          return;
        }

        const respond = (status: number, html: string) => {
          res.writeHead(status, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "close",
          });
          res.end(html);
        };

        const errParam = url.searchParams.get("error");
        if (errParam) {
          const desc = url.searchParams.get("error_description") || errParam;
          respond(400, errorPage(desc));
          finish(new Error(`Authorization failed: ${desc}`));
          return;
        }

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        if (!code) {
          respond(400, errorPage("No authorization code was returned"));
          finish(new Error("Callback did not include an authorization code."));
          return;
        }
        if (returnedState !== state) {
          respond(400, errorPage("State mismatch — possible cross-site request forgery"));
          finish(
            new Error("State mismatch on OAuth callback — aborting (possible CSRF). Retry the connection.")
          );
          return;
        }

        try {
          const accessToken = await exchangeCode(
            base,
            code,
            redirectUri,
            clientId,
            verifier
          );
          respond(200, SUCCESS_PAGE);
          finish(null, accessToken);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          respond(502, errorPage(message));
          finish(new Error(message));
        }
      })();
    });

    let redirectUri = "";
    let clientId = "";

    server.listen(0, "127.0.0.1", () => {
      void (async () => {
        try {
          const { port } = server.address() as AddressInfo;
          redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

          clientId = await registerClient(base, redirectUri, clientName);

          const authorizeUrl =
            `${base}/oauth/mcp/authorize?` +
            new URLSearchParams({
              response_type: "code",
              client_id: clientId,
              redirect_uri: redirectUri,
              state,
              code_challenge: challenge,
              code_challenge_method: "S256",
              scope: "mind:full",
            }).toString();

          options.onAuthorizeUrl?.(authorizeUrl);

          if (shouldOpenBrowser) {
            console.log("Opening your browser to connect to MIND...");
            openInBrowser(authorizeUrl);
            console.log("If the browser didn't open, use this link to connect:");
            console.log(`  ${authorizeUrl}`);
          } else {
            console.log("Open this link to connect:");
            console.log(`  ${authorizeUrl}`);
          }
          console.log("");
          console.log("Waiting for you to click \"Connect\" in the browser...");

          timer = setTimeout(() => {
            finish(
              new Error(
                `Timed out after ${Math.round(timeoutMs / 60000)} minutes waiting for the browser connection. Run the setup again to retry.`
              )
            );
          }, timeoutMs);
          // Don't let the timer keep the process alive on its own.
          timer.unref?.();
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });
  });
}
