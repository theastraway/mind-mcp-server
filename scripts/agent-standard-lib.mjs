/**
 * Shared helpers for the AGENTS.md embed in src/integration-guide.ts.
 *
 * The MIND Agent Standard is authored in github.com/theastraway/agents
 * (AGENTS.md, repo root) and embedded VERBATIM here so that it fans out to
 * every connecting agent through the MCP `initialize` handshake — including
 * stdio clients that can never reach the network for it.
 *
 * Embedding means it can go stale. It did: the published npm package shipped
 * v1.3 of the standard while upstream main was already at v1.6. These helpers
 * exist so the embed is refreshed by a script and VERIFIED by the build,
 * instead of being pasted by hand and trusted.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..");
export const GUIDE_PATH = resolve(ROOT, "src/integration-guide.ts");

export const OPEN = "export const AGENT_STANDARD_MD = `";
// The embed ends with the source file's own trailing newline, then "`;".
// `end` is set to KEEP that newline in the extracted bytes — without it the
// extracted copy differs from upstream by exactly one byte and every hash
// comparison fails for a reason nobody can see.
export const CLOSE = "\n`;\n";

export const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Escape raw Markdown for embedding inside a JS template literal. */
export const escapeForTemplate = (raw) =>
  raw.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

/** Inverse of escapeForTemplate — recover the original bytes from the embed. */
export const unescapeFromTemplate = (esc) => esc.replace(/\\(\\|`|\$\{)/g, "$1");

/**
 * Pull the embedded standard back out of integration-guide.ts.
 * Returns { raw, escaped, start, end, source } where `raw` is byte-identical
 * to the upstream AGENTS.md the embed was generated from.
 */
export function readEmbed(path = GUIDE_PATH) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(OPEN);
  if (start === -1) throw new Error(`could not find "${OPEN}" in ${path}`);
  const bodyStart = start + OPEN.length;
  const end = source.indexOf(CLOSE, bodyStart);
  if (end === -1) throw new Error(`could not find the closing backtick of AGENT_STANDARD_MD in ${path}`);
  const escaped = source.slice(bodyStart, end + 1); // +1 keeps the trailing newline
  return { raw: unescapeFromTemplate(escaped), escaped, start, end, source };
}

/** Read the provenance block (commit / version / bytes / lines / sha256) above the embed. */
export function readProvenance(source) {
  const grab = (re) => (source.match(re) || [])[1];
  return {
    commit: grab(/^\/\/ Source commit:\s*([0-9a-f]{7,40})\s*$/m),
    version: grab(/^\/\/ Source version:\s*(v[\d.]+)/m),
    bytes: Number(grab(/^\/\/ Source version:.*?—\s*([\d,]+)\s*bytes/m)?.replace(/,/g, "")),
    lines: Number(grab(/^\/\/ Source version:.*?,\s*([\d,]+)\s*lines/m)?.replace(/,/g, "")),
    sha256: grab(/^\/\/ Source sha256:\s*([0-9a-f]{64})\s*$/m),
  };
}

/** Git's own object id for a blob — sha1("blob <len>\0" + content). */
const gitBlobSha = (raw) => {
  const body = Buffer.from(raw, "utf8");
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`, "utf8"), body]))
    .digest("hex");
};

/**
 * Read the canonical AGENTS.md.
 *
 * theastraway/agents is PRIVATE, so an unauthenticated read returns 404 —
 * indistinguishable from "the file does not exist". Three credentialed routes,
 * in the order they are cheapest to arrange:
 *
 *   1. AGENTS_MD_PATH — a path to an already-checked-out AGENTS.md. This is
 *      what CI uses: the workflow clones the repo with a read-only DEPLOY KEY
 *      (scoped to that one repo, revocable on its own) and points us at the
 *      file, so no account-wide token is involved at all.
 *   2. GH_TOKEN / GITHUB_TOKEN — a token that can read the repo.
 *   3. The locally authenticated `gh` CLI — a developer's machine.
 */
export async function fetchUpstream(ref = "main") {
  const localPath = process.env.AGENTS_MD_PATH;
  if (localPath) {
    const raw = readFileSync(localPath, "utf8");
    return { raw, sha: gitBlobSha(raw), url: localPath };
  }

  const path = `repos/theastraway/agents/contents/AGENTS.md?ref=${encodeURIComponent(ref)}`;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  let json;
  if (token) {
    const res = await fetch(`https://api.github.com/${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "mind-mcp-standard-sync",
      },
    });
    if (res.status === 404) {
      throw new Error(
        `GitHub API 404 for ${path}. theastraway/agents is private — the token in GH_TOKEN/GITHUB_TOKEN cannot read it.`,
      );
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText} for ${path}`);
    json = await res.json();
  } else {
    try {
      json = JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
    } catch (e) {
      throw new Error(
        `Could not read AGENTS.md from theastraway/agents (private repo).\n` +
          `  Set AGENTS_MD_PATH to a local checkout, or GH_TOKEN/GITHUB_TOKEN,\n` +
          `  or authenticate the gh CLI with \`gh auth login\`.\n` +
          `  Underlying error: ${e.message}`,
      );
    }
  }

  const raw = Buffer.from(json.content, "base64").toString("utf8");
  return { raw, sha: json.sha, url: json.html_url };
}
