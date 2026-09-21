/**
 * MIND MCP Server
 *
 * Exposes the MIND knowledge graph as MCP tools that any LLM agent can use.
 * This is the universal AI memory layer.
 *
 * The server is self-describing: every connecting client receives
 * SERVER_INSTRUCTIONS (from ./integration-guide) in the MCP `initialize`
 * response, and can read the full playbook from the `mind://integration-guide`
 * resource. Any agent that connects therefore knows what MIND is, which
 * integration path to use for its runtime, how to authenticate, and the
 * session protocol — without having to be told.
 *
 * Tools (45):
 *   Memory & knowledge — mind_query, mind_remember, mind_folders,
 *     mind_folder_routes, mind_folder_suggest, mind_share (document share
 *     links), mind_context, mind_graph, mind_insights, mind_research,
 *     mind_train
 *   Life & work — mind_life, mind_focuses, mind_tasks, mind_automate,
 *     mind_notify, mind_checklists (Kanon checklists)
 *   Agent sessions — mind_sessions (log this session into MIND Chat →
 *     Agents; see the AGENT SESSION PROTOCOL in ./integration-guide)
 *   People — mind_crm
 *   Social & profile — mind_social, mind_social_analytics, mind_profile,
 *     mind_personas
 *   Intelligence & trading — mind_sense, mind_trader, mind_osint
 *   Front Layer templates — mind_list_templates, mind_get_template,
 *     mind_save_typed, mind_bootstrap_templates
 *   Fleet & admin (admin key) — mind_agents, mind_tickets, mind_admin,
 *     mind_accounts
 *   Full-coverage apps (v0.25.0) — mind_mindmap (MIND Mind Map),
 *     mind_moneymind (MoneyMIND), mind_budget (13-week cash flow),
 *     mind_sheets (Airtable-style tables), mind_email (Email Manager),
 *     mind_sign (e-signature), mind_invoices (Invoice Agent),
 *     mind_books (MIND Books accounting), mind_timer (Tempo time tracking),
 *     mind_forms (Quill forms), mind_library (bookshelf)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MindApiError, MindClient } from "./mind-client.js";
import {
  SERVER_INSTRUCTIONS,
  INTEGRATION_GUIDE,
  AGENT_STANDARD_MD,
  buildSyncLocalDocsPrompt,
  buildSyncAgentSessionPrompt,
} from "./integration-guide.js";

// ─── Shared MCP result helpers ──────────────────────────────
// Prefer these over inline `catch (err) → "mind_x error: ${err}"` in new
// tools: `ok` pretty-prints the payload, `err` flags isError so the agent
// knows to recover instead of hallucinating, and `apiDetail` surfaces the
// backend's human-readable detail sentence instead of a raw JSON body dump.

const err = (t: string) => ({
  content: [{ type: "text" as const, text: t }],
  isError: true,
});

const ok = (result: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
});

// Required-field guard for the generic action-dispatch tools (mind_mindmap,
// mind_moneymind, mind_budget, mind_sheets, mind_email, mind_checklists,
// mind_sign, mind_invoices, mind_books, mind_timer, mind_forms, mind_library).
// Returns an error string naming every missing field, or null when all are
// present — call sites do `const m = need(args, [...]); if (m) return err(m);`
const need = (args: Record<string, unknown>, fields: string[]): string | null => {
  const missing = fields.filter((f) => args[f] === undefined || args[f] === null || args[f] === "");
  return missing.length ? `Error: ${missing.join(", ")} required for this action.` : null;
};

// Backend detail strings beat raw JSON dumps: FastAPI returns
// {"detail": "..."} (or {"detail": {"message": "..."}}) — surface the
// human sentence, never the wire body (CLAUDE.md lesson #6).
const apiDetail = (e: MindApiError): string => {
  try {
    const parsed = JSON.parse(e.body) as { detail?: unknown };
    const d = parsed?.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object") {
      const msg = (d as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
  } catch {
    // not JSON — fall through to the raw body/status text
  }
  return e.body || e.statusText;
};

export function createMindMcpServer(client: MindClient): McpServer {
  const server = new McpServer(
    {
      name: "mind",
      version: "0.29.1",
    },
    {
      // Returned to every client in the MCP `initialize` response — the first
      // thing any connecting agent sees about how to integrate with MIND.
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  // ─── mind://integration-guide ───────────────────────────
  // The full integration playbook, readable on demand by any MCP client.
  server.registerResource(
    "integration-guide",
    "mind://integration-guide",
    {
      title: "MIND Integration Guide",
      description:
        "Complete playbook for integrating any AI agent with MIND — the three integration paths (MCP server, OpenClaw plugin, REST API), authentication, the session protocol, all 45 tools, REST endpoint mapping, and common recipes.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: INTEGRATION_GUIDE,
        },
      ],
    }),
  );

  // ─── mind://agent-standard ──────────────────────────────
  // The full MIND Agent Operating Standard (AGENTS.md, verbatim — see
  // AGENT_STANDARD_MD in ./integration-guide.ts for provenance and the
  // refresh recipe). SERVER_INSTRUCTIONS names this resource as mandatory
  // reading in its "═══ MANDATORY PROTOCOLS ═══" section so an unauthenticated
  // client sees the pointer even before it can read this resource.
  server.registerResource(
    "agent-standard",
    "mind://agent-standard",
    {
      title: "The MIND Agent Operating Standard",
      description:
        "The full, binding operating constitution for a MIND-connected agent (AGENTS.md, verbatim) — Law Zero, the boot protocol, session sync, the inactivity and termination protocols, the action-time gates, the sense catalog, and the memory contract. SERVER_INSTRUCTIONS names this as mandatory reading; this resource is the complete text.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: AGENT_STANDARD_MD,
        },
      ],
    }),
  );

  // ─── sync-local-docs-to-mind prompt ─────────────────────
  // Standard prompt shipped WITH the server so any connected agent can back
  // up the user's durable local documents into MIND without being taught
  // the procedure from scratch. Body lives in integration-guide.ts beside
  // SERVER_INSTRUCTIONS and INTEGRATION_GUIDE so all shipped copy is in one
  // place. MCP prompt arguments are always strings.
  server.registerPrompt(
    "sync-local-docs-to-mind",
    {
      title: "Sync local documents into MIND",
      description:
        "Back up every durable document on this machine into the user's MIND, skipping code, junk and secrets. Safe by default: reports what it would upload before uploading anything.",
      argsSchema: {
        root: z.string().optional().describe("Directory to scan. Default: the current working directory."),
        dry_run: z
          .string()
          .optional()
          .describe('"true" (default) reports the plan without writing. "false" performs the upload.'),
        since: z.string().optional().describe("Only consider files modified after this ISO date."),
      },
    },
    async ({ root, dry_run, since }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: buildSyncLocalDocsPrompt({ root, dry_run, since }),
          },
        },
      ],
    }),
  );

  // ─── sync-agent-session prompt ───────────────────────────
  // Standard prompt shipped WITH the server so any connected agent can adopt
  // the AGENT SESSION PROTOCOL (see integration-guide.ts) without being
  // taught the procedure from scratch. Body lives in integration-guide.ts
  // beside SERVER_INSTRUCTIONS and buildSyncLocalDocsPrompt so all shipped
  // copy is in one place — see AGENT_SESSION_PROTOCOL_BODY there, which is
  // also embedded verbatim in SERVER_INSTRUCTIONS and (compact) in the
  // mind_sessions tool description below, so a client that only reads tool
  // descriptions still follows it.
  server.registerPrompt(
    "sync-agent-session",
    {
      title: "Adopt the Agent Session Protocol",
      description:
        "Log this agent's live session into MIND Chat → Agents so Anthony can read and reply to it. Returns the full open/append/close/handoff protocol, addressed to your runtime.",
      argsSchema: {
        runtime: z.string().optional().describe('Your runtime name, e.g. "claude-code", "codex", "cursor". Default: "your runtime".'),
        source_key: z.string().optional().describe('The MIND Chat sidebar toggle you were assigned, e.g. "claude-code-1". Default: "your-source-key".'),
      },
    },
    async ({ runtime, source_key }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: buildSyncAgentSessionPrompt({ runtime, source_key }),
          },
        },
      ],
    }),
  );

  // ─── adopt-agent-standard prompt ─────────────────────────
  // Same content as the mind://agent-standard resource (AGENT_STANDARD_MD —
  // see integration-guide.ts for provenance and the refresh recipe), offered
  // as a prompt for clients that call prompts/get rather than reading MCP
  // resources. SERVER_INSTRUCTIONS points every connecting agent at whichever
  // of the two ("the resource ... or the adopt-agent-standard prompt") its
  // host actually supports.
  server.registerPrompt(
    "adopt-agent-standard",
    {
      title: "Adopt the MIND Agent Operating Standard",
      description:
        "Returns the full MIND Agent Operating Standard (AGENTS.md, verbatim) — Law Zero, the boot protocol, session sync, the inactivity and termination protocols, the action-time gates, the sense catalog, and the memory contract. Read this before acting on behalf of an owner for the first time.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: AGENT_STANDARD_MD,
          },
        },
      ],
    }),
  );

  // ─── mind_query ─────────────────────────────────────────
  // Semantic search across the user's knowledge graph.
  // Replaces flat MEMORY.md — returns only relevant memories.

  server.tool(
    "mind_query",
    "Search the user's MIND knowledge graph — their persistent memory of people, projects, decisions, outcomes and history. Returns RETRIEVED CONTEXT for YOU to read and synthesize — documents, entries, entities and relationships — NOT a finished answer. Does not use MIND's LLM and costs 0 credits. Call this before asserting anything about the user's world, and before saying something does not exist. (Pass retrieve_only=false to have MIND's own LLM write the answer instead, which spends credits.)\n\nHOW TO ASK — this changes answer quality more than any parameter. Ask a rich, specific, full-sentence question; \"what is X\" retrieves poorly. Best results come from retrieve-then-write in one ask: \"Find everything about X, Y and Z, then write <deliverable> in this shape: <template>. Use only what you found; mark anything missing as unknown and do not invent it.\" Name the thing you expect to find — a document title, a person, a project, a date range. If the first answer is thin, change the QUESTION, not the mode — chain a narrower ask.\n\nPICKING A MODE (mechanical): naive reads document text only — best for recalling an exact passage or wording. local walks a named entity and its immediate graph neighbours — best for one specific person, company or thing. global reasons over relationships and themes across the whole graph — best for cross-cutting patterns. hybrid combines local+global graph reasoning but reads no raw document text. mix adds raw document text on top of hybrid and is the most complete; reach for it when hybrid feels thin. hybrid is the default — drop to naive/local/global only when you specifically need that narrower lens.\n\nNEGATIVES ARE THE HIGHEST-RISK ANSWER. An empty or thin result means your query missed — it is never proof the thing does not exist. Before reporting that something is absent, re-ask with different wording and say what you searched.",
    {
      query: z.string().describe("What to search for in your knowledge graph"),
      mode: z
        .enum(["mix", "hybrid", "global", "local", "naive"])
        .optional()
        .default("hybrid")
        .describe("Search mode: hybrid (default, best results — combines semantic + graph traversal), mix (balanced), global (broad graph search), local (focused graph search), naive (simple vector search)"),
      retrieve_only: z
        .boolean()
        .optional()
        .default(true)
        .describe("Default true: return raw graph context for YOU to synthesize, 0 credits. Set false to have MIND's own LLM write the answer (spends credits)."),
    },
    async ({ query, mode, retrieve_only }) => {
      try {
        const result = await client.query({ query, mode, retrieve_only });
        const text = [
          result.response,
          "",
          `--- Sources: ${result.sources?.length ?? 0} | Credits used: ${result.credits_used} | Remaining: ${result.credits_remaining} ---`,
        ];

        if (result.sources?.length) {
          text.push("");
          for (const s of result.sources.slice(0, 5)) {
            text.push(`• ${s}`);
          }
        }

        return { content: [{ type: "text" as const, text: text.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error querying MIND: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_osint ─────────────────────────────────────────
  // Operate Ozzie, the Osiris OSINT analyst, from any MIND client.
  server.tool(
    "mind_osint",
    "Operate Ozzie — the autonomous OSINT analyst — through MIND. Investigate a target (domain, IP, org, person) and get a cited intelligence dossier; or set up live-feed alerts and watchlists in plain English. Ozzie's dossiers and alerts persist in its MIND knowledge graph, so use mind_query to recall past intelligence and mind_osint to run new work.",
    {
      action: z
        .enum(["investigate", "add_monitor", "list_monitors", "remove_monitor", "add_watchlist", "list_watchlist", "remove_watchlist"])
        .describe("investigate a target · add_monitor (NL live-feed alert) · list/remove monitors · add/list/remove watchlist"),
      target: z.string().optional().describe("Target for investigate / watchlist — a domain, IP, org, or person"),
      text: z.string().optional().describe("Natural-language monitor request, e.g. 'active fires in the USA' or 'earthquakes over magnitude 6'"),
      id: z.string().optional().describe("Monitor id (for remove_monitor)"),
    },
    async ({ action, target, text, id }) => {
      try {
        const result = (await client.osint({ action, target, text, id })) as Record<string, unknown>;
        const out = action === "investigate"
          ? ((result.dossier as string) || JSON.stringify(result, null, 2))
          : JSON.stringify(result, null, 2);
        return { content: [{ type: "text" as const, text: out }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error operating Ozzie (OSINT): ${err}` }], isError: true };
      }
    }
  );

  // ─── mind_remember ──────────────────────────────────────
  // Store/manage content in the knowledge graph. Auto-categorized by type.
  // Enhanced: now supports create, delete, search, get, list actions.

  server.tool(
    "mind_remember",
    "Store and manage content in your MIND knowledge graph. Use for facts, decisions, learnings, research, notes — anything worth remembering. Auto-categorized. Always log outcomes here after completing tasks. Supports create (default), delete, search, get, and list.\n\n⚠️ PRIVATE vs PUBLIC: `document` and `entry` are PRIVATE to the user's knowledge graph. `feed_post` is a PUBLIC social-media post that appears on the user's public feed for everyone to see. Default to `entry` for all agent outcomes, logs, decisions, and research. NEVER use `feed_post` unless the user explicitly says \"post\", \"share\", \"tweet\", \"feed\", or \"thought to my feed\" — deploy logs, PR notes, work outcomes, and agent activity belong in `entry`, NOT on the public feed.\n\nTitle rule: lessons are titled 'Lesson - Failure - <behavior>' / 'Lesson - Behavior - <behavior>' / 'Lesson - Win - <behavior>'; never put '/' or parentheses in a title, the card is derived from it.\n\nWRITE FOR THE AGENT WHO WILL SEARCH FOR THIS LATER — retrieval quality is decided here, not at query time. State facts in the words someone will later search for. Put the entity name in the first sentence. Inline dates, ids, file paths and numbers rather than saying \"the PR\" or \"yesterday\" — a note that only says \"fixed it\" is unfindable. If this supersedes an earlier note, say so explicitly and name what it replaces, so the older fact can be closed off instead of silently competing with this one.",
    {
      action: z
        .enum(["create", "delete", "search", "get", "list"])
        .optional()
        .default("create")
        .describe("Action: create (store new content — default), delete (remove by ID), search (find entries), get (retrieve by ID), list (paginated listing)"),
      content: z.string().optional().describe("What to remember — the actual content to store (required for create)"),
      type: z
        .enum(["document", "entry", "feed_post", "thought"])
        .optional()
        .default("entry")
        .describe(
          "Storage type. PRIVATE: `document` (long-form, structured — research, specs, strategies), `entry` (medium — observations, findings, action logs, agent outcomes — DEFAULT for agent work). PUBLIC: `feed_post` (a social-media-style post that appears on the user's PUBLIC feed for everyone to see — NEVER use unless the user explicitly said \"post\", \"share\", \"tweet\", \"feed\", or \"thought to my feed\"). `thought` is a deprecated alias for `feed_post` and behaves identically — prefer `feed_post` for clarity."
        ),
      title: z
        .string()
        .optional()
        .describe("Title for documents and entries (auto-generated if omitted for feed posts)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorization (e.g. ['strategy', 'competitor', 'learning'])"),
      source: z
        .string()
        .optional()
        .default("mcp-agent")
        .describe("Source identifier (e.g. 'claude-code', 'openclaw', 'cursor')"),
      item_id: z
        .string()
        .optional()
        .describe("Item ID for delete/get actions"),
      query: z
        .string()
        .optional()
        .describe("Search query for search action"),
      page: z
        .number()
        .optional()
        .describe("Page number for list action"),
      limit: z
        .number()
        .optional()
        .describe("Max items to return for list/search"),
    },
    async ({ action, content, type, title, tags, source, item_id, query, page, limit }) => {
      try {
        switch (action) {
          case "create": {
            if (!content) {
              return {
                content: [{ type: "text" as const, text: "Error: content is required to create" }],
                isError: true,
              };
            }

            let result: { id?: string; entry_id?: string; thought_id?: string; item_id?: string };
            let storedAs: string;

            switch (type) {
              case "document":
                result = await client.createDocument({
                  title: title ?? `Agent Document — ${new Date().toISOString().slice(0, 10)}`,
                  content,
                  source: source ?? "mcp-agent",
                });
                storedAs = "document";
                break;

              case "feed_post":
              case "thought":
                result = await client.createThought({ content });
                storedAs = "feed_post";
                break;

              case "entry":
              default:
                result = await client.createEntry({
                  title,
                  content,
                  tags,
                });
                storedAs = "entry";
                break;
            }

            const id = result.id ?? result.entry_id ?? result.thought_id ?? "unknown";
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Stored to MIND as ${storedAs} (id: ${id})${title ? ` — "${title}"` : ""}`,
                },
              ],
            };
          }

          case "delete": {
            if (!item_id) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id is required for delete" }],
                isError: true,
              };
            }
            switch (type) {
              case "document":
                await client.deleteDocument(item_id);
                break;
              case "feed_post":
              case "thought":
                await client.deleteThought(item_id);
                break;
              case "entry":
              default:
                await client.deleteEntry(item_id);
                break;
            }
            return {
              content: [{ type: "text" as const, text: `✅ Deleted ${type === "thought" ? "feed_post" : type} ${item_id}` }],
            };
          }

          case "search": {
            if (!query) {
              return {
                content: [{ type: "text" as const, text: "Error: query is required for search" }],
                isError: true,
              };
            }
            const result = await client.searchEntries(query, limit);
            const items = result.entries ?? [];
            if (items.length === 0) {
              return { content: [{ type: "text" as const, text: `No results for "${query}".` }] };
            }
            const lines = items.map(
              (e) =>
                `• ${e.title ?? "Untitled"} — ${e.content?.slice(0, 120) ?? ""}... (id: ${e.entry_id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "get": {
            if (!item_id) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id is required for get" }],
                isError: true,
              };
            }
            const result = await client.getEntry(item_id);
            const lines = [
              `**${result.title ?? "Untitled"}**`,
              `Type: ${result.entry_type ?? type} | Created: ${result.created_at ?? "unknown"}`,
              `Tags: ${result.tags?.join(", ") ?? "none"}`,
              "",
              result.content ?? "",
            ];
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "list": {
            switch (type) {
              case "document": {
                const result = await client.listDocuments(page ?? 1, limit ?? 20);
                const docs = result.documents ?? [];
                if (docs.length === 0) {
                  return { content: [{ type: "text" as const, text: "No documents found." }] };
                }
                const lines = docs.map(
                  (d) => `• ${d.title} (status: ${d.status}, source: ${d.source}) — id: ${d.id}`
                );
                return { content: [{ type: "text" as const, text: lines.join("\n") }] };
              }
              case "feed_post":
              case "thought": {
                const result = await client.listThoughts();
                const thoughts = result.thoughts ?? [];
                if (thoughts.length === 0) {
                  return { content: [{ type: "text" as const, text: "No feed posts found." }] };
                }
                const lines = thoughts.map(
                  (t) => `• ${t.content?.slice(0, 100)}... — id: ${t.id ?? t.thought_id}`
                );
                return { content: [{ type: "text" as const, text: lines.join("\n") }] };
              }
              case "entry":
              default: {
                const result = await client.listEntries(limit ?? 20);
                const entries = result.entries ?? [];
                if (entries.length === 0) {
                  return { content: [{ type: "text" as const, text: "No entries found." }] };
                }
                const lines = entries.map(
                  (e) => `• ${e.title ?? "Untitled"} (${e.entry_type ?? "text"}) — id: ${e.id ?? e.entry_id}`
                );
                return { content: [{ type: "text" as const, text: lines.join("\n") }] };
              }
            }
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error storing to MIND: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_folders ───────────────────────────────────────
  // Organize documents into folders. Folders are a presentation layer — the
  // knowledge graph still indexes every document regardless of folder.

  server.tool(
    "mind_folders",
    "Organize your MIND documents into folders. Folders are a presentation layer — the knowledge graph still indexes and retrieves across every document regardless of folder. Use mind_remember to create a document, then mind_folders move_documents to file it. Actions: list, create, rename, move, delete, move_documents, set_hint, secure, unsecure, unlock, reset_request, reset (Secure Folders — password-gate a folder).",
    {
      action: z
        .enum([
          "list",
          "create",
          "rename",
          "move",
          "delete",
          "move_documents",
          "set_hint",
          "secure",
          "unsecure",
          "unlock",
          "reset_request",
          "reset",
        ])
        .describe(
          "list (all folders + counts + routing hints + secure/locked flags), create (new folder; pass routing_hint to enable agent-routing), rename (change a folder's name), move (re-nest a folder), delete (remove a folder — its documents and subfolders move up a level, nothing is deleted), move_documents (file documents into a folder), set_hint (write/clear the routing_hint that mind_folder_suggest reads), secure (password-gate folder_id — pass passphrase; changing an existing passphrase needs an active unlock first), unsecure (turn off secure mode — needs an active unlock), unlock (verify passphrase, mints a 15-minute unlock kept in memory for this session and sent on every later call), reset_request (email a one-time reset link to the account email), reset (complete a reset — pass token + new_passphrase)",
        ),
      name: z.string().optional().describe("Folder name — required for create and rename"),
      folder_id: z
        .string()
        .optional()
        .describe(
          "Folder id — the folder to rename/move/delete/set_hint/secure/unsecure/unlock/reset_request/reset, or the destination for move_documents (omit or pass 'root' to file documents at the top level)",
        ),
      parent_id: z
        .string()
        .optional()
        .describe("Parent folder id for create and move. Omit or pass 'root' for the top level"),
      doc_ids: z
        .array(z.string())
        .optional()
        .describe("Document ids to file — required for move_documents"),
      routing_hint: z
        .string()
        .optional()
        .describe(
          "Free-text instruction answering \"when should MIND save things to this folder?\". Read by mind_folder_suggest to LLM-route new content. Pass on create to set up-front; pass on set_hint to update. Pass empty string to clear (disables the folder from auto-routing).",
        ),
      passphrase: z
        .string()
        .optional()
        .describe("Folder passphrase — required for secure and unlock"),
      new_passphrase: z
        .string()
        .optional()
        .describe("New passphrase — required for reset"),
      token: z
        .string()
        .optional()
        .describe("One-time reset token from the reset email — required for reset"),
      unlock_token: z
        .string()
        .optional()
        .describe(
          "Pass the exact `unlock_token` string returned by a prior 'unlock' call here to carry a 15-minute unlock into a later 'secure' (passphrase change) or 'unsecure' call. Not needed for the first time a folder is secured, and not used by list/create/rename/move/delete/move_documents/set_hint/unlock/reset_request/reset. This stdio server keeps unlock tokens in memory for the whole session and normally attaches them automatically (see 'unlock'), so passing this explicitly is usually redundant — but when supplied it takes precedence over the remembered token, so the same request shape works on both this server and the hosted MCP.",
        ),
    },
    async ({ action, name, folder_id, parent_id, doc_ids, routing_hint, passphrase, new_passphrase, token, unlock_token }) => {
      try {
        switch (action) {
          case "list": {
            const res = await client.listFolders();
            if (!res.folders.length) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `No folders yet. ${res.unfiled_count} document(s), all at the top level. Create one with action 'create'.`,
                  },
                ],
              };
            }
            const byId = new Map(res.folders.map((f) => [f.id, f]));
            const lines = res.folders.map((f) => {
              const parent = f.parent_id ? byId.get(f.parent_id)?.name ?? "?" : "(top level)";
              const hint = (f.routing_hint || "").trim();
              const hintTail = hint ? ` · hint: ${hint.length > 80 ? hint.slice(0, 80) + "…" : hint}` : "";
              const secureTail = f.secure ? (f.locked ? " · 🔒 secure (locked)" : " · 🔓 secure (unlocked)") : "";
              return `• ${f.name} — ${f.document_count ?? 0} doc(s) · id: ${f.id} · parent: ${parent}${hintTail}${secureTail}`;
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: [
                    `${res.folders.length} folder(s) · ${res.unfiled_count} unfiled · ${res.total_count} total documents`,
                    "",
                    ...lines,
                  ].join("\n"),
                },
              ],
            };
          }
          case "create": {
            if (!name) throw new Error("'name' is required to create a folder");
            const res = await client.createFolder(name, parent_id ?? null, routing_hint);
            return {
              content: [
                { type: "text" as const, text: `Created folder "${res.folder.name}" (id: ${res.folder.id})${routing_hint ? " · routing hint set" : ""}` },
              ],
            };
          }
          case "rename": {
            if (!folder_id) throw new Error("'folder_id' is required to rename a folder");
            if (!name) throw new Error("'name' is required to rename a folder");
            const res = await client.updateFolder(folder_id, { name });
            return {
              content: [{ type: "text" as const, text: `Renamed folder to "${res.folder.name}"` }],
            };
          }
          case "move": {
            if (!folder_id) throw new Error("'folder_id' is required to move a folder");
            // Always send parent_id explicitly (id or null) so the move applies.
            const res = await client.updateFolder(folder_id, { parent_id: parent_id ?? null });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Moved folder "${res.folder.name}" ${
                    res.folder.parent_id ? "into another folder" : "to the top level"
                  }`,
                },
              ],
            };
          }
          case "delete": {
            if (!folder_id) throw new Error("'folder_id' is required to delete a folder");
            const res = await client.deleteFolder(folder_id);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Deleted folder. ${res.documents_reparented} document(s) moved up a level — no documents were deleted.`,
                },
              ],
            };
          }
          case "move_documents": {
            if (!doc_ids || !doc_ids.length)
              throw new Error("'doc_ids' is required for move_documents");
            const dest = !folder_id || folder_id === "root" ? null : folder_id;
            const res = await client.moveDocuments(doc_ids, dest);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Moved ${res.moved} document(s) ${dest ? "into the folder" : "to the top level"}`,
                },
              ],
            };
          }
          case "set_hint": {
            if (!folder_id) throw new Error("'folder_id' is required to set a routing hint");
            if (routing_hint === undefined)
              throw new Error("'routing_hint' is required for set_hint (pass empty string to clear)");
            const res = await client.updateFolder(folder_id, { routing_hint });
            const cleared = !routing_hint.trim();
            return {
              content: [
                {
                  type: "text" as const,
                  text: cleared
                    ? `Cleared routing hint on "${res.folder.name}" — folder is no longer auto-routed.`
                    : `Routing hint set on "${res.folder.name}". mind_folder_suggest will now consider this folder.`,
                },
              ],
            };
          }
          case "secure": {
            if (!folder_id) throw new Error("'folder_id' is required to secure a folder");
            if (!passphrase) throw new Error("'passphrase' is required to secure a folder");
            const res = await client.secureFolder(folder_id, passphrase, unlock_token);
            return {
              content: [
                { type: "text" as const, text: `Folder ${res.folder_id} is now secure. Unlock it with action 'unlock' before reading its contents.` },
              ],
            };
          }
          case "unsecure": {
            if (!folder_id) throw new Error("'folder_id' is required to unsecure a folder");
            const res = await client.unsecureFolder(folder_id, unlock_token);
            client.clearSecureFolderUnlockToken(folder_id);
            return {
              content: [{ type: "text" as const, text: `Folder ${res.folder_id} is no longer secure.` }],
            };
          }
          case "unlock": {
            if (!folder_id) throw new Error("'folder_id' is required to unlock a folder");
            if (!passphrase) throw new Error("'passphrase' is required to unlock a folder");
            const res = await client.unlockFolder(folder_id, passphrase);
            client.setSecureFolderUnlockToken(folder_id, res.unlock_token);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Unlocked. Expires at ${res.expires_at} (15 minutes) — every mind_query / mind_folders / document call this session will see inside it until then.`,
                },
              ],
            };
          }
          case "reset_request": {
            if (!folder_id) throw new Error("'folder_id' is required to request a passphrase reset");
            const res = await client.requestFolderReset(folder_id);
            return {
              content: [
                {
                  type: "text" as const,
                  text: res.status === "sent"
                    ? `Reset email sent to the account's email address (expires in 15 minutes).`
                    : `Reset requested, but email delivery is not configured on this deployment.`,
                },
              ],
            };
          }
          case "reset": {
            if (!folder_id) throw new Error("'folder_id' is required to reset a passphrase");
            if (!token) throw new Error("'token' (from the reset email) is required to reset a passphrase");
            if (!new_passphrase) throw new Error("'new_passphrase' is required to reset a passphrase");
            const res = await client.resetFolder(folder_id, token, new_passphrase);
            client.clearSecureFolderUnlockToken(folder_id);
            return {
              content: [
                { type: "text" as const, text: `Passphrase reset for folder ${res.folder_id}. Unlock it with the new passphrase.` },
              ],
            };
          }
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error managing folders: ${err}` }],
          isError: true,
        };
      }
    },
  );

  // ─── mind_folder_routes ─────────────────────────────────
  // Deterministic per-source_type system-folder routing. Configure once
  // and every life_item / crm / chat-save / etc. lands in its designated
  // folder automatically. ``apply_recommended`` is the one-tap setup.

  server.tool(
    "mind_folder_routes",
    "Configure deterministic system-folder routing — which folder each kind of system-generated doc (life items, CRM, chat saves, tasks, training, reasoning trajectories, playbooks, trader signals, cloud imports) is filed into automatically. Actions: list, set, clear, apply_recommended (idempotent one-tap setup that creates Life/CRM/Chats/Reasoning/Trader folders and wires every source_type to its destination). User uploads are unaffected — this is system writes only.",
    {
      action: z
        .enum(["list", "set", "clear", "apply_recommended"])
        .describe(
          "list (current routing table + every supported source_type with label/description), set (route one source_type to a folder), clear (remove a route — that source_type goes to the top level again), apply_recommended (create Life/CRM/Chats/Reasoning/Trader folders if missing and wire all routes; idempotent and safe to re-run)",
        ),
      source_type: z
        .string()
        .optional()
        .describe(
          "Required for set and clear. Canonical values: life_item, task, crm, chat, training, trajectory, playbook, trader, document. Custom values accepted (the route will fire whenever save_document_record is called with that source_type).",
        ),
      folder_id: z
        .string()
        .optional()
        .describe("Required for set — the folder id to route this source_type into."),
    },
    async ({ action, source_type, folder_id }) => {
      try {
        switch (action) {
          case "list": {
            const res = await client.listFolderRoutes();
            const folders = await client.listFolders();
            const folderById = new Map(folders.folders.map((f) => [f.id, f]));
            const lines = res.categories.map((cat) => {
              const fid = res.routes[cat.source_type];
              const folder = fid ? folderById.get(fid) : null;
              const dest = folder
                ? `→ ${folder.name} (id: ${fid})`
                : "→ (unrouted — files at top level)";
              return `• ${cat.label} [${cat.source_type}] ${dest}\n  ${cat.description}`;
            });
            const configured = Object.keys(res.routes).length;
            return {
              content: [
                {
                  type: "text" as const,
                  text: [
                    `${configured}/${res.categories.length} routes configured.`,
                    "",
                    ...lines,
                  ].join("\n"),
                },
              ],
            };
          }
          case "set": {
            if (!source_type) throw new Error("'source_type' is required");
            if (!folder_id) throw new Error("'folder_id' is required for set");
            await client.setFolderRoute(source_type, folder_id);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Routed source_type "${source_type}" → folder ${folder_id}. Future writes of that type will file there automatically.`,
                },
              ],
            };
          }
          case "clear": {
            if (!source_type) throw new Error("'source_type' is required");
            await client.clearFolderRoute(source_type);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Cleared route for "${source_type}". Future writes of that type land at the top level.`,
                },
              ],
            };
          }
          case "apply_recommended": {
            const res = await client.applyRecommendedFolders();
            const lines: string[] = [];
            if (res.created.length) lines.push(`Created: ${res.created.join(", ")}`);
            if (res.reused.length) lines.push(`Reused: ${res.reused.join(", ")}`);
            if (res.hint_updated.length)
              lines.push(`Hints filled: ${res.hint_updated.join(", ")}`);
            lines.push("");
            lines.push(`${res.routes_set.length} routes set:`);
            for (const r of res.routes_set) {
              lines.push(`  • ${r.source_type} → ${r.folder_name}`);
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error managing folder routes: ${err}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── mind_folder_suggest ─────────────────────────────────
  // LLM-driven content-aware folder picker. Reads every folder's
  // routing_hint and chooses the best match (or null when nothing fits).

  server.tool(
    "mind_folder_suggest",
    "Ask MIND which folder a piece of content belongs in. Reads every folder's routing_hint (set via mind_folders set_hint) and uses a cheap LLM to pick the best match. Returns folder_id=null when no folder's hint clearly applies — in that case leave the doc unfiled rather than guess. Typical agent flow: suggest → mind_remember (create the doc) → mind_folders move_documents (file it to the suggested folder).",
    {
      content: z
        .string()
        .describe("The text of the new document you're about to file. The picker reads it against every folder's routing_hint."),
      title: z
        .string()
        .optional()
        .describe("Optional title — helps the picker disambiguate short content."),
    },
    async ({ content, title }) => {
      try {
        const res = await client.suggestFolder(content, title);
        if (!res.folder_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No folder match — ${res.reason}\n\nLeave the doc unfiled or call mind_folder_routes apply_recommended to set up the default folder layout.`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Suggested folder: ${res.folder_name} (id: ${res.folder_id})`,
                `Confidence: ${Math.round(res.confidence * 100)}%`,
                `Reason: ${res.reason}`,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error suggesting folder: ${err}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ─── mind_context ───────────────────────────────────────
  // Get structured always-loaded context.
  // Equivalent to OpenClaw's SOUL.md + USER.md + AGENTS.md bootstrap injection,
  // but backed by the knowledge graph.

  server.tool(
    "mind_context",
    "Load the user's persistent context from MIND at session start — identity, preferences, operating rules, current priorities and recent activity. Returns RETRIEVED CONTEXT for YOU to synthesize, NOT a finished briefing. Does not use MIND's LLM and costs 0 credits. Call this at the start of every session.\n\nPass only the `sections` you actually need for the task at hand — a focused payload measurably outperforms the full default set, because the model attends better to fewer, more relevant facts. Every fact carries a date; when two facts conflict, the newer one wins, and say so if you rely on it. An empty `recent` section means nothing was logged, not that nothing happened — follow up with mind_query before assuming a quiet day. This is a snapshot, not the whole graph; for anything specific, follow up with mind_query.",
    {
      sections: z
        .array(z.enum(["soul", "user", "rules", "priorities", "recent"]))
        .optional()
        .default(["soul", "user", "rules", "priorities", "recent"])
        .describe(
          "Which context sections to load: soul (identity/personality), user (who the user is), rules (operating constraints), priorities (current goals/tasks), recent (latest activity)"
        ),
    },
    async ({ sections }) => {
      try {
        const sectionQueries: Record<string, string> = {
          soul: "my identity, mission, personality, who I am, my role and purpose",
          user: "user profile, preferences, timezone, communication style, who is the user",
          rules: "operating rules, constraints, hard limits, things I must never do, safety rules",
          priorities: "current priorities, active goals, top tasks, what to focus on right now",
          recent: "most recent activity, what happened today, latest outcomes and decisions",
        };

        const responses = await Promise.all(
          sections.map((section) =>
            client.query({ query: sectionQueries[section], mode: "mix", retrieve_only: true }).then((r) => ({
              section,
              text: r.response,
            }))
          )
        );

        const results = responses.map((r) => `## ${r.section.toUpperCase()}\n\n${r.text}`);

        return {
          content: [{ type: "text" as const, text: results.join("\n\n---\n\n") }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error loading context from MIND: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_life ──────────────────────────────────────────
  // Read/write goals, projects, tasks, calendar events, stats.
  // Enhanced: calendar CRUD, stats, move, get.

  server.tool(
    "mind_life",
    "Manage Focus → Project → Outcome hierarchy + calendar in MIND Life. Items are either projects (top-level domain/client buckets that live inside a Focus) or outcomes (deliverables that live under a parent project). Use `item_type` + `parent_id` + `focus_id` on create/update to wire the hierarchy. Use list filters (item_type, parent_id, focus_id, top_level_only) to slice the board. Share a project with another MIND account using share/list_shares/revoke_share (requires LIFE_SHARING_ENABLED on the backend; grantee gets the project + its outcomes on their board).",
    {
      action: z
        .enum([
          "list", "create", "update", "complete", "delete", "bulk_delete", "move", "get",
          "calendar_list", "calendar_create", "calendar_update", "calendar_delete",
          "stats",
          "share", "list_shares", "revoke_share",
        ])
        .describe("What to do: list/create/update/complete/delete/bulk_delete/move/get items, calendar_list/calendar_create/calendar_update/calendar_delete events, stats (productivity overview), share (grant another MIND account access to a project) / list_shares (who a project is shared with) / revoke_share (drop a grant)"),
      title: z.string().optional().describe("Title for new items or calendar events"),
      description: z.string().optional().describe("Description for new items"),
      status: z
        .string()
        .optional()
        .describe("Status filter for list, or new status for update (e.g. action, someday, waiting, completed)"),
      priority: z
        .string()
        .optional()
        .describe("Priority: low, medium, high, urgent"),
      due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
      item_id: z.string().optional().describe("Item ID for update/complete/delete/move/get actions"),
      item_ids: z.array(z.string()).optional().describe("Item IDs for bulk_delete (1–200 IDs deleted in one call)"),
      start_time: z.string().optional().describe("Start time for calendar events (ISO 8601)"),
      end_time: z.string().optional().describe("End time for calendar events (ISO 8601)"),
      event_id: z.string().optional().describe("Event ID for calendar_update/calendar_delete"),
      all_day: z.boolean().optional().describe("Whether the calendar event is all-day"),
      tags: z.array(z.string()).optional().describe("Tags for the life item (free-form strings). On update, REPLACES the existing tag list — pass the full new set."),
      color: z
        .enum(["default", "red", "orange", "yellow", "green", "blue", "purple", "pink"])
        .optional()
        .describe("Left-border color stripe on the board card. Use to group items (e.g. Astra=red, Atlas=blue)."),
      target_date: z.string().optional().describe("Target completion date in YYYY-MM-DD format — when the project should be done. Powers the countdown badge on the card."),
      item_type: z
        .enum(["project", "outcome"])
        .optional()
        .describe("'project' (top-level domain/client bucket; lives inside a Focus) or 'outcome' (deliverable under a parent project). Defaults to 'outcome' on create. Pass on list to filter."),
      parent_id: z
        .string()
        .optional()
        .describe("For outcomes — the item_id of the parent project. Pass empty string on update to detach (make top-level). On list, pass an item_id to fetch its outcomes, or 'none' for items with no parent."),
      focus_id: z
        .string()
        .optional()
        .describe("For projects — the focus_id this project belongs to. Pass empty string on update to detach (No Focus). On list, pass a focus_id to filter to that focus, or 'none' for unfiled projects."),
      agent_ids: z.array(z.string()).optional().describe("Agents bound to this project (project only). On update, REPLACES the existing list."),
      workflow_ids: z.array(z.string()).optional().describe("Workflows bound to this project (project only). On update, REPLACES the existing list."),
      top_level_only: z.boolean().optional().describe("On list — true returns only items with no parent (board roots: projects + unassigned outcomes)."),
      include_completed: z.boolean().optional().describe("On list — false hides completed items. Defaults true."),
      limit: z.number().int().min(1).max(500).optional().describe("On list — max items to return (1–500, default 30)."),
      grantee_username: z.string().optional().describe("Username to grant access to (action=share). Must be an existing MIND account."),
      share_role: z
        .enum(["owner", "viewer"])
        .optional()
        .describe("Role for the grant (action=share). 'owner' = full control over the project + its outcomes. 'viewer' = read-only. Default: viewer."),
      share_id: z.string().optional().describe("Share-grant id to revoke (action=revoke_share). Get it from action=list_shares."),
    },
    async ({ action, title, description, status, priority, due_date, item_id, item_ids, start_time, end_time, event_id, all_day, tags, color, target_date, item_type, parent_id, focus_id, agent_ids, workflow_ids, top_level_only, include_completed, limit, grantee_username, share_role, share_id }) => {
      try {
        switch (action) {
          case "list": {
            const result = await client.listLifeItems({
              status,
              item_type,
              parent_id,
              focus_id,
              top_level_only,
              include_completed,
              limit,
            });
            const items = result.items ?? [];
            if (items.length === 0) {
              return { content: [{ type: "text" as const, text: "No life items found." }] };
            }
            const lines = items.map((i) => {
              const tag = i.item_type === "project" ? "📁 project" : "🎯 outcome";
              const parts = [`[${i.priority ?? "—"}] ${tag} ${i.title}`];
              parts.push(`status: ${i.status ?? "—"}`);
              if (i.due_date) parts.push(`due: ${i.due_date}`);
              if (i.item_type === "project") {
                if (i.focus_id) parts.push(`focus: ${i.focus_id}`);
                if (typeof i.subtask_count === "number") parts.push(`outcomes: ${i.subtasks_completed ?? 0}/${i.subtask_count}`);
              } else if (i.parent_id) {
                parts.push(`parent: ${i.parent_id}`);
              }
              return `• ${parts.join(" · ")} — id: ${i.item_id}`;
            });
            const header = typeof result.total === "number" ? `Showing ${items.length} of ${result.total} items.` : null;
            return {
              content: [{ type: "text" as const, text: [header, ...lines].filter(Boolean).join("\n") }],
            };
          }

          case "create": {
            if (!title) {
              return {
                content: [{ type: "text" as const, text: "Error: title is required to create a life item" }],
                isError: true,
              };
            }
            const result = await client.createLifeItem({
              title,
              description,
              status: status ?? "action",
              priority: priority ?? "medium",
              due_date,
              tags,
              color,
              target_date,
              item_type,
              parent_id,
              focus_id,
              agent_ids,
              workflow_ids,
            });
            const extras: string[] = [];
            if (result.item_type) extras.push(`type: ${result.item_type}`);
            if (result.parent_id) extras.push(`parent: ${result.parent_id}`);
            if (result.focus_id) extras.push(`focus: ${result.focus_id}`);
            if (result.tags && result.tags.length > 0) extras.push(`tags: ${result.tags.join(", ")}`);
            if (result.color && result.color !== "default") extras.push(`color: ${result.color}`);
            if (result.target_date) extras.push(`target: ${result.target_date}`);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Created life item: "${result.title}" (id: ${result.item_id}, priority: ${result.priority}, due: ${result.due_date ?? "none"}${extras.length ? `, ${extras.join(", ")}` : ""})`,
                },
              ],
            };
          }

          case "update": {
            if (!item_id) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id is required for update" }],
                isError: true,
              };
            }
            const patch: Record<string, unknown> = {};
            if (title) patch.title = title;
            if (description !== undefined) patch.description = description;
            if (status) patch.status = status;
            if (priority) patch.priority = priority;
            if (due_date !== undefined) patch.due_date = due_date;
            if (tags) patch.tags = tags;
            if (color) patch.color = color;
            if (target_date !== undefined) patch.target_date = target_date;
            if (item_type !== undefined) patch.item_type = item_type;
            // parent_id / focus_id: pass empty string explicitly to clear; pass undefined to leave unchanged
            if (parent_id !== undefined) patch.parent_id = parent_id;
            if (focus_id !== undefined) patch.focus_id = focus_id;
            if (agent_ids !== undefined) patch.agent_ids = agent_ids;
            if (workflow_ids !== undefined) patch.workflow_ids = workflow_ids;
            const result = await client.updateLifeItem(item_id, patch);
            const extras: string[] = [];
            if (result.item_type) extras.push(`type: ${result.item_type}`);
            if (result.parent_id) extras.push(`parent: ${result.parent_id}`);
            if (result.focus_id) extras.push(`focus: ${result.focus_id}`);
            if (result.tags && result.tags.length > 0) extras.push(`tags: ${result.tags.join(", ")}`);
            if (result.color && result.color !== "default") extras.push(`color: ${result.color}`);
            if (result.target_date) extras.push(`target: ${result.target_date}`);
            return {
              content: [{ type: "text" as const, text: `✅ Updated: "${result.title}" (status: ${result.status}${extras.length ? `, ${extras.join(", ")}` : ""})` }],
            };
          }

          case "complete": {
            if (!item_id) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id is required for complete" }],
                isError: true,
              };
            }
            const result = await client.updateLifeItem(item_id, { status: "completed" });
            return {
              content: [{ type: "text" as const, text: `✅ Completed: "${result.title}"` }],
            };
          }

          case "delete": {
            if (!item_id) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id is required for delete" }],
                isError: true,
              };
            }
            await client.deleteLifeItem(item_id);
            return {
              content: [{ type: "text" as const, text: `✅ Deleted life item ${item_id}` }],
            };
          }

          case "bulk_delete": {
            if (!item_ids || item_ids.length === 0) {
              return {
                content: [{ type: "text" as const, text: "Error: item_ids (a non-empty array of IDs) is required for bulk_delete" }],
                isError: true,
              };
            }
            const result = await client.bulkDeleteLifeItems(item_ids);
            const lines = [
              `✅ Bulk delete complete — ${result.deleted_count} life item(s) deleted.`,
            ];
            if (result.not_found.length > 0) {
              lines.push(
                `⚠️ ${result.not_found.length} id(s) skipped (not found / not yours): ${result.not_found.join(", ")}`
              );
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "move": {
            if (!item_id || !status) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id and status are required for move" }],
                isError: true,
              };
            }
            const result = await client.moveLifeItem(item_id, status);
            return {
              content: [{ type: "text" as const, text: `✅ Moved "${result.title}" to ${result.status}` }],
            };
          }

          case "get": {
            if (!item_id) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id is required for get" }],
                isError: true,
              };
            }
            const result = await client.getLifeItem(item_id);
            const r = result as any;
            const lines = [
              `**${result.title}** (id: ${result.item_id})`,
              `Status: ${result.status ?? "—"} | Priority: ${result.priority ?? "—"} | Due: ${result.due_date ?? "none"}`,
              `Type: ${r.item_type ?? "outcome"}${r.parent_id ? ` | Parent: ${r.parent_id}` : ""}${r.focus_id ? ` | Focus: ${r.focus_id}` : ""}`,
            ];
            if (r.item_type === "project" && typeof r.subtask_count === "number") {
              lines.push(`Outcomes: ${r.subtasks_completed ?? 0}/${r.subtask_count} complete`);
            }
            if (r.agent_ids && r.agent_ids.length > 0) lines.push(`Agents: ${r.agent_ids.join(", ")}`);
            if (r.workflow_ids && r.workflow_ids.length > 0) lines.push(`Workflows: ${r.workflow_ids.join(", ")}`);
            if (r.color && r.color !== "default") lines.push(`Color: ${r.color}`);
            if (r.target_date) lines.push(`Target: ${r.target_date}`);
            if (r.tags && r.tags.length > 0) lines.push(`Tags: ${r.tags.join(", ")}`);
            if (result.description) lines.push(`\n${result.description}`);
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "calendar_list": {
            const result = await client.listCalendarEvents();
            const events = result.events ?? [];
            if (events.length === 0) {
              return { content: [{ type: "text" as const, text: "No calendar events found." }] };
            }
            const lines = events.map(
              (e) =>
                `• ${e.title}${e.all_day ? " (all day)" : ""} — ${e.start_time ?? ""}${e.end_time ? ` to ${e.end_time}` : ""} — id: ${e.event_id}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "calendar_create": {
            if (!title || !start_time) {
              return {
                content: [{ type: "text" as const, text: "Error: title and start_time are required for calendar_create" }],
                isError: true,
              };
            }
            const result = await client.createCalendarEvent({
              title,
              description,
              start_time,
              end_time,
              all_day,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Created calendar event: "${result.title}" (id: ${result.event_id})`,
                },
              ],
            };
          }

          case "calendar_update": {
            if (!event_id) {
              return {
                content: [{ type: "text" as const, text: "Error: event_id is required for calendar_update" }],
                isError: true,
              };
            }
            const patch: Record<string, unknown> = {};
            if (title) patch.title = title;
            if (description) patch.description = description;
            if (start_time) patch.start_time = start_time;
            if (end_time) patch.end_time = end_time;
            if (all_day !== undefined) patch.all_day = all_day;
            const result = await client.updateCalendarEvent(event_id, patch);
            return {
              content: [{ type: "text" as const, text: `✅ Updated calendar event: "${result.title}"` }],
            };
          }

          case "calendar_delete": {
            if (!event_id) {
              return {
                content: [{ type: "text" as const, text: "Error: event_id is required for calendar_delete" }],
                isError: true,
              };
            }
            await client.deleteCalendarEvent(event_id);
            return {
              content: [{ type: "text" as const, text: `✅ Deleted calendar event ${event_id}` }],
            };
          }

          case "stats": {
            const result = await client.lifeStats();
            const lines = [
              "📊 MIND Life Stats",
              `• Total items: ${result.total_items}`,
              `• Completion rate: ${(result.completion_rate * 100).toFixed(1)}%`,
            ];
            if (result.status_counts) {
              for (const [status, count] of Object.entries(result.status_counts)) {
                lines.push(`• ${status}: ${count}`);
              }
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "share": {
            if (!item_id || !grantee_username) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id (project id) and grantee_username are required for share" }],
                isError: true,
              };
            }
            const role: "owner" | "viewer" = (share_role as "owner" | "viewer" | undefined) ?? "viewer";
            const grant = await client.addLifeShare(item_id, grantee_username, role);
            const label = grant.grantee_label && grant.grantee_label !== grant.grantee_username
              ? `${grant.grantee_label} (@${grant.grantee_username})`
              : `@${grant.grantee_username}`;
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Shared project "${grant.project_title ?? grant.project_id}" with ${label} as ${grant.role} (share id: ${grant.id})`,
                },
              ],
            };
          }

          case "list_shares": {
            if (!item_id) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id (project id) is required for list_shares" }],
                isError: true,
              };
            }
            const result = await client.listLifeShares(item_id);
            const shares = result.shares ?? [];
            if (shares.length === 0) {
              return { content: [{ type: "text" as const, text: "No shares on this project yet." }] };
            }
            const lines = shares.map((s) => {
              const label = s.grantee_label && s.grantee_label !== s.grantee_username
                ? `${s.grantee_label} (@${s.grantee_username})`
                : `@${s.grantee_username}`;
              return `• ${label} — ${s.role}${s.granted_by ? ` (granted by @${s.granted_by})` : ""} — id: ${s.id}`;
            });
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "revoke_share": {
            if (!item_id || !share_id) {
              return {
                content: [{ type: "text" as const, text: "Error: item_id (project id) and share_id are required for revoke_share. Get the share_id from action=list_shares." }],
                isError: true,
              };
            }
            await client.revokeLifeShare(item_id, share_id);
            return {
              content: [{ type: "text" as const, text: `✅ Revoked share ${share_id} on project ${item_id}` }],
            };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_life: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_focuses ──────────────────────────────────────
  // Top of the Focus → Project → Outcome → Task hierarchy.
  // A Focus is a per-user bucket that groups multiple Life Projects, and
  // can carry shared agents/workflows that apply to every project inside.

  server.tool(
    "mind_focuses",
    "Manage Focuses — the top-level buckets that group Life Projects. Every project lives inside one focus (or 'No Focus'). Use list to see all focuses + their project counts, create to add a new bucket (e.g. 'Astra', 'Atlas', 'Fundraising'), update/delete to maintain them. Pass the returned focus_id to mind_life when creating projects.",
    {
      action: z
        .enum(["list", "get", "create", "update", "delete"])
        .describe("list/get/create/update/delete focuses. 'delete' soft-archives by default; pass hard=true to remove permanently."),
      focus_id: z.string().optional().describe("Focus id — required for get/update/delete"),
      name: z.string().optional().describe("Display name — required for create"),
      description: z.string().optional().describe("Long-form description"),
      color: z
        .enum(["default", "red", "orange", "yellow", "green", "blue", "purple", "pink"])
        .optional()
        .describe("Color stripe used in the UI"),
      icon: z.string().optional().describe("Lucide icon name (e.g. 'briefcase', 'rocket'). Defaults to 'folder'."),
      position: z.number().int().optional().describe("Sort position (lower = earlier)"),
      agent_ids: z.array(z.string()).optional().describe("Agents bound to every project inside this focus. On update, REPLACES the existing list."),
      workflow_ids: z.array(z.string()).optional().describe("Workflows bound to every project inside this focus. On update, REPLACES the existing list."),
      include_archived: z.boolean().optional().describe("On list — true to include archived focuses (default false)"),
      hard: z.boolean().optional().describe("On delete — true to remove permanently (default false = soft archive)"),
    },
    async ({ action, focus_id, name, description, color, icon, position, agent_ids, workflow_ids, include_archived, hard }) => {
      try {
        switch (action) {
          case "list": {
            const result = await client.listFocuses(include_archived ?? false);
            const focuses = result.focuses ?? [];
            if (focuses.length === 0 && (result.unfiled_project_count ?? 0) === 0) {
              return { content: [{ type: "text" as const, text: "No focuses yet. Create one with action='create'." }] };
            }
            const lines = focuses.map((f) => {
              const c = f.color && f.color !== "default" ? ` (${f.color})` : "";
              const counts = `${f.project_count_active ?? 0} active / ${f.project_count ?? 0} total`;
              return `• 📁 ${f.name}${c} — ${counts} projects — id: ${f.focus_id}`;
            });
            if (typeof result.unfiled_project_count === "number" && result.unfiled_project_count > 0) {
              lines.push(`• 🗂  No Focus — ${result.unfiled_project_count} unfiled project(s)`);
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "get": {
            if (!focus_id) {
              return { content: [{ type: "text" as const, text: "Error: focus_id is required for get" }], isError: true };
            }
            const f = await client.getFocus(focus_id);
            const lines = [
              `**${f.name}** (id: ${f.focus_id})`,
              `Color: ${f.color ?? "default"} | Icon: ${f.icon ?? "folder"} | Position: ${f.position ?? 0}`,
              `Projects: ${f.project_count_active ?? 0} active / ${f.project_count_completed ?? 0} completed / ${f.project_count ?? 0} total`,
            ];
            if (f.agent_ids && f.agent_ids.length > 0) lines.push(`Agents: ${f.agent_ids.join(", ")}`);
            if (f.workflow_ids && f.workflow_ids.length > 0) lines.push(`Workflows: ${f.workflow_ids.join(", ")}`);
            if (f.archived_at) lines.push(`Archived at: ${f.archived_at}`);
            if (f.description) lines.push(`\n${f.description}`);
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "create": {
            if (!name) {
              return { content: [{ type: "text" as const, text: "Error: name is required to create a focus" }], isError: true };
            }
            const f = await client.createFocus({
              name,
              description,
              color,
              icon,
              position,
              agent_ids,
              workflow_ids,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Created focus: "${f.name}" (id: ${f.focus_id}, color: ${f.color ?? "default"}, icon: ${f.icon ?? "folder"})`,
                },
              ],
            };
          }

          case "update": {
            if (!focus_id) {
              return { content: [{ type: "text" as const, text: "Error: focus_id is required for update" }], isError: true };
            }
            const patch: Record<string, unknown> = {};
            if (name !== undefined) patch.name = name;
            if (description !== undefined) patch.description = description;
            if (color !== undefined) patch.color = color;
            if (icon !== undefined) patch.icon = icon;
            if (position !== undefined) patch.position = position;
            if (agent_ids !== undefined) patch.agent_ids = agent_ids;
            if (workflow_ids !== undefined) patch.workflow_ids = workflow_ids;
            const f = await client.updateFocus(focus_id, patch);
            return {
              content: [{ type: "text" as const, text: `✅ Updated focus: "${f.name}" (id: ${f.focus_id})` }],
            };
          }

          case "delete": {
            if (!focus_id) {
              return { content: [{ type: "text" as const, text: "Error: focus_id is required for delete" }], isError: true };
            }
            const r = await client.deleteFocus(focus_id, hard ?? false);
            const verb = r.deleted ? "Deleted" : "Archived";
            return { content: [{ type: "text" as const, text: `✅ ${verb} focus ${r.focus_id} (projects inside detached to 'No Focus').` }] };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_focuses: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_tasks ─────────────────────────────────────────
  // Site-wide tasks: assignable, completable work items that attach to a
  // Life project, a CRM contact, an agent, or stand alone.

  server.tool(
    "mind_tasks",
    "Manage site-wide tasks — assignable, completable work items that are lighter-weight than a Life project/outcome and simpler than a Kanon checklist item. Reach for mind_tasks for a single actionable to-do (optionally attached to a Life project via parent_type=life_item, a CRM contact via parent_type=contact, or an agent) that needs an owner and a done/not-done state; reach for mind_life when the work is itself a deliverable inside the Focus→Project→Outcome hierarchy, and mind_checklists when you need a multi-item checklist with a progress rollup. Assign tasks to a MIND member, an agent, or an external email. Actions: list/create/get/update/complete/reopen/assign/delete, reports (completion analytics). An empty list means no tasks exist under that filter, not that no work is happening — check mind_life and mind_checklists for the same window before concluding nothing is tracked.",
    {
      action: z
        .enum([
          "list", "create", "get", "update", "complete", "reopen",
          "assign", "delete", "reports",
        ])
        .describe("What to do: list/create/get/update/complete/reopen/assign/delete tasks, or reports (completion analytics)"),
      task_id: z.string().optional().describe("Task ID — required for get/update/complete/reopen/assign/delete"),
      title: z.string().optional().describe("Task title (required for create)"),
      description: z.string().optional().describe("Task description"),
      status: z.string().optional().describe("Filter (list) or new status: open, in_progress, blocked, done"),
      priority: z.string().optional().describe("Priority: none, low, medium, high, urgent"),
      due_date: z.string().optional().describe("Due date YYYY-MM-DD"),
      parent_type: z.string().optional().describe("Attach to: life_item, contact, agent, or none"),
      parent_id: z.string().optional().describe("ID of the parent project / contact / agent"),
      assignee_type: z.string().optional().describe("Assignee: user, agent, external, or unassigned"),
      assignee_id: z.string().optional().describe("Username, agent slug, or email of the assignee"),
      dispatch_agent: z.boolean().optional().describe("When assigning to an agent, also fire it now"),
      note: z.string().optional().describe("Completion note (for complete)"),
      overdue: z.boolean().optional().describe("List only overdue tasks"),
    },
    async ({ action, task_id, title, description, status, priority, due_date, parent_type, parent_id, assignee_type, assignee_id, dispatch_agent, note, overdue }) => {
      try {
        const fmt = (t: any) =>
          `• [${t.status}] ${t.title}${t.priority && t.priority !== "none" ? ` (${t.priority})` : ""}` +
          `${t.due_date ? `, due ${t.due_date}` : ""}${t.is_overdue ? " ⚠️ OVERDUE" : ""}` +
          `${t.assignee_label ? `, → ${t.assignee_label}` : ""}` +
          `${t.parent_label ? `, on ${t.parent_label}` : ""} — id: ${t.task_id}`;

        switch (action) {
          case "list": {
            const params: Record<string, string> = {};
            if (status) params.status = status;
            if (priority) params.priority = priority;
            if (parent_type) params.parent_type = parent_type;
            if (parent_id) params.parent_id = parent_id;
            if (assignee_type) params.assignee_type = assignee_type;
            if (assignee_id) params.assignee_id = assignee_id;
            if (overdue) params.overdue = "true";
            const result = await client.listTasks(params);
            const tasks = result.tasks ?? [];
            if (tasks.length === 0) {
              return { content: [{ type: "text" as const, text: "No tasks found." }] };
            }
            return {
              content: [{
                type: "text" as const,
                text: `${result.total} task(s):\n` + tasks.map(fmt).join("\n"),
              }],
            };
          }

          case "create": {
            if (!title) {
              return {
                content: [{ type: "text" as const, text: "Error: title is required to create a task" }],
                isError: true,
              };
            }
            const t = await client.createTask({
              title, description, status, priority, due_date,
              parent_type, parent_id, assignee_type, assignee_id,
              dispatch_agent,
            });
            return {
              content: [{ type: "text" as const, text: `✅ Created task: ${fmt(t)}` }],
            };
          }

          case "get": {
            if (!task_id) {
              return {
                content: [{ type: "text" as const, text: "Error: task_id is required for get" }],
                isError: true,
              };
            }
            const t = await client.getTask(task_id);
            const extra = t.agent_run_status ? `\nAgent run: ${t.agent_run_status}` : "";
            return {
              content: [{
                type: "text" as const,
                text: `${fmt(t)}${t.description ? `\n${t.description}` : ""}${extra}`,
              }],
            };
          }

          case "update": {
            if (!task_id) {
              return {
                content: [{ type: "text" as const, text: "Error: task_id is required for update" }],
                isError: true,
              };
            }
            const patch: Record<string, unknown> = {};
            if (title !== undefined) patch.title = title;
            if (description !== undefined) patch.description = description;
            if (status !== undefined) patch.status = status;
            if (priority !== undefined) patch.priority = priority;
            if (due_date !== undefined) patch.due_date = due_date;
            if (parent_type !== undefined) patch.parent_type = parent_type;
            if (parent_id !== undefined) patch.parent_id = parent_id;
            const t = await client.updateTask(task_id, patch);
            return {
              content: [{ type: "text" as const, text: `✅ Updated task: ${fmt(t)}` }],
            };
          }

          case "complete": {
            if (!task_id) {
              return {
                content: [{ type: "text" as const, text: "Error: task_id is required for complete" }],
                isError: true,
              };
            }
            const t = await client.completeTask(task_id, true, note);
            return {
              content: [{ type: "text" as const, text: `✅ Completed task: "${t.title}"` }],
            };
          }

          case "reopen": {
            if (!task_id) {
              return {
                content: [{ type: "text" as const, text: "Error: task_id is required for reopen" }],
                isError: true,
              };
            }
            const t = await client.completeTask(task_id, false);
            return {
              content: [{ type: "text" as const, text: `↩️ Reopened task: "${t.title}"` }],
            };
          }

          case "assign": {
            if (!task_id || !assignee_type) {
              return {
                content: [{ type: "text" as const, text: "Error: task_id and assignee_type are required for assign" }],
                isError: true,
              };
            }
            const t = await client.assignTask(task_id, {
              assignee_type, assignee_id, dispatch_agent: dispatch_agent ?? false,
            });
            return {
              content: [{
                type: "text" as const,
                text: `✅ Assigned "${t.title}" → ${t.assignee_label ?? t.assignee_id ?? "unassigned"}`,
              }],
            };
          }

          case "delete": {
            if (!task_id) {
              return {
                content: [{ type: "text" as const, text: "Error: task_id is required for delete" }],
                isError: true,
              };
            }
            await client.deleteTask(task_id);
            return {
              content: [{ type: "text" as const, text: `🗑️ Deleted task ${task_id}` }],
            };
          }

          case "reports": {
            const params: Record<string, string> = {};
            if (parent_type) params.parent_type = parent_type;
            if (parent_id) params.parent_id = parent_id;
            const r = await client.taskReports(params);
            const lines = [
              `📊 Task report (${r.total} total)`,
              `  open ${r.open} · in progress ${r.in_progress} · blocked ${r.blocked} · done ${r.done}`,
              `  completion rate: ${r.completion_rate}%`,
              `  overdue: ${r.overdue} · due soon: ${r.due_soon} · unassigned: ${r.unassigned}`,
              `  avg completion: ${r.avg_completion_days} days`,
            ];
            if (r.by_assignee && r.by_assignee.length) {
              lines.push("  By assignee:");
              for (const a of r.by_assignee.slice(0, 10)) {
                lines.push(`    ${a.assignee_label ?? a.assignee_id ?? "unassigned"}: ${a.done}/${a.total} done (${a.completion_rate}%)`);
              }
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          default:
            return {
              content: [{ type: "text" as const, text: `Unknown action: ${action}` }],
              isError: true,
            };
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `mind_tasks error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_crm ───────────────────────────────────────────
  // Read/write contacts, interactions, and activities.
  // Enhanced: delete, get, log_activity, list_activities.

  server.tool(
    "mind_crm",
    "Manage contacts and relationships in MIND CRM — the system of record for people, companies, leads and prospects, separate from the knowledge graph's document/entry memory. Reach for this (not mind_query) when you need to create, update, or list a specific contact record, or log/read a dated interaction history — reach for mind_query when you want a synthesized answer about a relationship drawn from everything MIND knows. Actions: list/create/update/delete/get contacts, log_activity (record an interaction), list_activities (interaction history). An empty list or 'No contacts found' means no CRM records exist yet, not that the person is unknown to MIND — check mind_query before concluding a relationship is undocumented.",
    {
      action: z
        .enum(["list", "create", "update", "delete", "get", "log_activity", "list_activities"])
        .describe("What to do: list/create/update/delete/get contacts, log_activity (record interaction), list_activities (view interaction history)"),
      name: z.string().optional().describe("Contact name (required for create)"),
      email: z.string().optional().describe("Contact email"),
      company: z.string().optional().describe("Company/organization"),
      type: z.string().optional().describe("Contact type: lead, prospect, partner, customer, personal"),
      stage: z.string().optional().describe("Pipeline stage: new, qualified, proposal, closed, lost"),
      source: z.string().optional().describe("How you found them"),
      notes: z.string().optional().describe("Notes about this contact"),
      contact_id: z.string().optional().describe("Contact ID for update/delete/get/log_activity/list_activities"),
      activity_type: z.string().optional().describe("Activity type for log_activity: call, email, meeting, note"),
      activity_notes: z.string().optional().describe("Notes for the activity being logged"),
    },
    async ({ action, name, email, company, type, stage, source, notes, contact_id, activity_type, activity_notes }) => {
      try {
        switch (action) {
          case "list": {
            const result = await client.listContacts();
            const contacts = result.contacts ?? [];
            if (contacts.length === 0) {
              return { content: [{ type: "text" as const, text: "No contacts found." }] };
            }
            const lines = contacts.map(
              (c) =>
                `• ${c.name}${c.company ? ` @ ${c.company}` : ""}${c.email ? ` (${c.email})` : ""} — ${c.type ?? "—"} / ${c.stage ?? "—"} — id: ${c.contact_id}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "create": {
            if (!name) {
              return {
                content: [{ type: "text" as const, text: "Error: name is required to create a contact" }],
                isError: true,
              };
            }
            const result = await client.createContact({
              name,
              email,
              company,
              type,
              stage,
              source,
              notes,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Created contact: "${result.name}" (id: ${result.contact_id})`,
                },
              ],
            };
          }

          case "update": {
            if (!contact_id) {
              return {
                content: [{ type: "text" as const, text: "Error: contact_id is required for update" }],
                isError: true,
              };
            }
            const patch: Record<string, unknown> = {};
            if (name) patch.name = name;
            if (email) patch.email = email;
            if (company) patch.company = company;
            if (type) patch.type = type;
            if (stage) patch.stage = stage;
            if (notes) patch.notes = notes;
            const result = await client.updateContact(contact_id, patch);
            return {
              content: [{ type: "text" as const, text: `✅ Updated contact: "${result.name}"` }],
            };
          }

          case "delete": {
            if (!contact_id) {
              return {
                content: [{ type: "text" as const, text: "Error: contact_id is required for delete" }],
                isError: true,
              };
            }
            await client.deleteContact(contact_id);
            return {
              content: [{ type: "text" as const, text: `✅ Deleted contact ${contact_id}` }],
            };
          }

          case "get": {
            if (!contact_id) {
              return {
                content: [{ type: "text" as const, text: "Error: contact_id is required for get" }],
                isError: true,
              };
            }
            const result = await client.getContact(contact_id);
            const lines = [
              `**${result.name}**`,
              `Email: ${result.email ?? "—"} | Company: ${result.company ?? "—"}`,
              `Type: ${result.type ?? "—"} | Stage: ${result.stage ?? "—"}`,
              `Created: ${result.created_at ?? "—"}`,
            ];
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "log_activity": {
            if (!contact_id || !activity_type) {
              return {
                content: [{ type: "text" as const, text: "Error: contact_id and activity_type are required for log_activity" }],
                isError: true,
              };
            }
            const result = await client.logActivity(contact_id, {
              type: activity_type,
              title: activity_type,
              description: activity_notes,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Logged ${activity_type} activity for contact ${contact_id} (id: ${result.activity_id})`,
                },
              ],
            };
          }

          case "list_activities": {
            if (!contact_id) {
              return {
                content: [{ type: "text" as const, text: "Error: contact_id is required for list_activities" }],
                isError: true,
              };
            }
            const result = await client.listContactActivities(contact_id);
            const activities = result.activities ?? [];
            if (activities.length === 0) {
              return { content: [{ type: "text" as const, text: "No activities found for this contact." }] };
            }
            const lines = activities.map(
              (a) =>
                `• [${a.type}] ${a.title ?? "—"} — ${a.description ?? "—"} — ${a.created_at ?? "—"}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_crm: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_graph ─────────────────────────────────────────
  // Get graph statistics, diagnostics, and labels.
  // Enhanced: action param with stats (default), diagnostics, labels.

  server.tool(
    "mind_graph",
    "Get MIND knowledge graph statistics and diagnostics — entity/relationship counts, growth, label breakdown, and health status. Use this for a quantitative pulse-check on the graph itself (e.g. before a large ingestion, or to cite \"MIND has N entities\"); it does not search or retrieve content, so for facts, people or history use mind_query instead. Actions: stats (default overview), diagnostics (health check), labels (entity type breakdown). A low or zero count can mean an empty tenant OR a scoping/auth issue reading the wrong account — verify with mind_query on a known fact before treating a small graph as evidence nothing has been logged.",
    {
      action: z
        .enum(["stats", "diagnostics", "labels"])
        .optional()
        .default("stats")
        .describe("Action: stats (default — overview), diagnostics (health check), labels (entity label breakdown)"),
    },
    async ({ action }) => {
      try {
        switch (action) {
          case "stats":
          default: {
            const [graph, profile] = await Promise.all([
              client.graphInfo(),
              client.credits().catch(() => null),
            ]);

            const lines = [
              "📊 MIND Graph Status",
              `• Entities: ${graph.total_entities}`,
              `• Relationships: ${graph.total_relationships}`,
              `• Storage: ${graph.storage_status?.status ?? "unknown"}`,
            ];

            if (graph.popular_labels?.length) {
              const docCount = graph.popular_labels.reduce((sum, l) => sum + l.count, 0);
              lines.push(`• Items in graph: ${docCount}`);
            }

            if (profile) {
              lines.push(`• Credits: ${profile.credits_balance}/${profile.credits_limit}`);
              lines.push(`• Tier: ${profile.tier}`);
              lines.push(`• Documents: ${profile.documents_count} | Storage: ${profile.storage_used_mb}/${profile.storage_limit_mb} MB`);
            }

            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "diagnostics": {
            const result = await client.graphDiagnostics();
            const lines = [
              "🔍 MIND Graph Diagnostics",
              `• Status: ${(result as Record<string, unknown>).status ?? "unknown"}`,
              `• Entity count: ${(result as Record<string, unknown>).entity_count ?? "—"}`,
              `• Relationship count: ${(result as Record<string, unknown>).relationship_count ?? "—"}`,
              `• Orphaned entities: ${(result as Record<string, unknown>).orphaned_entities ?? "—"}`,
              `• Storage health: ${(result as Record<string, unknown>).storage_health ?? "—"}`,
            ];
            const issues = (result as Record<string, unknown>).issues as string[] | undefined;
            if (issues?.length) {
              lines.push("", "Issues:");
              for (const issue of issues) {
                lines.push(`  ⚠ ${issue}`);
              }
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "labels": {
            // Use graphInfo and extract popular_labels
            const result = await client.graphInfo();
            const labels = result.popular_labels ?? [];
            if (labels.length === 0) {
              return { content: [{ type: "text" as const, text: "No labels found in graph." }] };
            }
            const lines = ["🏷️ MIND Graph Labels", ""];
            for (const l of labels) {
              lines.push(`• ${l.label ?? "unlabeled"}: ${l.count} entities`);
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error getting graph info: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_admin ─────────────────────────────────────────
  // Admin-only operations. Requires an admin API key.
  // Create users, manage featured minds, list/update users.

  server.tool(
    "mind_admin",
    "Admin-only tool for managing MIND users and the Featured Minds Portal. Requires an admin API key. Full CRUD over featured minds (create / list / get_full / update / update_owner_profile / reorder / delete), plus user provisioning and tier/credit management. The Featured Minds Portal at /admin/featuredmindsportal uses these same endpoints — get_featured_mind_full + update_featured_mind_owner_profile let you edit the linked user's LLM model, public chat prompt, temperature, reasoning effort, brand fields, and avatar/banner from any MCP client.",
    {
      action: z
        .enum([
          "create_user",
          "create_featured_mind",
          "list_featured_minds",
          "get_featured_mind_full",
          "update_featured_mind",
          "update_featured_mind_owner_profile",
          "reorder_featured_minds",
          "delete_featured_mind",
          "list_users",
          "update_user_tier",
          "adjust_user_credits",
        ])
        .describe(
          "Admin action. Featured Minds Portal actions: create_featured_mind, list_featured_minds, get_featured_mind_full (bundled view + owner profile + model catalog), update_featured_mind (catalog fields: title/description/tags/featured/display_order/is_public/avatar_url/banner_url/subtitle/price), update_featured_mind_owner_profile (write-through to linked user_profiles: preferred_llm_model, public_mind_prompt, chat_temperature, chat_reasoning_effort, public_mind_enabled, public_mind_tagline/greeting/persona, bio, avatar_url, banner_url), reorder_featured_minds (bulk display_order via ordered_mind_ids list), delete_featured_mind. User actions: create_user, list_users, update_user_tier, adjust_user_credits."
        ),
      // create_user fields
      username: z.string().optional().describe("Username for new user (3-30 chars, letters/numbers/underscores)"),
      email: z.string().optional().describe("Email for new user"),
      password: z.string().optional().describe("Password for new user (min 8 chars)"),
      source: z.string().optional().describe("Source app/partner that created this user (e.g. 'myapp')"),
      generate_api_key: z.boolean().optional().describe("If true, also generate a developer API key (mind_...) for the new user"),
      api_key_name: z.string().optional().describe("Name for the generated API key (defaults to '{source} integration')"),
      // featured mind catalog fields
      mind_id: z.string().optional().describe("Featured mind ID — required for get_featured_mind_full / update_featured_mind / update_featured_mind_owner_profile / delete_featured_mind"),
      title: z.string().optional().describe("Display title for the featured mind"),
      subtitle: z.string().optional().describe("One-line hook shown under the title on portal cards (≤140 chars)"),
      description: z.string().optional().describe("Long-form description shown on the public profile"),
      tags: z.array(z.string()).optional().describe("Tags for the featured mind"),
      price: z.number().optional().describe("Subscription price (0 = free)"),
      featured: z.boolean().optional().describe("Whether to show in the featured grid on /discover"),
      display_order: z.number().optional().describe("Sort order in featured list (lower = earlier)"),
      is_public: z.boolean().optional().describe("If true, anyone can query this mind at normal credit rate (marketplace public)"),
      avatar_url: z.string().optional().describe("Avatar image URL (S3-hosted). Writes-through to user_profiles when used with update_featured_mind_owner_profile."),
      banner_url: z.string().optional().describe("Banner image URL (S3-hosted). Writes-through to user_profiles when used with update_featured_mind_owner_profile."),
      // owner_profile fields (write-through to user_profiles)
      preferred_llm_model: z
        .union([z.string(), z.null()])
        .optional()
        .describe(
          "LLM model id (e.g. 'deepseek/deepseek-v4-flash', 'anthropic/claude-sonnet-4.6'). Used by the public chat at /m/{username}. Pass null to clear and fall back to platform default. Use mind_admin with action=list_featured_minds then get_featured_mind_full to see available_models."
        ),
      public_mind_enabled: z.boolean().optional().describe("Whether anonymous visitors can chat with this MIND at /m/{username}"),
      public_mind_prompt: z
        .string()
        .max(3000)
        .optional()
        .describe("System prompt used by the public chat (≤3000 chars). Empty string clears it and the auto-built default is used."),
      public_mind_tagline: z.string().max(160).optional().describe("Public landing tagline (≤160 chars)"),
      public_mind_greeting: z.string().max(500).optional().describe("Public landing greeting message (≤500 chars)"),
      public_mind_persona: z.string().max(800).optional().describe("Persona description used inside the auto-built default prompt (≤800 chars)"),
      chat_temperature: z
        .union([z.number().min(0).max(2), z.null()])
        .optional()
        .describe("Per-MIND temperature override (0.0–2.0). Null clears to provider default."),
      chat_reasoning_effort: z
        .union([z.enum(["minimal", "low", "medium", "high"]), z.null()])
        .optional()
        .describe("Per-MIND reasoning_effort override. Only honored for thinking-capable models (supports_reasoning_effort=true)."),
      bio: z.string().max(500).optional().describe("Owner bio (shown across MIND profile surfaces, ≤500 chars)"),
      // Influencer Factory fields (writable via create_featured_mind + update_featured_mind)
      archetype_id: z
        .union([z.string(), z.null()])
        .optional()
        .describe("Influencer Factory: archetype persona id (e.g. an Astra archetype template). Pass null to clear."),
      voice_id: z
        .union([z.string(), z.null()])
        .optional()
        .describe("Influencer Factory: ElevenLabs voice id used by this persona. Pass null to clear."),
      seed_image_url: z
        .union([z.string(), z.null()])
        .optional()
        .describe("Influencer Factory: anchor seed image URL (the reference photo every image-to-image variant pins to — do not chain). Pass null to clear."),
      niche_tags: z
        .array(z.string())
        .optional()
        .describe("Influencer Factory: niche/topic tags for this persona (e.g. ['fitness', 'wellness']). Separate from catalog `tags`."),
      kg_scope_template_id: z
        .union([z.string(), z.null()])
        .optional()
        .describe("Influencer Factory: KG-scope template id that bounds what this persona knows/talks about. Pass null to clear."),
      agent_posting_enabled: z
        .boolean()
        .optional()
        .describe("Influencer Factory: gate that lets autonomous agents post on this persona's behalf. Dark by default."),
      // reorder
      ordered_mind_ids: z
        .array(z.string())
        .optional()
        .describe("For reorder_featured_minds: full list of mind_ids in the order you want. Index in the list becomes display_order."),
      // user management fields
      tier: z.string().optional().describe("Subscription tier: free, pro, enterprise"),
      credits: z.number().optional().describe("Credits to add (positive) or deduct (negative)"),
      // list fields
      query: z.string().optional().describe("Search query for list_users"),
      page: z.number().optional().describe("Page number for paginated results"),
    },
    async ({ action, username, email, password, source, generate_api_key, api_key_name, mind_id, title, subtitle, description, tags, price, featured, display_order, is_public, avatar_url, banner_url, preferred_llm_model, public_mind_enabled, public_mind_prompt, public_mind_tagline, public_mind_greeting, public_mind_persona, chat_temperature, chat_reasoning_effort, bio, archetype_id, voice_id, seed_image_url, niche_tags, kg_scope_template_id, agent_posting_enabled, ordered_mind_ids, tier, credits, query, page }) => {
      try {
        switch (action) {
          case "create_user": {
            if (!username || !email || !password) {
              return {
                content: [{ type: "text" as const, text: "Error: username, email, and password are required" }],
                isError: true,
              };
            }
            const result = await client.adminCreateUser({ username, email, password, source, tier, generate_api_key, api_key_name });
            let text = `✅ User created: @${result.user?.username} (workspace: ${result.user?.workspace_id}, tier: ${result.user?.tier})`;
            if (result.api_key) {
              text += `\n🔑 API key: ${result.api_key.key}\n   Name: ${result.api_key.name}\n   Scopes: ${result.api_key.scopes.length} (full access)`;
            }
            return {
              content: [{ type: "text" as const, text }],
            };
          }

          case "create_featured_mind": {
            if (!username || !title) {
              return {
                content: [{ type: "text" as const, text: "Error: username and title are required" }],
                isError: true,
              };
            }
            const result = await client.adminCreateFeaturedMind({
              username,
              title,
              subtitle,
              description,
              tags,
              price: price ?? 0,
              featured: featured ?? true,
              display_order: display_order ?? 0,
              is_public: is_public ?? false,
              avatar_url,
              banner_url,
              // Influencer Factory extensions — null/undefined is fine; backend defaults
              archetype_id,
              voice_id,
              seed_image_url,
              niche_tags,
              kg_scope_template_id,
              agent_posting_enabled,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Featured mind created: "${result.title}" for @${result.username} (id: ${result.mind_id})`,
                },
              ],
            };
          }

          case "list_featured_minds": {
            const result = await client.adminListFeaturedMinds();
            if (!result.length) {
              return { content: [{ type: "text" as const, text: "No featured minds found." }] };
            }
            const lines = result.map(
              (m) => `• [${m.featured ? "featured" : "unlisted"}] @${m.username} — "${m.title}" (id: ${m.mind_id}, order: ${m.display_order})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "update_featured_mind": {
            if (!mind_id) {
              return {
                content: [{ type: "text" as const, text: "Error: mind_id is required for update" }],
                isError: true,
              };
            }
            const patch: Record<string, unknown> = {};
            if (title !== undefined) patch.title = title;
            if (subtitle !== undefined) patch.subtitle = subtitle;
            if (description !== undefined) patch.description = description;
            if (tags !== undefined) patch.tags = tags;
            if (price !== undefined) patch.price = price;
            if (featured !== undefined) patch.featured = featured;
            if (display_order !== undefined) patch.display_order = display_order;
            if (is_public !== undefined) patch.is_public = is_public;
            if (avatar_url !== undefined) patch.avatar_url = avatar_url;
            if (banner_url !== undefined) patch.banner_url = banner_url;
            // Influencer Factory fields
            if (archetype_id !== undefined) patch.archetype_id = archetype_id;
            if (voice_id !== undefined) patch.voice_id = voice_id;
            if (seed_image_url !== undefined) patch.seed_image_url = seed_image_url;
            if (niche_tags !== undefined) patch.niche_tags = niche_tags;
            if (kg_scope_template_id !== undefined) patch.kg_scope_template_id = kg_scope_template_id;
            if (agent_posting_enabled !== undefined) patch.agent_posting_enabled = agent_posting_enabled;
            const result = await client.adminUpdateFeaturedMind(mind_id, patch);
            return {
              content: [{ type: "text" as const, text: `✅ Updated featured mind: "${result.title}"` }],
            };
          }

          case "get_featured_mind_full": {
            if (!mind_id) {
              return {
                content: [{ type: "text" as const, text: "Error: mind_id is required for get_featured_mind_full" }],
                isError: true,
              };
            }
            const full = await client.adminGetFeaturedMindFull(mind_id);
            const op = full.owner_profile;
            const fm = full.featured_mind;
            const modelLines = full.available_models
              .slice(0, 8)
              .map((m) => `  • ${m.id} — ${m.name} (${m.provider})`)
              .join("\n");
            const more = full.available_models.length > 8 ? `  …and ${full.available_models.length - 8} more` : "";
            const ownerLines = [
              `@${op.username}`,
              `  preferred_llm_model: ${op.preferred_llm_model ?? "(platform default)"}`,
              `  public_mind_enabled: ${op.public_mind_enabled}`,
              `  public_mind_prompt: ${op.public_mind_prompt ? `${op.public_mind_prompt.slice(0, 80)}${op.public_mind_prompt.length > 80 ? "…" : ""}` : "(default)"}`,
              `  tagline: ${op.public_mind_tagline || "—"}`,
              `  greeting: ${op.public_mind_greeting ? op.public_mind_greeting.slice(0, 60) + (op.public_mind_greeting.length > 60 ? "…" : "") : "—"}`,
              `  persona: ${op.public_mind_persona ? op.public_mind_persona.slice(0, 60) + (op.public_mind_persona.length > 60 ? "…" : "") : "—"}`,
              `  temperature: ${op.chat_temperature ?? "(default)"}`,
              `  reasoning_effort: ${op.chat_reasoning_effort ?? "(default)"}`,
              `  avatar_url: ${op.avatar_url ? "✓ set" : "—"}`,
              `  banner_url: ${op.banner_url ? "✓ set" : "—"}`,
            ].join("\n");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Featured mind: "${fm.title}" (id: ${fm.mind_id}, order: ${fm.display_order}, featured: ${fm.featured}, public: ${fm.is_public ?? false})\n\nOwner profile (write-through target):\n${ownerLines}\n\nAvailable models (${full.available_models.length} total):\n${modelLines}${more ? "\n" + more : ""}`,
                },
              ],
            };
          }

          case "update_featured_mind_owner_profile": {
            if (!mind_id) {
              return {
                content: [{ type: "text" as const, text: "Error: mind_id is required for update_featured_mind_owner_profile" }],
                isError: true,
              };
            }
            const patch: Parameters<typeof client.adminUpdateFeaturedMindOwnerProfile>[1] = {};
            if (preferred_llm_model !== undefined) patch.preferred_llm_model = preferred_llm_model;
            if (public_mind_enabled !== undefined) patch.public_mind_enabled = public_mind_enabled;
            if (public_mind_prompt !== undefined) patch.public_mind_prompt = public_mind_prompt;
            if (public_mind_tagline !== undefined) patch.public_mind_tagline = public_mind_tagline;
            if (public_mind_greeting !== undefined) patch.public_mind_greeting = public_mind_greeting;
            if (public_mind_persona !== undefined) patch.public_mind_persona = public_mind_persona;
            if (chat_temperature !== undefined) patch.chat_temperature = chat_temperature;
            if (chat_reasoning_effort !== undefined) patch.chat_reasoning_effort = chat_reasoning_effort;
            if (bio !== undefined) patch.bio = bio;
            if (avatar_url !== undefined) patch.avatar_url = avatar_url;
            if (banner_url !== undefined) patch.banner_url = banner_url;
            if (Object.keys(patch).length === 0) {
              return {
                content: [{ type: "text" as const, text: "Nothing to update — pass at least one owner_profile field." }],
                isError: true,
              };
            }
            const result = await client.adminUpdateFeaturedMindOwnerProfile(mind_id, patch);
            const changed = Object.keys(patch).join(", ");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Owner-profile write-through for @${result.username}: ${changed}`,
                },
              ],
            };
          }

          case "reorder_featured_minds": {
            if (!ordered_mind_ids || ordered_mind_ids.length === 0) {
              return {
                content: [{ type: "text" as const, text: "Error: ordered_mind_ids (full ordered list) is required" }],
                isError: true,
              };
            }
            const result = await client.adminReorderFeaturedMinds(ordered_mind_ids);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Reordered ${result.total} featured mind(s) — ${result.updated} display_order value(s) changed`,
                },
              ],
            };
          }

          case "delete_featured_mind": {
            if (!mind_id) {
              return {
                content: [{ type: "text" as const, text: "Error: mind_id is required for delete_featured_mind" }],
                isError: true,
              };
            }
            const result = await client.adminDeleteFeaturedMind(mind_id);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Featured mind removed (${result.status}). The user's underlying MIND is not deleted.`,
                },
              ],
            };
          }

          case "list_users": {
            const result = await client.adminListUsers({ q: query, page: page ?? 1 });
            const users = result.users ?? [];
            if (!users.length) {
              return { content: [{ type: "text" as const, text: "No users found." }] };
            }
            const lines = users.map(
              (u) => `• @${u.username} (${u.email ?? "—"}) — tier: ${u.tier ?? "free"}, docs: ${u.doc_count ?? 0}`
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${result.total ?? users.length} total\n\n${lines.join("\n")}`,
                },
              ],
            };
          }

          case "update_user_tier": {
            if (!username || !tier) {
              return {
                content: [{ type: "text" as const, text: "Error: username and tier are required" }],
                isError: true,
              };
            }
            const result = await client.adminUpdateUserTier(username, tier);
            return {
              content: [{ type: "text" as const, text: `✅ @${username} tier updated to: ${result.tier}` }],
            };
          }

          case "adjust_user_credits": {
            if (!username || credits === undefined) {
              return {
                content: [{ type: "text" as const, text: "Error: username and credits are required" }],
                isError: true,
              };
            }
            const result = await client.adminAdjustCredits(username, credits);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Credits adjusted for @${username}: ${credits > 0 ? "+" : ""}${credits} → balance: ${result.new_balance}`,
                },
              ],
            };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Admin error: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════
  // NEW TOOLS (Phase 2 + Phase 3)
  // ═══════════════════════════════════════════════════════════

  // ─── mind_sense ─────────────────────────────────────────
  // MINDsense emotional intelligence layer.

  server.tool(
    "mind_sense",
    "Access MINDsense — the user's live emotional state, signal history, spikes and emotionally-weighted entities, derived from valence/arousal signal processing rather than asked directly. Reach for this before a sensitive conversation, when deciding how hard to push on a topic, or when asked \"how am I feeling\" / \"read the room\"; reach for mind_query instead for factual history about what happened. Actions: state (current snapshot), signals (recent raw signals), timeline (historical trend), kg_weights (which entities carry emotional weight), spikes (notable events, some unacknowledged), acknowledge (clear a spike), summary (AI-written recap). No signals in the lookback window means nothing was captured in that period, not that the user was neutral — widen `days` before concluding calm.",
    {
      action: z
        .enum(["state", "signals", "timeline", "kg_weights", "spikes", "acknowledge", "summary"])
        .describe("Action: state (current emotion), signals (recent signals), timeline (historical), kg_weights (emotionally weighted entities), spikes (recent spikes), acknowledge (ack a spike), summary (AI emotional summary)"),
      signal_id: z.string().optional().describe("Signal ID for acknowledge action"),
      days: z.number().optional().default(7).describe("Lookback days for timeline/signals"),
      limit: z.number().optional().default(20).describe("Max items to return"),
    },
    async ({ action, signal_id, days, limit }) => {
      try {
        switch (action) {
          case "state": {
            const result = await client.mindsenseState();
            const lines = [
              "🧠 MINDsense Emotional State",
              `• Label: ${result.label ?? "neutral"}`,
              `• Valence: ${result.valence ?? "—"} (positive/negative)`,
              `• Arousal: ${result.arousal ?? "—"} (intensity)`,
              `• Trend: ${result.trend ?? "stable"}`,
              `• Sensitivity: ${result.sensitivity ?? "—"}`,
            ];
            if (result.dominant_emotion) {
              lines.push(`• Dominant emotion: ${result.dominant_emotion}`);
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "signals": {
            const result = await client.mindsenseSignals(days, limit);
            const signals = result.signals ?? [];
            if (signals.length === 0) {
              return { content: [{ type: "text" as const, text: "No emotional signals in the specified period." }] };
            }
            const lines = signals.map(
              (s: Record<string, unknown>) =>
                `• [${s.label ?? "—"}] valence: ${s.valence ?? "—"}, arousal: ${s.arousal ?? "—"} — ${s.created_at ?? "—"} (id: ${s.signal_id ?? s.id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "timeline": {
            const result = await client.mindsenseTimeline(days);
            const points = result.timeline ?? [];
            if (points.length === 0) {
              return { content: [{ type: "text" as const, text: "No timeline data for the specified period." }] };
            }
            const lines = ["📈 Emotional Timeline", ""];
            for (const p of points) {
              lines.push(`• ${p.date ?? p.timestamp}: ${p.label ?? "—"} (v: ${p.valence ?? "—"}, a: ${p.arousal ?? "—"})`);
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "kg_weights": {
            const result = await client.mindsenseKgWeights(limit);
            const entities = result.entities ?? [];
            if (entities.length === 0) {
              return { content: [{ type: "text" as const, text: "No emotionally weighted entities found." }] };
            }
            const lines = ["🎯 Emotionally Weighted KG Entities", ""];
            for (const e of entities) {
              lines.push(`• ${e.entity ?? e.name}: weight ${e.weight ?? e.score ?? "—"} (${e.emotion ?? "—"})`);
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "spikes": {
            const result = await client.mindsenseSpikes(days, limit);
            const spikes = result.spikes ?? [];
            if (spikes.length === 0) {
              return { content: [{ type: "text" as const, text: "No emotional spikes detected." }] };
            }
            const lines = ["⚡ Emotional Spikes", ""];
            for (const s of spikes) {
              lines.push(
                `• [${s.acknowledged ? "ack" : "NEW"}] ${s.label ?? "—"} — valence: ${s.valence ?? "—"}, arousal: ${s.arousal ?? "—"} — ${s.created_at ?? "—"} (id: ${s.signal_id ?? s.id})`
              );
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "acknowledge": {
            if (!signal_id) {
              return {
                content: [{ type: "text" as const, text: "Error: signal_id is required for acknowledge" }],
                isError: true,
              };
            }
            await client.mindsenseAcknowledge(signal_id);
            return {
              content: [{ type: "text" as const, text: `✅ Acknowledged spike signal ${signal_id}` }],
            };
          }

          case "summary": {
            const result = await client.mindsenseSummary(days);
            return {
              content: [{ type: "text" as const, text: result.summary ?? "No emotional summary available." }],
            };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_sense: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_research ──────────────────────────────────────
  // Deep research agent jobs.

  server.tool(
    "mind_research",
    "Launch and track autonomous deep-research jobs — MIND gathers sources, synthesizes them, and writes findings into the knowledge graph as it goes. Use this for a genuinely open-ended investigation (competitive analysis, market research, a technical deep-dive) that would take multiple search rounds; use mind_query for a quick fact lookup instead. Actions: start (launch, returns job_id), status (poll progress and read the summary once complete), list (all jobs). A job still 'running' has no findings yet — poll status again rather than treating a thin or missing summary as a negative result; once complete, read the findings via mind_query rather than re-reading the raw job.",
    {
      action: z
        .enum(["start", "status", "list"])
        .describe("Action: start (launch research), status (check job progress), list (view all jobs)"),
      topic: z.string().optional().describe("Research topic/question for start action"),
      job_id: z.string().optional().describe("Job ID for status action"),
      limit: z.number().optional().default(10).describe("Max jobs to return for list"),
    },
    async ({ action, topic, job_id, limit }) => {
      try {
        switch (action) {
          case "start": {
            if (!topic) {
              return {
                content: [{ type: "text" as const, text: "Error: topic is required to start research" }],
                isError: true,
              };
            }
            const result = await client.startResearch(topic);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Research started: "${topic}" (job_id: ${result.job_id})`,
                },
              ],
            };
          }

          case "status": {
            if (!job_id) {
              return {
                content: [{ type: "text" as const, text: "Error: job_id is required for status" }],
                isError: true,
              };
            }
            const result = await client.getResearch(job_id);
            const lines = [
              `📋 Research Job: ${result.topic ?? result.title ?? job_id}`,
              `• Status: ${result.status}`,
              `• Papers found: ${result.papers_count ?? "—"}`,
              `• Credits used: ${result.credits_used ?? "—"}`,
              `• Started: ${result.created_at ?? "—"}`,
            ];
            if (result.research_summary) {
              lines.push("", `Summary: ${result.research_summary}`);
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "list": {
            const result = await client.listResearch(limit);
            const jobs = result.jobs ?? [];
            if (jobs.length === 0) {
              return { content: [{ type: "text" as const, text: "No research jobs found." }] };
            }
            const lines = jobs.map(
              (j) =>
                `• [${j.status}] "${j.topic ?? j.title}" — ${j.created_at ?? "—"} (id: ${j.job_id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_research: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_train ─────────────────────────────────────────
  // Self-training and chat-to-KG sessions.

  server.tool(
    "mind_train",
    "Run guided or freeform sessions that teach MIND about the user through conversation, or extract an existing chat transcript into the knowledge graph as durable memories — this is how unstructured conversation becomes queryable facts, distinct from mind_remember (one explicit fact) or mind_query (reading facts back). Actions: start (begin a session, optionally typed: basics/network/expertise/history/goals/freeform), chat (send the next training message), status (progress + items learned so far), list_sessions, pause/resume, save_chat (extract a chat session_id into the graph). 'Items learned: 0' or an empty list_sessions means no training has happened yet in this account, not that the user has nothing worth learning — check mind_query for what's already there before starting a duplicate session.",
    {
      action: z
        .enum(["start", "chat", "status", "list_sessions", "pause", "resume", "save_chat"])
        .describe("Action: start (begin training), chat (send message), status (check progress), list_sessions (view past), pause/resume (control session), save_chat (save chat to KG)"),
      message: z.string().optional().describe("Training message for chat action"),
      session_type: z
        .string()
        .optional()
        .describe("Training type: basics, network, expertise, history, goals, freeform"),
      session_id: z.string().optional().describe("Session ID for save_chat/pause/resume actions"),
    },
    async ({ action, message, session_type, session_id }) => {
      try {
        switch (action) {
          case "start": {
            const result = await client.trainingStart(session_type);
            const sid = String(result.session_id ?? result.id ?? "unknown");
            const prompt = String(result.prompt ?? result.message ?? "Ready to train.");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Training session started (type: ${session_type ?? "freeform"}, id: ${sid})\n\n${prompt}`,
                },
              ],
            };
          }

          case "chat": {
            if (!message) {
              return {
                content: [{ type: "text" as const, text: "Error: message is required for chat" }],
                isError: true,
              };
            }
            const result = await client.trainingChat(message);
            return {
              content: [{ type: "text" as const, text: String(result.response ?? result.message ?? "Received.") }],
            };
          }

          case "status": {
            const result = await client.trainingStatus();
            const lines = [
              "📋 Training Status",
              `• Active: ${result.active ? "yes" : "no"}`,
              `• Type: ${String(result.session_type ?? "—")}`,
              `• Progress: ${String(result.progress ?? "—")}`,
              `• Items learned: ${String(result.items_learned ?? 0)}`,
            ];
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "list_sessions": {
            const result = await client.trainingSessions();
            const sessions = result.sessions ?? [];
            if (sessions.length === 0) {
              return { content: [{ type: "text" as const, text: "No training sessions found." }] };
            }
            const lines = sessions.map(
              (s) =>
                `• [${String(s.status ?? "—")}] ${String(s.session_type ?? "freeform")} — ${String(s.created_at ?? "—")} (id: ${String(s.session_id ?? s.id)})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "pause": {
            await client.trainingPause();
            return {
              content: [{ type: "text" as const, text: "✅ Training session paused." }],
            };
          }

          case "resume": {
            const result = await client.trainingResume();
            const prompt = String(result.prompt ?? result.message ?? "");
            return {
              content: [{ type: "text" as const, text: `✅ Training session resumed.\n\n${prompt}` }],
            };
          }

          case "save_chat": {
            if (!session_id) {
              return {
                content: [{ type: "text" as const, text: "Error: session_id is required for save_chat" }],
                isError: true,
              };
            }
            const result = await client.saveChatToMind(session_id);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Chat session saved to knowledge graph (${String(result.items_saved ?? result.count ?? 0)} items extracted)`,
                },
              ],
            };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_train: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_social ────────────────────────────────────────
  // Thoughts, communities, and feed.

  server.tool(
    "mind_social",
    "Interact with MIND's social layer — create thoughts (PUBLIC feed posts), browse the feed, manage communities, and engage with other users' content. ⚠️ create_thought posts to the user's PUBLIC social feed for everyone to see — NEVER call unless the user explicitly said \"post\", \"share\", \"tweet\", \"feed\", or \"thought to my feed\". For private agent outcomes, deploy logs, or work updates, use mind_remember with type=entry instead.",
    {
      action: z
        .enum([
          "create_thought", "get_thought", "delete_thought", "like_thought",
          "feed", "user_feed", "search_feed",
          "create_community", "list_communities", "get_community",
          "join_community", "leave_community",
          "create_post", "list_posts",
        ])
        .describe("Social action — thoughts, feed browsing, community management"),
      content: z.string().optional().describe("Content for thoughts or posts"),
      thought_id: z.string().optional().describe("Thought ID for get/delete/like"),
      community_id: z.string().optional().describe("Community ID for community actions and posts"),
      post_id: z.string().optional().describe("Post ID for post actions"),
      username: z.string().optional().describe("Username for user_feed"),
      name: z.string().optional().describe("Community name for create_community"),
      description: z.string().optional().describe("Community description"),
      page: z.number().optional().describe("Page number for paginated results"),
      limit: z.number().optional().describe("Max items per page"),
    },
    async ({ action, content, thought_id, community_id, post_id, username, name, description, page, limit: lim }) => {
      try {
        switch (action) {
          case "create_thought": {
            if (!content) {
              return {
                content: [{ type: "text" as const, text: "Error: content is required for create_thought" }],
                isError: true,
              };
            }
            const result = await client.socialCreateThought(content);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Feed post created on PUBLIC feed (id: ${result.thought_id ?? result.id})`,
                },
              ],
            };
          }

          case "get_thought": {
            if (!thought_id) {
              return {
                content: [{ type: "text" as const, text: "Error: thought_id is required for get_thought" }],
                isError: true,
              };
            }
            const result = await client.socialGetThought(thought_id);
            const lines = [
              `@${result.username ?? "—"}: ${result.content}`,
              `Likes: ${result.likes ?? 0} | Reposts: ${result.reposts ?? 0} | ${result.created_at ?? ""}`,
            ];
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "delete_thought": {
            if (!thought_id) {
              return {
                content: [{ type: "text" as const, text: "Error: thought_id is required for delete_thought" }],
                isError: true,
              };
            }
            await client.socialDeleteThought(thought_id);
            return {
              content: [{ type: "text" as const, text: `✅ Deleted thought ${thought_id}` }],
            };
          }

          case "like_thought": {
            if (!thought_id) {
              return {
                content: [{ type: "text" as const, text: "Error: thought_id is required for like_thought" }],
                isError: true,
              };
            }
            await client.socialLikeThought(thought_id);
            return {
              content: [{ type: "text" as const, text: `✅ Liked thought ${thought_id}` }],
            };
          }

          case "feed": {
            const result = await client.socialFeed(page, lim);
            const items = result.thoughts ?? [];
            if (items.length === 0) {
              return { content: [{ type: "text" as const, text: "Feed is empty." }] };
            }
            const lines = items.map(
              (t) =>
                `• @${String(t.username ?? "—")}: ${String(t.content ?? "").slice(0, 120)} (❤ ${String(t.likes ?? 0)}) — id: ${String(t.thought_id ?? t.id)}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "user_feed": {
            if (!username) {
              return {
                content: [{ type: "text" as const, text: "Error: username is required for user_feed" }],
                isError: true,
              };
            }
            const result = await client.socialUserFeed(username, page, lim);
            const items = result.thoughts ?? [];
            if (items.length === 0) {
              return { content: [{ type: "text" as const, text: `No thoughts from @${username}.` }] };
            }
            const lines = items.map(
              (t) =>
                `• ${String(t.content ?? "").slice(0, 120)} (❤ ${String(t.likes ?? 0)}) — id: ${String(t.thought_id ?? t.id)}`
            );
            return { content: [{ type: "text" as const, text: `@${username}'s thoughts:\n${lines.join("\n")}` }] };
          }

          case "search_feed": {
            if (!content) {
              return {
                content: [{ type: "text" as const, text: "Error: content (search query) is required for search_feed" }],
                isError: true,
              };
            }
            const result = await client.socialSearchFeed(content, page, lim);
            const items = result.thoughts ?? [];
            if (items.length === 0) {
              return { content: [{ type: "text" as const, text: `No results for "${content}".` }] };
            }
            const lines = items.map(
              (t) =>
                `• @${String(t.username ?? "—")}: ${String(t.content ?? "").slice(0, 120)} — id: ${String(t.thought_id ?? t.id)}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "create_community": {
            if (!name) {
              return {
                content: [{ type: "text" as const, text: "Error: name is required for create_community" }],
                isError: true,
              };
            }
            const result = await client.socialCreateCommunity(name, description);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Community created: "${result.name}" (id: ${result.community_id ?? result.id})`,
                },
              ],
            };
          }

          case "list_communities": {
            const result = await client.socialListCommunities(page, lim);
            const communities = result.communities ?? [];
            if (communities.length === 0) {
              return { content: [{ type: "text" as const, text: "No communities found." }] };
            }
            const lines = communities.map(
              (c: Record<string, unknown>) =>
                `• ${c.name} — ${c.member_count ?? 0} members (id: ${c.community_id ?? c.id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "get_community": {
            if (!community_id) {
              return {
                content: [{ type: "text" as const, text: "Error: community_id is required for get_community" }],
                isError: true,
              };
            }
            const result = await client.socialGetCommunity(community_id);
            const lines = [
              `**${result.name}**`,
              result.description ?? "",
              `Members: ${result.member_count ?? 0} | Posts: ${result.post_count ?? 0}`,
            ];
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "join_community": {
            if (!community_id) {
              return {
                content: [{ type: "text" as const, text: "Error: community_id is required for join_community" }],
                isError: true,
              };
            }
            await client.socialJoinCommunity(community_id);
            return {
              content: [{ type: "text" as const, text: `✅ Joined community ${community_id}` }],
            };
          }

          case "leave_community": {
            if (!community_id) {
              return {
                content: [{ type: "text" as const, text: "Error: community_id is required for leave_community" }],
                isError: true,
              };
            }
            await client.socialLeaveCommunity(community_id);
            return {
              content: [{ type: "text" as const, text: `✅ Left community ${community_id}` }],
            };
          }

          case "create_post": {
            if (!community_id || !content) {
              return {
                content: [{ type: "text" as const, text: "Error: community_id and content are required for create_post" }],
                isError: true,
              };
            }
            const result = await client.socialCreatePost(community_id, content);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Post created in community ${community_id} (id: ${result.post_id ?? result.id})`,
                },
              ],
            };
          }

          case "list_posts": {
            if (!community_id) {
              return {
                content: [{ type: "text" as const, text: "Error: community_id is required for list_posts" }],
                isError: true,
              };
            }
            const result = await client.socialListPosts(community_id, page, lim);
            const posts = result.posts ?? [];
            if (posts.length === 0) {
              return { content: [{ type: "text" as const, text: "No posts in this community." }] };
            }
            const lines = posts.map(
              (p: Record<string, unknown>) =>
                `• @${p.username ?? "—"}: ${(p.content as string)?.slice(0, 120) ?? ""} — id: ${p.post_id ?? p.id}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_social: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_profile ───────────────────────────────────────
  // Profile, prompts, and model preferences.

  server.tool(
    "mind_profile",
    "Manage the user's own MIND profile, public-chat prompt, and model preferences — bio, display name, the system prompt used at their public /m/{username} chat surface, and their default LLM model. This is account/identity settings, not knowledge-graph content — for what MIND knows about the user, use mind_context or mind_query instead. Actions: get/update (profile fields), get_chat_prompt/set_chat_prompt, get_thought_prompt/set_thought_prompt, get_model/set_model/list_models. 'No custom prompt set' on get_chat_prompt/get_thought_prompt means the platform default applies, not that chat is unconfigured — call list_models before set_model if unsure a model id is valid, since an unrecognized id fails at the provider, not here.",
    {
      action: z
        .enum([
          "get", "update",
          "get_chat_prompt", "set_chat_prompt",
          "get_thought_prompt", "set_thought_prompt",
          "get_model", "set_model", "list_models",
        ])
        .describe("Action: get/update profile, get/set chat/thought prompts, get/set/list LLM models"),
      username: z.string().optional().describe("Username for get action (defaults to current user)"),
      bio: z.string().optional().describe("Bio for update action"),
      display_name: z.string().optional().describe("Display name for update action"),
      prompt: z.string().optional().describe("System prompt content for set_chat_prompt/set_thought_prompt"),
      model_id: z.string().optional().describe("Model ID for set_model"),
    },
    async ({ action, username, bio, display_name, prompt, model_id }) => {
      try {
        switch (action) {
          case "get": {
            const result = await client.profileGet(username);
            const lines = [
              `**@${result.username}**`,
              result.display_name ? `Name: ${result.display_name}` : "",
              result.bio ? `Bio: ${result.bio}` : "",
              `Tier: ${result.tier ?? "free"}`,
              `Joined: ${result.created_at ?? "—"}`,
            ].filter(Boolean);
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "update": {
            const patch: Record<string, unknown> = {};
            if (bio) patch.bio = bio;
            if (display_name) patch.display_name = display_name;
            if (username) patch.username = username;
            const result = await client.profileUpdate(patch);
            return {
              content: [{ type: "text" as const, text: `✅ Profile updated: @${result.username}` }],
            };
          }

          case "get_chat_prompt": {
            const result = await client.getChatPrompt();
            return {
              content: [{ type: "text" as const, text: `Chat system prompt:\n\n${result.prompt ?? "No custom prompt set."}` }],
            };
          }

          case "set_chat_prompt": {
            if (!prompt) {
              return {
                content: [{ type: "text" as const, text: "Error: prompt is required for set_chat_prompt" }],
                isError: true,
              };
            }
            await client.setChatPrompt(prompt);
            return {
              content: [{ type: "text" as const, text: "✅ Chat system prompt updated." }],
            };
          }

          case "get_thought_prompt": {
            const result = await client.getThoughtPrompt();
            return {
              content: [{ type: "text" as const, text: `Thought generation prompt:\n\n${result.prompt ?? "No custom prompt set."}` }],
            };
          }

          case "set_thought_prompt": {
            if (!prompt) {
              return {
                content: [{ type: "text" as const, text: "Error: prompt is required for set_thought_prompt" }],
                isError: true,
              };
            }
            await client.setThoughtPrompt(prompt);
            return {
              content: [{ type: "text" as const, text: "✅ Thought generation prompt updated." }],
            };
          }

          case "get_model": {
            const result = await client.getModel();
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Current model: ${result.model_id ?? result.model ?? "default"} (${result.provider ?? "—"})`,
                },
              ],
            };
          }

          case "set_model": {
            if (!model_id) {
              return {
                content: [{ type: "text" as const, text: "Error: model_id is required for set_model" }],
                isError: true,
              };
            }
            const result = await client.setModel(model_id);
            return {
              content: [{ type: "text" as const, text: `✅ Model set to: ${result.model_id ?? model_id}` }],
            };
          }

          case "list_models": {
            const result = await client.listModels();
            const models = result.models ?? [];
            if (models.length === 0) {
              return { content: [{ type: "text" as const, text: "No models available." }] };
            }
            const lines = models.map(
              (m: Record<string, unknown>) =>
                `• ${m.name ?? m.model_id} (${m.provider ?? "—"}) — ${m.description ?? ""}${m.is_free ? " [FREE]" : ""}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_profile: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_insights ──────────────────────────────────────
  // ALE insights and analytics.

  server.tool(
    "mind_insights",
    "Read what MIND's Autonomous Learning Engine has already noticed about the user without being asked — patterns, weekly summaries, and proactive intelligence generated in the background — or trigger a fresh analysis pass on demand. Reach for this when the user asks \"what have you noticed\" or \"anything I'm missing\"; reach for mind_query when you already know what you're looking for. Actions: list (recent insights), unread_count, view (read one, marks it seen), feedback (rate helpful/not_helpful — tunes future insights), analyze (trigger a new pass now), weekly_summary, context (raw ALE state). 'No insights available' means the engine hasn't generated any yet for this account or period — call analyze to trigger a fresh pass rather than assuming nothing is happening in the graph.",
    {
      action: z
        .enum(["list", "unread_count", "view", "feedback", "analyze", "weekly_summary", "context"])
        .describe("Action: list (recent insights), unread_count, view (mark seen), feedback (rate), analyze (trigger analysis), weekly_summary, context (ALE context)"),
      insight_id: z.string().optional().describe("Insight ID for view/feedback actions"),
      rating: z
        .enum(["helpful", "not_helpful"])
        .optional()
        .describe("Rating for feedback action"),
      limit: z.number().optional().default(10).describe("Max insights to return"),
    },
    async ({ action, insight_id, rating, limit }) => {
      try {
        switch (action) {
          case "list": {
            const result = await client.insightsList(limit);
            const insights = result.insights ?? [];
            if (insights.length === 0) {
              return { content: [{ type: "text" as const, text: "No insights available." }] };
            }
            const lines = insights.map(
              (i: Record<string, unknown>) =>
                `• [${i.type ?? "insight"}] ${i.title ?? (i.content as string)?.slice(0, 100) ?? "—"} — ${i.created_at ?? ""} (id: ${i.insight_id ?? i.id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "unread_count": {
            const result = await client.insightsUnreadCount();
            return {
              content: [{ type: "text" as const, text: `Unread insights: ${result.count ?? 0}` }],
            };
          }

          case "view": {
            if (!insight_id) {
              return {
                content: [{ type: "text" as const, text: "Error: insight_id is required for view" }],
                isError: true,
              };
            }
            const result = await client.insightsView(insight_id);
            const lines = [
              `**${result.title ?? "Insight"}**`,
              `Type: ${result.type ?? "—"} | Created: ${result.created_at ?? "—"}`,
              "",
              result.content ?? "No content.",
            ];
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "feedback": {
            if (!insight_id || !rating) {
              return {
                content: [{ type: "text" as const, text: "Error: insight_id and rating are required for feedback" }],
                isError: true,
              };
            }
            await client.insightsFeedback(insight_id, rating);
            return {
              content: [{ type: "text" as const, text: `✅ Feedback recorded for insight ${insight_id}: ${rating}` }],
            };
          }

          case "analyze": {
            const result = await client.insightsAnalyze();
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Analysis triggered. ${result.message ?? result.status ?? "Processing..."}`,
                },
              ],
            };
          }

          case "weekly_summary": {
            const result = await client.insightsWeeklySummary();
            return {
              content: [{ type: "text" as const, text: result.summary ?? "No weekly summary available." }],
            };
          }

          case "context": {
            const result = await client.insightsContext();
            return {
              content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_insights: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_automate ──────────────────────────────────────
  // Automations and triggers.

  server.tool(
    "mind_automate",
    "Create and manage MIND-native automations — scheduled or event-triggered rules that run without a human or agent invoking them each time (e.g. a weekly CRM digest, a webhook that logs an event to a life project). This is for recurring MIND-internal work, not a general task scheduler for external systems. Actions: list/create/update/delete, run_now (fire immediately for testing), history (execution log). `trigger_config`/`action_config` are JSON strings, not objects — pass valid JSON or the call throws. An empty list means no automations are configured in this account yet, not that scheduled work isn't happening elsewhere.",
    {
      action: z
        .enum(["list", "create", "update", "delete", "run_now", "history"])
        .describe("Action: list/create/update/delete automations, run_now (trigger immediately), history (execution log)"),
      automation_id: z.string().optional().describe("Automation ID for update/delete/run_now/history"),
      name: z.string().optional().describe("Automation name for create/update"),
      trigger_type: z
        .string()
        .optional()
        .describe("Trigger type: schedule, webhook, event"),
      trigger_config: z
        .string()
        .optional()
        .describe("JSON config string for the trigger (e.g. cron expression, event name)"),
      action_type: z.string().optional().describe("Action type to execute when triggered"),
      action_config: z
        .string()
        .optional()
        .describe("JSON config string for the action"),
      enabled: z.boolean().optional().describe("Whether the automation is enabled"),
    },
    async ({ action, automation_id, name, trigger_type, trigger_config, action_type, action_config, enabled }) => {
      try {
        switch (action) {
          case "list": {
            const result = await client.listAutomations();
            const automations = result.automations ?? [];
            if (automations.length === 0) {
              return { content: [{ type: "text" as const, text: "No automations found." }] };
            }
            const lines = automations.map(
              (a) =>
                `• [${a.enabled ? "ON" : "OFF"}] ${a.task} — interval: ${a.interval} (runs: ${a.total_runs}, id: ${a.id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "create": {
            if (!name || !trigger_type || !action_type) {
              return {
                content: [{ type: "text" as const, text: "Error: name, trigger_type, and action_type are required for create" }],
                isError: true,
              };
            }
            const result = await client.createAutomation({
              name,
              trigger_type,
              trigger_config: trigger_config ? JSON.parse(trigger_config) : undefined,
              action_type,
              action_config: action_config ? JSON.parse(action_config) : undefined,
              enabled: enabled ?? true,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Automation created: "${result.name}" (id: ${result.automation_id ?? result.id})`,
                },
              ],
            };
          }

          case "update": {
            if (!automation_id) {
              return {
                content: [{ type: "text" as const, text: "Error: automation_id is required for update" }],
                isError: true,
              };
            }
            const patch: Record<string, unknown> = {};
            if (name) patch.name = name;
            if (trigger_type) patch.trigger_type = trigger_type;
            if (trigger_config) patch.trigger_config = JSON.parse(trigger_config);
            if (action_type) patch.action_type = action_type;
            if (action_config) patch.action_config = JSON.parse(action_config);
            if (enabled !== undefined) patch.enabled = enabled;
            const result = await client.updateAutomation(automation_id, patch);
            return {
              content: [{ type: "text" as const, text: `✅ Updated automation: "${result.name}"` }],
            };
          }

          case "delete": {
            if (!automation_id) {
              return {
                content: [{ type: "text" as const, text: "Error: automation_id is required for delete" }],
                isError: true,
              };
            }
            await client.deleteAutomation(automation_id);
            return {
              content: [{ type: "text" as const, text: `✅ Deleted automation ${automation_id}` }],
            };
          }

          case "run_now": {
            if (!automation_id) {
              return {
                content: [{ type: "text" as const, text: "Error: automation_id is required for run_now" }],
                isError: true,
              };
            }
            const result = await client.automationsRunNow(automation_id);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Automation triggered: ${result.status ?? "running"} (execution_id: ${result.execution_id ?? result.id ?? "—"})`,
                },
              ],
            };
          }

          case "history": {
            if (!automation_id) {
              return {
                content: [{ type: "text" as const, text: "Error: automation_id is required for history" }],
                isError: true,
              };
            }
            const result = await client.automationsHistory(automation_id);
            const executions = result.executions ?? [];
            if (executions.length === 0) {
              return { content: [{ type: "text" as const, text: "No execution history found." }] };
            }
            const lines = executions.map(
              (e: Record<string, unknown>) =>
                `• [${e.status}] ${e.started_at ?? "—"}${e.completed_at ? ` → ${e.completed_at}` : ""} (id: ${e.execution_id ?? e.id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_automate: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_notify ────────────────────────────────────────
  // Notifications management.

  server.tool(
    "mind_notify",
    "Read and manage the user's MIND notification inbox — alerts, reminders, insight pings, and system messages generated by other MIND features. It is not a way to send a notification yourself. Use this to check what MIND has already surfaced to the user, or to clear it down; for the underlying event (why an insight fired, what an alert refers to) follow up with the originating tool (mind_insights, mind_sense, etc.) or mind_query. Actions: list, mark_read, mark_all_read, stats (total/unread/read counts). 'No notifications' or unread:0 means nothing has been pushed to the inbox — a quiet inbox and a quiet graph are different claims.",
    {
      action: z
        .enum(["list", "mark_read", "mark_all_read", "stats"])
        .describe("Action: list (view notifications), mark_read (single), mark_all_read (all), stats (overview)"),
      notification_id: z.string().optional().describe("Notification ID for mark_read"),
      limit: z.number().optional().default(20).describe("Max notifications to return"),
    },
    async ({ action, notification_id, limit }) => {
      try {
        switch (action) {
          case "list": {
            const result = await client.notificationsList(limit);
            const notifications = result.notifications ?? [];
            if (notifications.length === 0) {
              return { content: [{ type: "text" as const, text: "No notifications." }] };
            }
            const lines = notifications.map(
              (n) =>
                `• [${n.read ? "read" : "NEW"}] ${n.title ?? n.message ?? "—"} — ${n.created_at ?? ""} (id: ${n.notification_id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "mark_read": {
            if (!notification_id) {
              return {
                content: [{ type: "text" as const, text: "Error: notification_id is required for mark_read" }],
                isError: true,
              };
            }
            await client.notificationsMarkRead(notification_id);
            return {
              content: [{ type: "text" as const, text: `✅ Marked notification ${notification_id} as read.` }],
            };
          }

          case "mark_all_read": {
            const result = await client.notificationsMarkAllRead();
            return {
              content: [{ type: "text" as const, text: `✅ Marked ${result.count ?? "all"} notifications as read.` }],
            };
          }

          case "stats": {
            const result = await client.notificationsStats();
            const lines = [
              "🔔 Notification Stats",
              `• Total: ${result.total ?? 0}`,
              `• Unread: ${result.unread ?? 0}`,
              `• Read: ${result.read ?? 0}`,
            ];
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_notify: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_sessions ──────────────────────────────────────
  // "Agent Sessions in MIND Chat" — logs THIS agent's own live session into
  // MIND as a tagged Agent Session so Anthony can read the transcript and
  // reply from MIND Chat → Agents. Backed by
  // backend/routes/agent_session_routes.py, prefix
  // /developer/v1/agent-sessions. See the full AGENT SESSION PROTOCOL in
  // integration-guide.ts (embedded verbatim in SERVER_INSTRUCTIONS and the
  // sync-agent-session prompt) — the compact version below is repeated here
  // so a client that only ever reads tool descriptions still gets it.

  server.tool(
    "mind_sessions",
    "Log THIS agent's own live session into MIND Chat → Agents, so Anthony can read the transcript and reply — his reply reaches you on your next turn. Distinct from mind_remember (one durable fact) and mind_train (teaching the KG): this is the live, turn-by-turn session log, mirrored into a MIND document when you close it.\n\n" +
      "PROTOCOL (do this every session): " +
      "1) CONNECT — as soon as mind_context succeeds, call action=open with source_key (your assigned MIND Chat toggle, e.g. \"claude-code-1\"), external_session_id (your runtime's own session id), runtime, title (first user ask, 6-10 words), machine/cwd/repo/branch/model. If `resumed` is true, read `tail` before answering, and answer everything in `pending_replies` first — those arrived while you were away. " +
      "2) EVERY TURN — after you finish replying, call action=append with the user's message and your final reply (role user / assistant); tool calls go in as role=tool one-line summaries, never raw payloads. Check `pending_replies` on the response and answer them next turn. action=reply is a shortcut for appending a single assistant-role message when you have no user message to log alongside it. " +
      "3) IDLE — MIND marks the session idle after 30 minutes with no append; the next append revives it, nothing to do meanwhile. " +
      "4) TERMINATE — on exit, compaction, or \"done\", call action=close with a summary (what was asked, what shipped with ids/PR numbers, what is still undone); MIND mirrors the transcript into your Sessions folder as a document. " +
      "5) HANDOFF — to pass the conversation to another agent, call action=handoff with to_source_key=<their toggle>; they see it in their session list with the transcript as context. " +
      "6) SHARE — to let another MIND user follow this session, call action=share with grantee_username and role (\"viewer\" read-only, the default, or \"replier\" which also lets them reply — a reply is a live action that wakes your process via wake_url, so grant it deliberately). It's a live mirror, never a copy: they always see the current transcript, and revoking (action=revoke_share) removes their access immediately. Never share a session with anyone who shouldn't see its full transcript.\n" +
      "Never claim a session is synced without the session_id MIND returned. Never log secrets or raw tool payloads.\n\n" +
      "Actions: open, append, close, list, get, reply (alias for append of one assistant message), inbox (undelivered mind-origin replies), handoff, sources (source_action=list|create|update|delete manages the MIND Chat sidebar toggles — auto-created on first open with an unknown source_key), share (grant another MIND account viewer or replier access — owner only), list_shares (owner only), revoke_share (owner only).",
    {
      action: z
        .enum([
          "open",
          "append",
          "close",
          "list",
          "get",
          "reply",
          "inbox",
          "handoff",
          "sources",
          "share",
          "list_shares",
          "revoke_share",
        ])
        .describe("Which agent-session operation to perform."),
      // open
      source_key: z.string().optional().describe("Your assigned MIND Chat sidebar toggle slug, e.g. \"claude-code-1\" — required for open; also filters list; also required for sources action=create (as the new source's key)."),
      external_session_id: z.string().optional().describe("Your runtime's own session id — required for open. Idempotent: opening the same (source_key, external_session_id) again resumes the existing session instead of creating a new one."),
      runtime: z.string().optional().describe("Runtime name, e.g. \"claude-code\", \"codex\", \"cursor\", \"openclaw\", \"grok\", \"n8n\", \"custom\" — open (used if the source is auto-created); sources action=create/update."),
      source_label: z.string().optional().describe("Human-readable label for an auto-created source on open, e.g. \"Claude Code 1\" — defaults to the titlecased source_key if omitted."),
      title: z.string().optional().describe("Session title (first user ask, 6-10 words) — open (initial) or append (updates it)."),
      machine: z.string().optional().describe("Machine identifier — open."),
      cwd: z.string().optional().describe("Working directory — open."),
      repo: z.string().optional().describe("Repository name — open."),
      branch: z.string().optional().describe("Git branch — open."),
      model: z.string().optional().describe("LLM model in use — open."),
      tags: z.array(z.string()).optional().describe("Freeform tags — open."),
      // append / reply
      session_id: z.string().optional().describe("Session id returned by open — required for append/close/get/inbox/handoff."),
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant", "system", "tool"]),
            content: z.string(),
            origin: z.enum(["agent"]).optional(),
            meta: z.record(z.string(), z.any()).optional(),
            created_at: z.string().optional(),
          })
        )
        .optional()
        .describe("Messages to append, in order — required for append. Tool-call messages should be role=tool, one-line summaries only, never raw payloads."),
      content: z.string().optional().describe("Message text — required for reply (appended as a single role=assistant message)."),
      // close
      summary: z.string().optional().describe("What was asked, what shipped (with ids/PR numbers), what is still undone — close. If omitted, MIND builds one from the transcript."),
      // list / close (status set) share this field
      status: z.enum(["active", "idle", "ended"]).optional().describe("close: pass \"ended\" to explicitly close (default when summary is given). list: filter sessions by status."),
      q: z.string().optional().describe("Free-text search over title/preview — list."),
      limit: z.number().int().optional().describe("Max results — list (default 30) / get (default 200, messages)."),
      before: z.string().optional().describe("Pagination cursor (last_activity_at) — list."),
      before_seq: z.number().int().optional().describe("Return messages with seq before this value — get."),
      // handoff
      to_source_key: z.string().optional().describe("Target source's key to hand this session off to — required for handoff."),
      // sources
      source_action: z.enum(["list", "create", "update", "delete"]).optional().describe("Sub-action for action=sources (default list)."),
      source_id: z.string().optional().describe("Source id — required for sources action=update/delete."),
      key: z.string().optional().describe("New source's key slug — required for sources action=create."),
      label: z.string().optional().describe("Source label, e.g. \"Claude Code 1\" — sources action=create (required) / update."),
      color: z.string().optional().describe("Sidebar chip color — sources action=create/update."),
      wake_url: z.string().optional().describe("Optional push endpoint MIND POSTs {session_id, reply} to (fire-and-forget, 5s timeout) when the user replies — sources action=create/update."),
      force: z.boolean().optional().describe("sources action=delete: also delete the source's sessions instead of failing 409 when sessions exist."),
      // share / list_shares / revoke_share
      grantee_username: z.string().optional().describe("MIND username to share with — required for share."),
      role: z.enum(["viewer", "replier"]).optional().describe("Role to grant — share (default \"viewer\"). \"replier\" additionally allows the grantee to reply, which reaches you via wake_url."),
      share_id: z.string().optional().describe("Share grant id (from share or list_shares) — required for revoke_share."),
    },
    async (args) => {
      const { action } = args;
      try {
        switch (action) {
          case "open": {
            const { source_key, external_session_id } = args;
            if (!source_key) return err("Error: 'source_key' is required for open.");
            if (!external_session_id) return err("Error: 'external_session_id' is required for open.");
            return ok(
              await client.openAgentSession({
                source_key,
                external_session_id,
                runtime: args.runtime,
                source_label: args.source_label,
                title: args.title,
                machine: args.machine,
                cwd: args.cwd,
                repo: args.repo,
                branch: args.branch,
                model: args.model,
                tags: args.tags,
              })
            );
          }

          case "append": {
            const { session_id, messages } = args;
            if (!session_id) return err("Error: 'session_id' is required for append.");
            if (!messages?.length) return err("Error: 'messages' (at least one) is required for append.");
            return ok(await client.appendAgentSession(session_id, messages, args.title));
          }

          case "reply": {
            const { session_id, content } = args;
            if (!session_id) return err("Error: 'session_id' is required for reply.");
            if (!content) return err("Error: 'content' is required for reply.");
            return ok(
              await client.appendAgentSession(session_id, [{ role: "assistant", content }])
            );
          }

          case "close": {
            const { session_id } = args;
            if (!session_id) return err("Error: 'session_id' is required for close.");
            return ok(
              await client.closeAgentSession(session_id, {
                summary: args.summary,
                status: args.status === "ended" ? "ended" : undefined,
              })
            );
          }

          case "list":
            return ok(
              await client.listAgentSessions({
                source_key: args.source_key,
                status: args.status,
                q: args.q,
                limit: args.limit,
                before: args.before,
              })
            );

          case "get": {
            const { session_id } = args;
            if (!session_id) return err("Error: 'session_id' is required for get.");
            return ok(
              await client.getAgentSession(session_id, {
                limit: args.limit,
                before_seq: args.before_seq,
              })
            );
          }

          case "inbox": {
            const { session_id } = args;
            if (!session_id) return err("Error: 'session_id' is required for inbox.");
            return ok(await client.agentSessionInbox(session_id));
          }

          case "handoff": {
            const { session_id, to_source_key } = args;
            if (!session_id) return err("Error: 'session_id' is required for handoff.");
            if (!to_source_key) return err("Error: 'to_source_key' is required for handoff.");
            return ok(await client.handoffAgentSession(session_id, to_source_key));
          }

          case "sources": {
            const sourceAction = args.source_action ?? "list";
            switch (sourceAction) {
              case "list":
                return ok(await client.listAgentSessionSources());

              case "create": {
                const { key, label, runtime } = args;
                if (!key) return err("Error: 'key' is required for sources action=create.");
                if (!label) return err("Error: 'label' is required for sources action=create.");
                if (!runtime) return err("Error: 'runtime' is required for sources action=create.");
                return ok(
                  await client.createAgentSessionSource({
                    key,
                    label,
                    runtime,
                    color: args.color,
                    wake_url: args.wake_url,
                  })
                );
              }

              case "update": {
                const { source_id } = args;
                if (!source_id) return err("Error: 'source_id' is required for sources action=update.");
                return ok(
                  await client.updateAgentSessionSource(source_id, {
                    label: args.label,
                    runtime: args.runtime,
                    color: args.color,
                    wake_url: args.wake_url,
                  })
                );
              }

              case "delete": {
                const { source_id } = args;
                if (!source_id) return err("Error: 'source_id' is required for sources action=delete.");
                await client.deleteAgentSessionSource(source_id, args.force);
                return ok({ ok: true, source_id });
              }

              default: {
                const _exhaustive: never = sourceAction;
                return err(`Unknown source_action: ${_exhaustive}`);
              }
            }
          }

          case "share": {
            const { session_id, grantee_username } = args;
            if (!session_id) return err("Error: 'session_id' is required for share.");
            if (!grantee_username) return err("Error: 'grantee_username' is required for share.");
            return ok(
              await client.createAgentSessionShare(session_id, {
                grantee_username,
                role: args.role,
              })
            );
          }

          case "list_shares": {
            const { session_id } = args;
            if (!session_id) return err("Error: 'session_id' is required for list_shares.");
            return ok(await client.listAgentSessionShares(session_id));
          }

          case "revoke_share": {
            const { session_id, share_id } = args;
            if (!session_id) return err("Error: 'session_id' is required for revoke_share.");
            if (!share_id) return err("Error: 'share_id' is required for revoke_share.");
            await client.revokeAgentSessionShare(session_id, share_id);
            return ok({ ok: true, session_id, share_id });
          }

          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_sessions ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_sessions error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── MIND Front Layer (typed-document taxonomy / "MIND Sense") ─────────────
  // Three tools that expose the 16 typed-document templates and the typed-save flow.
  // The same templates power the developer API endpoints under /v1/templates.

  server.tool(
    "mind_list_templates",
    "List the 16 MIND Front Layer template types (SOUL, IDENTITY, BELIEFS, USER, AGENTS, TOOLS, SENSES, SKILLS, BEHAVIOR, LESSON, DECISION, POLICY, WORKFLOW, PREFERENCE, GOAL, RELATIONSHIP). Use this first to see what typed documents an agent can fill in. Each entry includes a short description and the source_tag used when storing filled documents.",
    {},
    async () => {
      try {
        const result = await client.listFrontLayerTemplates();
        const lines = [
          `📋 MIND Front Layer — ${result.count} typed-document templates`,
          "",
        ];
        for (const t of result.templates) {
          lines.push(`• ${t.type.padEnd(13)} — ${t.description}`);
        }
        lines.push("");
        lines.push("Fetch one with mind_get_template(type=\"<TYPE>\")");
        lines.push("Save a filled doc with mind_save_typed(type=\"<TYPE>\", title=..., content=...)");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error listing templates: ${err}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "mind_get_template",
    "Fetch the full augmented markdown for one MIND Front Layer template. Returns a self-contained spec — when to create a document of this type, what slots to fill, and how to store the filled copy. Always read the template before writing a typed document.",
    {
      type: z
        .string()
        .describe(
          "One of the 16 canonical types, upper-case (e.g. SOUL, BEHAVIOR, LESSON, POLICY, GOAL). Use mind_list_templates to see all valid values."
        ),
    },
    async ({ type }) => {
      try {
        const result = await client.getFrontLayerTemplate(type);
        const lines = [
          `📄 ${result.type} template`,
          `Description: ${result.description}`,
          `Source tag (use this when storing): ${result.source_tag}`,
          `Default tags: ${result.default_tags.join(", ")}`,
          "",
          result.body,
          "",
          `--- Store via: ${result.store_via} ---`,
        ];
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error fetching template: ${err}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "mind_save_typed",
    "Save a filled-out Front Layer document with the proper type tag so retrieval can filter by it later. Wraps mind document creation and pre-bakes the source tag (`front-layer-<type>`). Use this — not raw mind_remember — for any SOUL/IDENTITY/BELIEFS/USER/BEHAVIOR/LESSON/POLICY/etc. document. Pass the markdown body (frontmatter + content) as the `content` field.",
    {
      type: z
        .string()
        .describe(
          "The Front Layer type for this document (e.g. BEHAVIOR, LESSON, POLICY). Must match one of the 16 canonical types."
        ),
      title: z
        .string()
        .describe("Short, human-readable title for the document — used in retrieval and the documents UI."),
      content: z
        .string()
        .describe(
          "Full markdown body of the typed document including the frontmatter block (---type, id, slots, ---) followed by the human-readable sections."
        ),
    },
    async ({ type, title, content }) => {
      try {
        const result = await client.saveTypedDocument(type, title, content);
        const lines = [
          `✅ Saved as ${type} document`,
          `id:    ${result.id}`,
          `title: ${result.title ?? title}`,
          `source: front-layer-${type.toLowerCase()}`,
          `status: ${result.status ?? "PROCESSED"}`,
        ];
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error saving typed document: ${err}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "mind_bootstrap_templates",
    "Seed all 16 MIND Front Layer templates into this MIND tenant as system documents. After running, the templates become queryable through mind_query so agents can ask 'what should I fill out for SOUL?' and retrieve the spec from their own knowledge graph. Idempotent — re-runs create fresh copies. Run once per new tenant.",
    {},
    async () => {
      try {
        const result = await client.bootstrapFrontLayerTemplates();
        const lines = [
          `🌱 Bootstrapped ${result.bootstrapped} of ${result.total} Front Layer templates into your MIND.`,
          "",
        ];
        for (const r of result.results) {
          if (r.status === "PROCESSED") {
            lines.push(`  ✅ ${r.type.padEnd(13)} — ${r.title ?? ""}`);
          } else {
            lines.push(`  ❌ ${r.type.padEnd(13)} — ${r.status}${r.error ? `: ${r.error}` : ""}`);
          }
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error bootstrapping templates: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_agents ────────────────────────────────────────
  // Admin-only registry of every agent across MINDapp + the VPS fleet.
  // Surface UI: https://m-i-n-d.ai/agents · Backend: /admin/agents/*
  // Use this BEFORE creating a new agent so you don't collide with an
  // existing slug, and AFTER any non-trivial work to update status,
  // current_job, or responsibilities.

  server.tool(
    "mind_agents",
    "Admin-only Agent Command Center — canonical registry of every Astra AI agent (running on VPS, planned, archived). Query before scaffolding a new agent. Update status / current_job / responsibilities after non-trivial work. Every agent is owned by a MIND account (owner_username) and can be transferred or shared with other accounts as owner/viewer. Backed by /admin/agents on the MIND backend; admin API key required.",
    {
      action: z
        .enum([
          "list",
          "get",
          "create",
          "update",
          "delete",
          "heartbeat",
          "probe",
          "log_activity",
          "list_activities",
          "import_from_mind",
          "seed_known",
          "set_status",
          "set_current_job",
          "transfer_owner",
          "share",
          "list_shares",
          "revoke_share",
          "list_invoices",
          "link_invoice",
          "unlink_invoice",
          "create_invoice",
          "list_workflows",
          "link_workflow",
          "unlink_workflow",
          "used_by",
        ])
        .describe(
          "Action: list (filter+stats), get (detail+recent activities), create, update (partial), delete (soft archive; pass hard=true to remove), heartbeat (push from agent runtime), probe (HTTP/OpenClaw liveness probe), log_activity (manual note), list_activities, import_from_mind (enrich from agent-identity docs), seed_known (idempotent upsert of canonical seed), set_status (shortcut update), set_current_job (shortcut update), transfer_owner (move the agent to another account's board — needs owner_username), share (grant another account access — needs grantee_username + share_role), list_shares (who the agent is shared with), revoke_share (drop a share grant — needs share_id), list_invoices (invoices linked to an agent), link_invoice (attach an existing invoice id), unlink_invoice (detach an invoice id), create_invoice (create a new Invoice Agent draft + link it), list_workflows (workflows linked to an agent), link_workflow (attach an existing workflow slug — needs workflow_slug), unlink_workflow (detach a workflow — needs workflow_slug), used_by (inverse view: which agents call this workflow)"
        ),
      slug: z.string().optional().describe("Agent slug (lowercase, dashes). Required for get/update/delete/heartbeat/probe/activities/set_*/transfer_owner/share/list_shares/revoke_share."),
      // ownership / sharing
      owner_username: z.string().optional().describe("MIND account username to transfer the agent to (action=transfer_owner). The account must already exist."),
      grantee_username: z.string().optional().describe("MIND account username to share the agent with (action=share). The account must already exist."),
      share_role: z.enum(["owner", "viewer"]).optional().describe("Role for action=share: 'owner' (full control) or 'viewer' (read-only). Default: viewer."),
      share_id: z.string().optional().describe("Share-grant id to revoke (action=revoke_share). Get it from list_shares."),
      // create / update fields
      name: z.string().optional().describe("Display name."),
      description: z.string().optional().describe("One-paragraph description of the agent."),
      status: z
        .enum(["running", "paused", "planned", "archived", "error"])
        .optional()
        .describe("Lifecycle status."),
      cadence: z
        .enum(["continuous", "scheduled", "on-demand"])
        .optional()
        .describe("How the agent runs."),
      host: z.string().optional().describe("Host: DO1 / DO2-LEO / local / render / vercel / atlas-droplet / other."),
      host_address: z.string().optional().describe("IP or hostname (e.g. 45.55.233.204)."),
      port: z.number().optional().describe("TCP port if applicable."),
      health_url: z.string().optional().describe("Optional HTTP health endpoint for the probe action."),
      source_path: z.string().optional().describe("Local path to the agent directory (e.g. /Users/anthonyjconti/Documents/Agents/Foo)."),
      source_repo: z.string().optional().describe("Git repo URL when applicable."),
      mind_identity_doc_id: z.string().optional().describe("MIND document id for the agent-identity record."),
      responsibilities: z.array(z.string()).optional().describe("Bullet list of what the agent does."),
      triggers: z.array(z.string()).optional().describe("Canonical phrases that should invoke this agent."),
      tags: z.array(z.string()).optional().describe("Domain tags for filtering."),
      owner_email: z.string().optional().describe("Owner contact (defaults to anthony@theastraway.com)."),
      expected_interval_seconds: z
        .number()
        .optional()
        .describe("Expected heartbeat cadence in seconds; live_status thresholds compute against 2× / 4× this value."),
      authority_can_autonomous: z.array(z.string()).optional().describe("Things this agent can do without asking."),
      authority_requires_approval: z.array(z.string()).optional().describe("Things that need Anthony's sign-off."),
      // delete options
      hard: z.boolean().optional().describe("If true with action=delete, permanently remove. Default soft-archives."),
      // heartbeat fields
      current_job: z.string().optional().describe("What the agent is doing right now (set on heartbeat or set_current_job)."),
      metrics: z.record(z.string(), z.any()).optional().describe("Arbitrary metrics blob attached to a heartbeat."),
      note: z.string().optional().describe("Free-form note attached to a heartbeat."),
      source: z.string().optional().describe("Source attribution for heartbeats / activities."),
      // log_activity fields
      activity_type: z.string().optional().describe("Activity type for log_activity (e.g. job_done, job_start, error, note)."),
      activity_payload: z.record(z.string(), z.any()).optional().describe("Activity payload for log_activity."),
      // list / list_activities filters
      list_status: z
        .enum(["running", "paused", "planned", "archived", "error"])
        .optional()
        .describe("Filter by status when listing."),
      list_host: z.string().optional().describe("Filter by host when listing."),
      list_tag: z.string().optional().describe("Filter by tag when listing."),
      list_query: z.string().optional().describe("Free-text search when listing — case-insensitive substring match across slug, name, description, and tags."),
      include_archived: z.boolean().optional().describe("Include archived records when listing (default false)."),
      limit: z.number().optional().describe("Max activities to return for list_activities (default 50)."),
      // seed_known
      overwrite: z.boolean().optional().describe("If true with action=seed_known, reset existing records to seed defaults."),
      // invoice linking
      invoice_id: z.string().optional().describe("Invoice id — required for link_invoice / unlink_invoice."),
      bill_to_name: z.string().optional().describe("Recipient name for create_invoice (required)."),
      bill_to_company: z.string().optional().describe("Recipient company for create_invoice."),
      bill_to_email: z.string().optional().describe("Recipient email for create_invoice."),
      line_item_description: z.string().optional().describe("Single line-item description for create_invoice."),
      quantity: z.number().optional().describe("Line-item quantity for create_invoice (default 1)."),
      unit_price: z.number().optional().describe("Line-item unit price for create_invoice (default 0)."),
      currency: z.string().optional().describe("Invoice currency for create_invoice (default USD)."),
      invoice_notes: z.string().optional().describe("Notes shown on the invoice for create_invoice."),
      // workflow linking + kind discriminator
      kind: z
        .enum(["agent", "workflow"])
        .optional()
        .describe(
          "Registry kind. Pass on create to scaffold a Workflow card instead of an Agent. Pass on action=list (via list_kind) to filter the board."
        ),
      list_kind: z
        .enum(["agent", "workflow"])
        .optional()
        .describe("Filter the board by kind when listing — 'agent' or 'workflow'. Omit to return both."),
      workflow_slug: z.string().optional().describe("Workflow slug — required for link_workflow / unlink_workflow."),
      trigger_summary: z.string().optional().describe("One-line description of what fires this workflow (kind='workflow' only)."),
      inputs_summary: z.string().optional().describe("One-line description of the data this workflow consumes."),
      outputs_summary: z.string().optional().describe("One-line description of the artifacts this workflow produces."),
      credentials_required: z
        .array(z.string())
        .optional()
        .describe("Named credentials this workflow touches (e.g. ['OpenAI API key', 'Resend API key', 'MIND tenant key'])."),
      steps_json: z
        .string()
        .optional()
        .describe(
          "JSON-encoded array of WorkflowStep dicts (kind='workflow' only). Each step: {order, name, description, kind, credentials[], inputs[], outputs[], notes}. Step kind ∈ {trigger, action, ai, branch, loop, wait, notify, output}."
        ),
    },
    async (args) => {
      const {
        action,
        slug,
        name,
        description,
        status,
        cadence,
        host,
        host_address,
        port,
        health_url,
        source_path,
        source_repo,
        mind_identity_doc_id,
        responsibilities,
        triggers,
        tags,
        owner_email,
        owner_username,
        grantee_username,
        share_role,
        share_id,
        expected_interval_seconds,
        authority_can_autonomous,
        authority_requires_approval,
        hard,
        current_job,
        metrics,
        note,
        source,
        activity_type,
        activity_payload,
        list_status,
        list_host,
        list_tag,
        list_query,
        include_archived,
        limit,
        overwrite,
        invoice_id,
        bill_to_name,
        bill_to_company,
        bill_to_email,
        line_item_description,
        quantity,
        unit_price,
        currency,
        invoice_notes,
        kind,
        list_kind,
        workflow_slug,
        trigger_summary,
        inputs_summary,
        outputs_summary,
        credentials_required,
        steps_json,
      } = args;

      const requireSlug = (label: string): string | null => {
        if (!slug) {
          return `Error: 'slug' is required for action=${label}.`;
        }
        return null;
      };

      const buildPayload = (): Record<string, unknown> => {
        const payload: Record<string, unknown> = {};
        if (name !== undefined) payload.name = name;
        if (description !== undefined) payload.description = description;
        if (status !== undefined) payload.status = status;
        if (cadence !== undefined) payload.cadence = cadence;
        if (host !== undefined) payload.host = host;
        if (host_address !== undefined) payload.host_address = host_address;
        if (port !== undefined) payload.port = port;
        if (health_url !== undefined) payload.health_url = health_url;
        if (source_path !== undefined) payload.source_path = source_path;
        if (source_repo !== undefined) payload.source_repo = source_repo;
        if (mind_identity_doc_id !== undefined) payload.mind_identity_doc_id = mind_identity_doc_id;
        if (responsibilities !== undefined) payload.responsibilities = responsibilities;
        if (triggers !== undefined) payload.triggers = triggers;
        if (tags !== undefined) payload.tags = tags;
        if (owner_email !== undefined) payload.owner_email = owner_email;
        if (expected_interval_seconds !== undefined) payload.expected_interval_seconds = expected_interval_seconds;
        if (current_job !== undefined) payload.current_job = current_job;
        if (authority_can_autonomous !== undefined || authority_requires_approval !== undefined) {
          payload.authority = {
            can_autonomous: authority_can_autonomous ?? [],
            requires_approval: authority_requires_approval ?? [],
          };
        }
        // Workflow-specific create/update fields. `kind` defaults server-side
        // to "agent" so it's only sent when the caller passes it explicitly.
        if (kind !== undefined) payload.kind = kind;
        if (trigger_summary !== undefined) payload.trigger_summary = trigger_summary;
        if (inputs_summary !== undefined) payload.inputs_summary = inputs_summary;
        if (outputs_summary !== undefined) payload.outputs_summary = outputs_summary;
        if (credentials_required !== undefined) payload.credentials_required = credentials_required;
        if (steps_json !== undefined) {
          try {
            const parsed = JSON.parse(steps_json);
            if (Array.isArray(parsed)) payload.steps = parsed;
          } catch {
            // Surface a clear error rather than silently sending invalid JSON.
            throw new Error(
              "steps_json must be a JSON-encoded array of WorkflowStep dicts."
            );
          }
        }
        return payload;
      };

      try {
        switch (action) {
          case "list": {
            const result = await client.listAgents({
              status: list_status,
              host: list_host,
              tag: list_tag,
              kind: list_kind,
              q: list_query,
              include_archived,
            });
            const lines: string[] = [];
            const s = result.stats as unknown as Record<string, number | undefined>;
            const get = (k: string) => s[k] ?? 0;
            const kindLine =
              s.agents !== undefined || s.workflows !== undefined
                ? `Kind: ${get("agents")} agents · ${get("workflows")} workflows`
                : "";
            lines.push(
              `Registry: ${get("total")} total · ${get("running")} running · ${get("planned")} planned · ${get("paused")} paused · ${get("error")} errored`,
              `Live: ${get("online")} online · ${get("stale")} stale · ${get("offline")} offline`,
              kindLine,
              ""
            );
            for (const a of result.agents) {
              const host = a.host ?? "—";
              const kindIcon = a.kind === "workflow" ? "⚙" : "🧠";
              lines.push(
                `• ${kindIcon} [${a.status.padEnd(8)}] ${a.slug.padEnd(28)} ${a.live_status.padEnd(7)} host=${host} owner=${a.owner_username ?? "—"} — ${a.name}`
              );
            }
            return { content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }] };
          }

          case "get": {
            const err = requireSlug("get");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const detail = await client.getAgent(slug!);
            const lines: string[] = [
              `${detail.name} (${detail.slug})`,
              `  status=${detail.status} · cadence=${detail.cadence} · live=${detail.live_status}`,
              `  owner=${detail.owner_username ?? "—"}${detail.your_role ? ` · your_role=${detail.your_role}` : ""}`,
              `  host=${detail.host ?? "—"}${detail.host_address ? ` (${detail.host_address})` : ""}`,
              `  last_heartbeat=${detail.last_heartbeat ?? "never"} · current_job=${detail.current_job ?? "—"}`,
              detail.description ? `  ${detail.description}` : "",
              detail.responsibilities.length
                ? `  Responsibilities:\n    - ${detail.responsibilities.join("\n    - ")}`
                : "",
              detail.tags.length ? `  Tags: ${detail.tags.join(", ")}` : "",
              detail.recent_activities?.length
                ? `  Recent activity: ${detail.recent_activities
                    .slice(0, 5)
                    .map((e) => `${e.type}@${e.ts.slice(0, 19)}`)
                    .join(" · ")}`
                : "",
            ].filter(Boolean);
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "create": {
            if (!slug || !name) {
              return {
                content: [
                  { type: "text" as const, text: "Error: 'slug' and 'name' are required for create." },
                ],
                isError: true,
              };
            }
            const payload: Record<string, unknown> = { slug, name, ...buildPayload() };
            const created = await client.createAgent(payload as never);
            return {
              content: [
                { type: "text" as const, text: `✅ Created agent: ${created.slug} (status=${created.status})` },
              ],
            };
          }

          case "update": {
            const err = requireSlug("update");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const payload = buildPayload();
            if (Object.keys(payload).length === 0) {
              return {
                content: [
                  { type: "text" as const, text: "Error: provide at least one field to update." },
                ],
                isError: true,
              };
            }
            const updated = await client.updateAgent(slug!, payload as never);
            return {
              content: [
                { type: "text" as const, text: `✅ Updated ${updated.slug} (status=${updated.status}, live=${updated.live_status})` },
              ],
            };
          }

          case "delete": {
            const err = requireSlug("delete");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const result = await client.deleteAgent(slug!, !!hard);
            return {
              content: [
                { type: "text" as const, text: `✅ ${result.hard ? "Deleted" : "Archived"} ${result.deleted}` },
              ],
            };
          }

          case "heartbeat": {
            const err = requireSlug("heartbeat");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const updated = await client.agentHeartbeat(slug!, {
              current_job,
              metrics,
              note,
              source: source ?? "mcp-agent",
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `💓 heartbeat ${updated.slug} → live=${updated.live_status}${updated.current_job ? ` · job="${updated.current_job}"` : ""}`,
                },
              ],
            };
          }

          case "probe": {
            const err = requireSlug("probe");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const result = await client.agentProbe(slug!);
            const p = result.probe;
            const summary = p.ok
              ? `✅ ${p.probe_kind ?? "probe"} OK · ${p.status_code ?? ""} · ${p.latency_ms ?? "?"}ms${p.endpoint ? ` · ${p.endpoint}` : ""}`
              : `❌ ${p.probe_kind ?? "probe"} failed: ${p.error ?? "no signal"}`;
            return { content: [{ type: "text" as const, text: summary }] };
          }

          case "log_activity": {
            const err = requireSlug("log_activity");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const activity = await client.logAgentActivity(slug!, {
              type: activity_type ?? "note",
              payload: activity_payload,
              source: source ?? "mcp-agent",
            });
            return {
              content: [
                { type: "text" as const, text: `📝 ${activity.type} logged for ${slug} (${activity.activity_id})` },
              ],
            };
          }

          case "list_activities": {
            const err = requireSlug("list_activities");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const result = await client.listAgentActivities(slug!, limit ?? 50);
            if (!result.activities.length) {
              return { content: [{ type: "text" as const, text: `No activity for ${slug}.` }] };
            }
            const lines = result.activities.map(
              (e) => `  ${e.ts} · ${e.type.padEnd(15)} · src=${e.source}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "import_from_mind": {
            const result = await client.importAgentsFromMind();
            if (result.error) {
              return {
                content: [{ type: "text" as const, text: `⚠️ import-from-mind: ${result.error}` }],
                isError: true,
              };
            }
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Enriched ${result.enriched} agent(s) from MIND identity docs (${result.skipped} skipped). Slugs: ${result.matched_slugs.join(", ") || "—"}`,
                },
              ],
            };
          }

          case "seed_known": {
            const result = await client.seedKnownAgents(!!overwrite);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Seed: +${result.inserted} new · ${result.updated} updated · ${result.skipped} unchanged · ${result.total_known} canonical`,
                },
              ],
            };
          }

          case "set_status": {
            const err = requireSlug("set_status");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!status) {
              return {
                content: [{ type: "text" as const, text: "Error: 'status' is required for set_status." }],
                isError: true,
              };
            }
            const updated = await client.updateAgent(slug!, { status } as never);
            return {
              content: [
                { type: "text" as const, text: `✅ ${updated.slug} → status=${updated.status}` },
              ],
            };
          }

          case "set_current_job": {
            const err = requireSlug("set_current_job");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (current_job === undefined) {
              return {
                content: [
                  { type: "text" as const, text: "Error: 'current_job' is required for set_current_job." },
                ],
                isError: true,
              };
            }
            const updated = await client.updateAgent(slug!, { current_job } as never);
            return {
              content: [
                { type: "text" as const, text: `✅ ${updated.slug} → current_job="${updated.current_job ?? ""}"` },
              ],
            };
          }

          case "transfer_owner": {
            const err = requireSlug("transfer_owner");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!owner_username) {
              return {
                content: [
                  { type: "text" as const, text: "Error: 'owner_username' is required for transfer_owner — the MIND account to move the agent to." },
                ],
                isError: true,
              };
            }
            const moved = await client.transferAgentOwner(slug!, owner_username);
            return {
              content: [
                { type: "text" as const, text: `✅ ${moved.slug} → owner_username="${moved.owner_username}" (moved to that account's board)` },
              ],
            };
          }

          case "share": {
            const err = requireSlug("share");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!grantee_username) {
              return {
                content: [
                  { type: "text" as const, text: "Error: 'grantee_username' is required for share — the MIND account to grant access to." },
                ],
                isError: true,
              };
            }
            const role = share_role ?? "viewer";
            const grant = await client.shareAgent(slug!, grantee_username, role);
            return {
              content: [
                { type: "text" as const, text: `✅ Shared ${slug} with ${grant.grantee_username} as ${grant.role} (share_id: ${grant.id})` },
              ],
            };
          }

          case "list_shares": {
            const err = requireSlug("list_shares");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const result = await client.listAgentShares(slug!);
            const lines: string[] = [`${slug} — owner: ${result.owner_username}`];
            if (!result.shares.length) {
              lines.push("  (not shared with any other account)");
            } else {
              for (const sh of result.shares) {
                lines.push(`  • ${sh.grantee_username} — ${sh.role} (share_id: ${sh.id})`);
              }
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }

          case "revoke_share": {
            const err = requireSlug("revoke_share");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!share_id) {
              return {
                content: [
                  { type: "text" as const, text: "Error: 'share_id' is required for revoke_share — get it from list_shares." },
                ],
                isError: true,
              };
            }
            await client.revokeAgentShare(slug!, share_id);
            return {
              content: [
                { type: "text" as const, text: `✅ Revoked share ${share_id} on ${slug}` },
              ],
            };
          }

          case "list_invoices": {
            const err = requireSlug("list_invoices");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const result = await client.listAgentInvoices(slug!);
            if (!result.invoices.length) {
              return { content: [{ type: "text" as const, text: `No invoices linked to ${slug}.` }] };
            }
            const lines = result.invoices.map(
              (i) =>
                `  ${i.invoice_number.padEnd(10)} ${i.status.padEnd(8)} ${i.currency} ${i.total
                  .toFixed(2)
                  .padStart(10)} — ${i.bill_to_company ?? i.bill_to_name ?? "—"}`
            );
            return {
              content: [
                { type: "text" as const, text: `Invoices linked to ${slug}:\n${lines.join("\n")}` },
              ],
            };
          }

          case "link_invoice": {
            const err = requireSlug("link_invoice");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!invoice_id) {
              return {
                content: [{ type: "text" as const, text: "Error: 'invoice_id' is required for link_invoice." }],
                isError: true,
              };
            }
            const updated = await client.linkAgentInvoice(slug!, invoice_id);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `🔗 Linked invoice ${invoice_id} to ${updated.slug} (${updated.linked_invoices.length} total).`,
                },
              ],
            };
          }

          case "unlink_invoice": {
            const err = requireSlug("unlink_invoice");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!invoice_id) {
              return {
                content: [{ type: "text" as const, text: "Error: 'invoice_id' is required for unlink_invoice." }],
                isError: true,
              };
            }
            const updated = await client.unlinkAgentInvoice(slug!, invoice_id);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✂️ Unlinked invoice ${invoice_id} from ${updated.slug} (${updated.linked_invoices.length} remain).`,
                },
              ],
            };
          }

          case "create_invoice": {
            const err = requireSlug("create_invoice");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!bill_to_name) {
              return {
                content: [
                  { type: "text" as const, text: "Error: 'bill_to_name' is required for create_invoice." },
                ],
                isError: true,
              };
            }
            const invoicePayload: Record<string, unknown> = {
              bill_from: {
                name: "Anthony Conti",
                company: "Astra AI, Inc.",
                email: "anthony@theastraway.com",
              },
              bill_to: {
                name: bill_to_name,
                company: bill_to_company ?? null,
                email: bill_to_email ?? null,
              },
              line_items: line_item_description
                ? [
                    {
                      description: line_item_description,
                      quantity: quantity ?? 1,
                      unit_price: unit_price ?? 0,
                    },
                  ]
                : [],
              currency: currency ?? "USD",
            };
            if (invoice_notes) invoicePayload.notes = invoice_notes;
            const res = await client.createAgentInvoice(slug!, invoicePayload);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `🧾 Created invoice ${res.invoice.invoice_number} (${res.invoice.currency} ${res.invoice.total.toFixed(
                    2
                  )}) and linked it to ${slug}.`,
                },
              ],
            };
          }

          case "list_workflows": {
            const err = requireSlug("list_workflows");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const result = await client.listAgentWorkflows(slug!);
            if (!result.workflows.length) {
              return { content: [{ type: "text" as const, text: `No workflows linked to ${slug}.` }] };
            }
            const lines = result.workflows.map(
              (w) =>
                `  ⚙ ${w.slug.padEnd(28)} steps=${String(w.step_count).padStart(2)} · ${w.trigger_summary ?? "(no trigger summary)"} — ${w.name}`
            );
            return {
              content: [
                { type: "text" as const, text: `Workflows linked to ${slug}:\n${lines.join("\n")}` },
              ],
            };
          }

          case "link_workflow": {
            const err = requireSlug("link_workflow");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!workflow_slug) {
              return {
                content: [{ type: "text" as const, text: "Error: 'workflow_slug' is required for link_workflow." }],
                isError: true,
              };
            }
            const updated = await client.linkAgentWorkflow(slug!, workflow_slug);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `🔗 Linked workflow ${workflow_slug} to ${updated.slug} (${updated.linked_workflows.length} total).`,
                },
              ],
            };
          }

          case "unlink_workflow": {
            const err = requireSlug("unlink_workflow");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            if (!workflow_slug) {
              return {
                content: [{ type: "text" as const, text: "Error: 'workflow_slug' is required for unlink_workflow." }],
                isError: true,
              };
            }
            const updated = await client.unlinkAgentWorkflow(slug!, workflow_slug);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✂️ Unlinked workflow ${workflow_slug} from ${updated.slug} (${updated.linked_workflows.length} remain).`,
                },
              ],
            };
          }

          case "used_by": {
            const err = requireSlug("used_by");
            if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
            const result = await client.workflowUsedBy(slug!);
            if (!result.agents.length) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `${result.kind === "workflow" ? "Workflow" : "Agent"} ${result.slug} is not linked from any agent yet.`,
                  },
                ],
              };
            }
            const lines = result.agents.map(
              (a) =>
                `  🧠 ${a.slug.padEnd(28)} host=${a.host ?? "—"} owner=${a.owner_username ?? "—"} — ${a.name}`
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${result.name} is linked from ${result.agents.length} agent(s):\n${lines.join("\n")}`,
                },
              ],
            };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `mind_agents error: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_tickets ───────────────────────────────────────
  // Every agent in the Command Center carries a ticket queue — client
  // feedback, critique, ideas, feature requests, bugs. File them, triage
  // them, comment on the thread, and mark them resolved. Backed by
  // /admin/agents/{slug}/tickets on the MIND backend; admin API key required.

  server.tool(
    "mind_tickets",
    "Agent ticket queue — file, view, answer, triage, and resolve tickets on any agent in the Command Center. A ticket is client feedback / critique / an idea / a feature request / a bug. Every ticket lives on an agent (agent_slug is always required) and auto-assigns to the Ernie triage agent. Use action=create to file one, action=comment to answer a thread, action=update or action=resolve to triage. Backed by /admin/agents/{slug}/tickets; admin API key required.",
    {
      action: z
        .enum(["list", "get", "create", "comment", "update", "resolve", "delete"])
        .describe(
          "Action: list (every ticket on an agent + stats), get (one ticket + its comment thread), create (file a new ticket), comment (add a reply to a ticket's thread — this is how you answer a ticket), update (triage — change status/priority/kind/assignee), resolve (shortcut: mark the ticket resolved), delete (remove the ticket, its comments, and its mirrored Life task)"
        ),
      agent_slug: z
        .string()
        .describe("Slug of the agent the ticket belongs to. REQUIRED for every action."),
      ticket_id: z
        .string()
        .optional()
        .describe("Ticket ID — required for get/comment/update/resolve/delete."),
      title: z.string().optional().describe("Ticket title — required for create."),
      body: z
        .string()
        .optional()
        .describe("Ticket body when action=create, or the comment text when action=comment."),
      kind: z
        .enum(["feedback", "critique", "idea", "feature", "bug"])
        .optional()
        .describe("Ticket kind (create or update). Defaults to 'feedback' on create."),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional()
        .describe("Ticket priority (create or update). Defaults to 'medium' on create."),
      status: z
        .enum(["open", "triaged", "in_progress", "resolved", "closed"])
        .optional()
        .describe("New status for action=update, or a status filter for action=list."),
      assignee: z
        .string()
        .optional()
        .describe("Reassign the ticket (action=update) to an agent slug or a username. Tickets default to the 'ernie' triage agent."),
    },
    async ({ action, agent_slug, ticket_id, title, body, kind, priority, status, assignee }) => {
      const err = (text: string) => ({
        content: [{ type: "text" as const, text }],
        isError: true,
      });
      const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

      const fmtTicket = (t: any) =>
        `• [${t.status}/${t.priority}] ${t.kind}: ${t.title}` +
        `${t.assignee ? ` → ${t.assignee}` : ""}` +
        `${t.comment_count ? ` · ${t.comment_count} comment(s)` : ""} — id: ${t.ticket_id}`;

      try {
        if (!agent_slug) {
          return err("Error: 'agent_slug' is required for every mind_tickets action.");
        }

        switch (action) {
          case "list": {
            const result = await client.listAgentTickets(agent_slug, status);
            const tickets = result.tickets ?? [];
            const s = result.stats ?? { total: 0, open: 0 };
            if (tickets.length === 0) {
              return ok(`No tickets on ${agent_slug}${status ? ` with status=${status}` : ""}.`);
            }
            return ok(
              `${agent_slug}: ${s.total} ticket(s) · ${s.open} open\n` +
                tickets.map(fmtTicket).join("\n")
            );
          }

          case "get": {
            if (!ticket_id) return err("Error: 'ticket_id' is required for get.");
            const t = await client.getAgentTicket(agent_slug, ticket_id);
            const lines: string[] = [
              fmtTicket(t),
              t.body ? `\n${t.body}` : "",
              t.created_by_label || t.created_by
                ? `\nFiled by ${t.created_by_label ?? t.created_by}${t.created_by_role ? ` (${t.created_by_role})` : ""} on ${t.created_at?.slice(0, 19) ?? "?"}`
                : "",
            ];
            const comments = t.comments ?? [];
            if (comments.length) {
              lines.push(`\nThread (${comments.length}):`);
              for (const c of comments) {
                lines.push(
                  `  — ${c.author_label ?? c.author} @ ${c.created_at?.slice(0, 19) ?? "?"}: ${c.body}`
                );
              }
            }
            return ok(lines.filter(Boolean).join("\n"));
          }

          case "create": {
            if (!title) return err("Error: 'title' is required to create a ticket.");
            const t = await client.createAgentTicket(agent_slug, {
              kind,
              title,
              body,
              priority,
            });
            return ok(`✅ Filed ticket on ${agent_slug}: ${fmtTicket(t)}`);
          }

          case "comment": {
            if (!ticket_id) return err("Error: 'ticket_id' is required for comment.");
            if (!body) return err("Error: 'body' (the comment text) is required for comment.");
            const c = await client.commentAgentTicket(agent_slug, ticket_id, body);
            return ok(`💬 Comment added to ticket ${ticket_id} (${c.comment_id}).`);
          }

          case "update": {
            if (!ticket_id) return err("Error: 'ticket_id' is required for update.");
            const patch: { status?: any; priority?: any; kind?: any; assignee?: string } = {};
            if (status !== undefined) patch.status = status;
            if (priority !== undefined) patch.priority = priority;
            if (kind !== undefined) patch.kind = kind;
            if (assignee !== undefined) patch.assignee = assignee;
            if (Object.keys(patch).length === 0) {
              return err("Error: provide at least one of status/priority/kind/assignee to update.");
            }
            const t = await client.updateAgentTicket(agent_slug, ticket_id, patch);
            return ok(`✅ Updated ticket: ${fmtTicket(t)}`);
          }

          case "resolve": {
            if (!ticket_id) return err("Error: 'ticket_id' is required for resolve.");
            const t = await client.updateAgentTicket(agent_slug, ticket_id, {
              status: "resolved",
            });
            return ok(`✅ Resolved ticket "${t.title}" on ${agent_slug}.`);
          }

          case "delete": {
            if (!ticket_id) return err("Error: 'ticket_id' is required for delete.");
            await client.deleteAgentTicket(agent_slug, ticket_id);
            return ok(`🗑️ Deleted ticket ${ticket_id} from ${agent_slug}.`);
          }

          default:
            return err(`Unknown action: ${action}`);
        }
      } catch (e) {
        return err(`mind_tickets error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_accounts ──────────────────────────────────────
  // Multi-MIND accounts: discover the MINDs this key's owner can access,
  // create new ones, and manage owners / viewers. Requires the server to
  // have MULTI_MIND_ACCOUNTS_ENABLED set.

  server.tool(
    "mind_accounts",
    "Manage multi-MIND accounts. A 'MIND' is a knowledge-graph account; one person can own or be granted access to many. Use to discover every MIND you can access (list), spin up a new one (create), permanently delete one (delete), see who can access a MIND (members), grant an existing user access (grant), email an invitation (invite), or switch into a granted MIND (switch — POST /developer/v1/accounts/switch; returns access_token JWT). Protocol: AstraAI=HQ, MIND=product, anthonyjconti=personal.",
    {
      action: z
        .enum(["list", "create", "delete", "members", "grant", "invite", "switch"])
        .describe(
          "list (every MIND you can access), create (a new MIND you own), delete (permanently delete a MIND you own), members (owners/viewers of a MIND), grant (give an existing user access), invite (email an invitation), switch (activate/enter a granted MIND — requires mind_username; returns access_token)"
        ),
      label: z
        .string()
        .optional()
        .describe("Display name for the new MIND (required for create)"),
      mind_username: z
        .string()
        .optional()
        .describe("Username of the MIND to manage (required for delete/members/grant/invite/switch)"),
      grantee_username: z
        .string()
        .optional()
        .describe("Existing MINDapp username to grant access to (required for grant)"),
      email: z
        .string()
        .optional()
        .describe("Email address to send an invitation to (required for invite)"),
      role: z
        .enum(["owner", "viewer"])
        .optional()
        .default("owner")
        .describe("Access level: owner (full access) or viewer (read-only)"),
    },
    async ({ action, label, mind_username, grantee_username, email, role }) => {
      try {
        switch (action) {
          case "list": {
            const res = await client.listMinds();
            if (!res.enabled) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "Multi-MIND accounts are not enabled for this MIND.",
                  },
                ],
              };
            }
            const lines = res.accounts.map(
              (a) =>
                `${a.is_active ? "▸" : " "} ${a.label} (@${a.username}) — ${a.role}${a.is_self ? " · you" : ""}`
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: `MINDs you can access (${res.accounts.length}):\n${lines.join("\n")}`,
                },
              ],
            };
          }
          case "create": {
            if (!label) {
              return {
                content: [{ type: "text" as const, text: "Error: label is required for create" }],
                isError: true,
              };
            }
            const res = await client.createMind(label);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Created MIND "${res.label}" (@${res.username}).`,
                },
              ],
            };
          }
          case "delete": {
            if (!mind_username) {
              return {
                content: [{ type: "text" as const, text: "Error: mind_username is required for delete" }],
                isError: true,
              };
            }
            await client.deleteMind(mind_username);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Permanently deleted MIND @${mind_username}.`,
                },
              ],
            };
          }
          case "members": {
            if (!mind_username) {
              return {
                content: [{ type: "text" as const, text: "Error: mind_username is required for members" }],
                isError: true,
              };
            }
            const res = await client.listMindMembers(mind_username);
            const members = res.members
              .map((m) => `• @${m.username} — ${m.role}${m.is_primary ? " (primary)" : ""}`)
              .join("\n");
            const invites = res.pending_invites.length
              ? "\nPending invites:\n" +
                res.pending_invites.map((i) => `• ${i.email} — ${i.role}`).join("\n")
              : "";
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Members of @${res.mind_username}:\n${members}${invites}`,
                },
              ],
            };
          }
          case "grant": {
            if (!mind_username || !grantee_username) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "Error: mind_username and grantee_username are required for grant",
                  },
                ],
                isError: true,
              };
            }
            await client.grantMindMember(mind_username, grantee_username, role);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Granted @${grantee_username} ${role} access to @${mind_username}.`,
                },
              ],
            };
          }
          case "invite": {
            if (!mind_username || !email) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "Error: mind_username and email are required for invite",
                  },
                ],
                isError: true,
              };
            }
            const res = await client.createMindInvite(mind_username, email, role);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Invitation sent to ${res.email} (${res.role}) for @${mind_username}.`,
                },
              ],
            };
          }
          case "switch": {
            if (!mind_username) {
              return {
                content: [{ type: "text" as const, text: "Error: mind_username is required for switch" }],
                isError: true,
              };
            }
            const res = await client.switchMind(mind_username);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      switched: true,
                      account: res.account,
                      access_token: res.access_token,
                      token_type: res.token_type,
                      note: "Bearer access_token operates as this MIND for session JWT paths. Hosted API-key MCP remains the key owner unless the host applies the token.",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `mind_accounts error: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_social ────────────────────────────────────────
  // Read-only analytics across YouTube, LinkedIn, X, Twitch + goals progress.

  server.tool(
    "mind_social_analytics",
    "Read social media analytics from MIND's Social Dashboard — YouTube/LinkedIn/X/Twitch channel stats, recent videos with performance, retention curves, traffic sources, comment sentiment, and goal progress. Use this to answer questions like 'how did Tuesday's video do?' or 'am I on pace for 1k subs?'",
    {
      action: z
        .enum([
          "status",
          "summary",
          "yt_channel",
          "yt_videos",
          "yt_video_detail",
          "goals",
        ])
        .describe(
          "Which read to perform: status (per-platform connection state), summary (cross-platform KPIs), yt_channel (channel snapshot + 28-day history), yt_videos (recent videos with perf), yt_video_detail (one video + retention + traffic + sentiment), goals (goal progress)."
        ),
      video_id: z
        .string()
        .optional()
        .describe("Required for yt_video_detail."),
      limit: z
        .number()
        .int()
        .optional()
        .describe("Max items for yt_videos (default 25)."),
    },
    async ({ action, video_id, limit }) => {
      try {
        switch (action) {
          case "status": {
            const r = (await client.socialStatus()) as Record<string, any>;
            const lines = ["**Social Dashboard status**"];
            lines.push(
              `Enabled: ${r.enabled ? "yes" : "no"} (global flag: ${r.globally_enabled ? "on" : "off"})`
            );
            const platforms = r.platforms || {};
            for (const key of ["youtube", "linkedin", "x", "twitch"]) {
              const p = platforms[key] || {};
              lines.push(
                `• ${key}: ${p.connected ? `connected (${p.account_label || "—"})` : p.configured ? "not connected" : "not configured"}`
              );
            }
            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
            };
          }
          case "summary": {
            const r = (await client.socialSummary()) as Record<string, any>;
            const yt = r.youtube || {};
            const lines = [
              "**Cross-platform summary**",
              `YouTube subs: ${yt.subs ?? "—"}${yt.subs_delta_28d_pct != null ? ` (28d Δ ${yt.subs_delta_28d_pct}%)` : ""}`,
              `YouTube views: ${yt.total_views ?? "—"}${yt.views_delta_28d_pct != null ? ` (28d Δ ${yt.views_delta_28d_pct}%)` : ""}`,
              `YouTube watch minutes (28d): ${yt.watch_minutes_28d ?? "—"}`,
              `LinkedIn posts recent: ${(r.linkedin || {}).post_count_recent ?? "—"}`,
              `X tweets recent: ${(r.x || {}).tweet_count_recent ?? "—"}`,
              `Twitch VODs recent: ${(r.twitch || {}).vod_count_recent ?? "—"}`,
            ];
            const goals = (r.goals as any[]) || [];
            if (goals.length) {
              lines.push("\n**Goals**");
              for (const g of goals) {
                lines.push(
                  `• ${g.label || g.metric}: ${g.current ?? 0}/${g.target} (${g.pct ?? 0}%) — ${g.status}`
                );
              }
            }
            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
            };
          }
          case "yt_channel": {
            const r = (await client.socialYouTubeChannel()) as Record<string, any>;
            const latest = r.latest || {};
            const history = (r.history as any[]) || [];
            const lines = [
              "**YouTube channel**",
              `Subs: ${latest.subs ?? "—"}`,
              `Total views: ${latest.total_views ?? "—"}`,
              `Total watch minutes (28d): ${latest.total_watch_time_minutes ?? "—"}`,
              `Videos published: ${latest.video_count ?? "—"}`,
              `History points (last ${history.length} days):`,
              ...history.slice(-7).map(
                (h: any) => `  ${h.date}: ${h.subs} subs, ${h.total_views} views`
              ),
            ];
            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
            };
          }
          case "yt_videos": {
            const r = (await client.socialYouTubeVideos(limit ?? 25)) as Record<string, any>;
            const items = (r.items as any[]) || [];
            if (!items.length) {
              return {
                content: [{ type: "text" as const, text: "No videos in snapshot cache yet." }],
              };
            }
            const lines = [`**Recent videos** (${items.length})`];
            for (const v of items.slice(0, 15)) {
              const l = v.latest || {};
              lines.push(
                `• ${v.title} — ${l.views ?? "—"} views, ${l.ctr_percent != null ? l.ctr_percent.toFixed(1) + "%" : "—"} CTR, ${l.comments ?? "—"} comments [${v.video_id}]`
              );
            }
            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
            };
          }
          case "yt_video_detail": {
            if (!video_id) {
              return {
                content: [
                  { type: "text" as const, text: "Error: video_id is required for yt_video_detail" },
                ],
                isError: true,
              };
            }
            const r = (await client.socialYouTubeVideoDetail(video_id)) as Record<string, any>;
            const meta = r.metadata || {};
            const latest = r.latest || {};
            const traffic = (r.traffic as any[]) || [];
            const sent = (r.comments as any)?.sentiment_summary || {};
            const lines = [
              `**${meta.title}**`,
              `Published: ${meta.published_at} · ${meta.duration_seconds ? Math.round(meta.duration_seconds / 60) + " min" : "—"}`,
              `Views: ${latest.views ?? "—"} · CTR: ${latest.ctr_percent != null ? latest.ctr_percent.toFixed(1) + "%" : "—"} · AVD: ${latest.avd_seconds ? Math.round(latest.avd_seconds) + "s" : "—"}`,
              `Subs Δ: +${latest.subscribers_gained ?? 0} / -${latest.subscribers_lost ?? 0}`,
              "",
              "Traffic sources:",
              ...traffic.slice(0, 5).map((t: any) => `  • ${t.source}: ${t.views}`),
              "",
              `Comments: ${sent.count ?? 0} (${sent.positive ?? 0} pos / ${sent.neutral ?? 0} neu / ${sent.negative ?? 0} neg, avg ${(sent.avg_score ?? 0).toFixed(2)})`,
            ];
            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
            };
          }
          case "goals": {
            const r = (await client.socialGoals()) as Record<string, any>;
            const items = (r.items as any[]) || [];
            if (!items.length) {
              return {
                content: [{ type: "text" as const, text: "No goals set." }],
              };
            }
            const lines = ["**Goals**"];
            for (const g of items) {
              lines.push(
                `• ${g.label || g.metric}: ${g.current ?? 0}/${g.target} (${g.pct ?? 0}%) — due ${g.due_date} — ${g.status}`
              );
            }
            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
            };
          }
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `mind_social error: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_personas ──────────────────────────────────────────
  // Influencer Factory Command Center surface. Admin-only.
  // Whole router is dark unless IF_FEATURE_FLAG_ENABLED=true on the server.
  // Persona == featured_minds row (1:1) — IF fields stored on featured_minds,
  // asset library (face/voice/bios/Blotato) on the persona_assets collection.

  server.tool(
    "mind_personas",
    "Influencer Factory Command Center — synthetic-persona creators that publish across Blotato platforms. Admin-only. Phase 1 surface: persona CRUD (auto-creates a Featured MIND row with IF fields), face anchor (AI-generate via Nano Banana Pro OR user-uploaded with rights affirmation), face variants (image-to-image via n8n + Fal.ai, always pinned to anchor — never chained), voice (ElevenLabs library search + clone + sample), per-platform bios (with optional LLM draft), Blotato account registration (YouTube/IG/LinkedIn/X/Threads/Pinterest; TikTok marked manual_upload). Each persona is publicly chattable at /m/{username} via its linked Featured MIND.",
    {
      action: z
        .enum([
          "health",
          "list_personas",
          "get_persona",
          "create_persona",
          "update_persona",
          "delete_persona",
          "anchor_face_ai_generate",
          "request_face_variants",
          "list_face_variants",
          "search_voice_library",
          "set_voice_library",
          "generate_voice_sample",
          "update_bios",
          "blotato_whoami",
          "blotato_accounts",
          "register_blotato_account",
          "unregister_blotato_account",
        ])
        .describe(
          "What to do. Start with 'health' to confirm Fal/ElevenLabs/Blotato/S3/n8n are configured. Most write actions require persona_mind_id."
        ),
      persona_mind_id: z
        .string()
        .optional()
        .describe(
          "Persona id (== featured_minds.mind_id). Required for every per-persona action."
        ),

      // create_persona
      username: z
        .string()
        .optional()
        .describe(
          "Lowercase username (3–32 chars, [a-z0-9_-]). Used for /m/{username} public landing AND the featured_minds row. Required for create_persona."
        ),
      display_name: z.string().optional().describe("Display name. Required for create_persona."),
      niche: z.string().optional().describe("Niche label, e.g. 'fitness', 'wealth'."),
      pillars: z
        .array(z.string())
        .optional()
        .describe("3–5 content pillars the persona writes about."),
      tone: z
        .string()
        .optional()
        .describe("Tone descriptor, e.g. 'warm-direct', 'contrarian-analytical'."),
      archetype_id: z
        .string()
        .optional()
        .describe("Persona archetype template id (looked up in persona_archetypes catalog)."),
      kg_scope_template_id: z
        .string()
        .optional()
        .describe("Knowledge-graph scope template id (bounds what this persona 'knows about')."),
      niche_tags: z
        .array(z.string())
        .optional()
        .describe(
          "Topic niche tags used by retrieval (separate from Featured MIND catalog tags)."
        ),
      daily_credit_ceiling_usd: z
        .number()
        .optional()
        .describe(
          "Hard ceiling on daily Fal.ai/ElevenLabs/Veo/Suno spend for this persona. Default 5."
        ),

      // update_persona — partial
      status: z
        .enum(["draft", "active", "paused"])
        .optional()
        .describe("Persona runtime status."),
      agent_posting_enabled: z
        .boolean()
        .optional()
        .describe(
          "Master kill-switch on the linked Featured MIND row. Off = autonomous posters skip this persona."
        ),

      // anchor_face_ai_generate
      prompt: z
        .string()
        .optional()
        .describe(
          "Anchor-face generation prompt OR voice sample text (anchor_face_ai_generate, generate_voice_sample)."
        ),
      model: z
        .enum(["nano_banana_pro", "flux"])
        .optional()
        .describe("Anchor-face generator model. Default nano_banana_pro."),

      // request_face_variants
      count: z
        .number()
        .optional()
        .describe("Variant count (1–20). Default 5."),
      prompt_modifier: z
        .string()
        .optional()
        .describe("Optional modifier appended to the base variant prompt (e.g. 'outdoor golden hour')."),

      // voice
      voice_query: z
        .string()
        .optional()
        .describe("ElevenLabs library search query (search_voice_library)."),
      voice_id: z
        .string()
        .optional()
        .describe("ElevenLabs voice id (set_voice_library)."),
      voice_name: z
        .string()
        .optional()
        .describe("Display name to store for the voice (set_voice_library)."),
      voice_text: z
        .string()
        .optional()
        .describe("Text to render as a sample MP3 (generate_voice_sample)."),

      // bios
      bios: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Map of platform → bio text (twitter|instagram|tiktok|linkedin|youtube|threads|pinterest). Length-capped server-side."
        ),
      generate_with_llm: z
        .boolean()
        .optional()
        .describe("If true, LLM drafts missing platform bios. Existing bios stay."),

      // blotato
      platform: z
        .enum([
          "twitter",
          "instagram",
          "tiktok",
          "linkedin",
          "youtube",
          "threads",
          "pinterest",
        ])
        .optional()
        .describe("Target platform for Blotato register/unregister."),
      account_id: z
        .string()
        .optional()
        .describe("Blotato account id (from blotato_accounts list)."),
      page_id: z
        .string()
        .optional()
        .describe("LinkedIn / IG / YouTube page id (optional, platform-specific)."),
      board_id: z
        .string()
        .optional()
        .describe("Pinterest board id (REQUIRED for Pinterest)."),
      handle: z.string().optional().describe("Display handle (optional)."),
      media_type: z
        .enum(["story", "reel"])
        .optional()
        .describe("Instagram media type (story or reel)."),

      // list filters
      search: z.string().optional().describe("Search filter for list_personas."),
    },
    async (args: any) => {
      try {
        const {
          action,
          persona_mind_id: pid,
          username,
          display_name,
          niche,
          pillars,
          tone,
          archetype_id,
          kg_scope_template_id,
          niche_tags,
          daily_credit_ceiling_usd,
          status,
          agent_posting_enabled,
          prompt,
          model,
          count,
          prompt_modifier,
          voice_query,
          voice_id,
          voice_name,
          voice_text,
          bios,
          generate_with_llm,
          platform,
          account_id,
          page_id,
          board_id,
          handle,
          media_type,
          search,
        } = args;

        const needPid = () => {
          if (!pid) throw new Error(`${action} requires persona_mind_id`);
        };

        switch (action) {
          case "health": {
            const r = await client.ifHealth();
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "list_personas": {
            const r = await client.ifListPersonas({ status, search });
            if (!r.length) {
              return { content: [{ type: "text" as const, text: "No personas." }] };
            }
            const lines = r.map(
              (p: any) =>
                `• @${p.username} — ${p.display_name} [${p.status}] (${p.persona_mind_id})`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
          case "get_persona": {
            needPid();
            const r = await client.ifGetPersonaFull(pid);
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "create_persona": {
            if (!username || !display_name)
              throw new Error("username and display_name are required");
            const r = await client.ifCreatePersona({
              username,
              display_name,
              niche,
              pillars,
              tone,
              archetype_id,
              kg_scope_template_id,
              niche_tags,
              daily_credit_ceiling_usd,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Created persona @${(r as any).username} (mind_id=${(r as any).persona_mind_id})`,
                },
              ],
            };
          }
          case "update_persona": {
            needPid();
            const patch: Record<string, unknown> = {};
            if (display_name !== undefined) patch.display_name = display_name;
            if (niche !== undefined) patch.niche = niche;
            if (pillars !== undefined) patch.pillars = pillars;
            if (tone !== undefined) patch.tone = tone;
            if (daily_credit_ceiling_usd !== undefined)
              patch.daily_credit_ceiling_usd = daily_credit_ceiling_usd;
            if (status !== undefined) patch.status = status;
            if (archetype_id !== undefined) patch.archetype_id = archetype_id;
            if (kg_scope_template_id !== undefined)
              patch.kg_scope_template_id = kg_scope_template_id;
            if (niche_tags !== undefined) patch.niche_tags = niche_tags;
            if (agent_posting_enabled !== undefined)
              patch.agent_posting_enabled = agent_posting_enabled;
            const r = await client.ifUpdatePersona(pid, patch);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }],
            };
          }
          case "delete_persona": {
            needPid();
            const r = await client.ifDeletePersona(pid);
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "anchor_face_ai_generate": {
            needPid();
            if (!prompt) throw new Error("prompt is required");
            const r = await client.ifAnchorAIGenerate(pid, { prompt, model });
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "request_face_variants": {
            needPid();
            const r = await client.ifRequestVariants(pid, {
              count: count ?? 5,
              prompt_modifier,
            });
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "list_face_variants": {
            needPid();
            const r = await client.ifListVariants(pid);
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "search_voice_library": {
            const r = await client.ifSearchVoiceLibrary({ q: voice_query });
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "set_voice_library": {
            needPid();
            if (!voice_id) throw new Error("voice_id is required");
            const r = await client.ifSetVoiceLibrary(pid, {
              voice_id,
              name: voice_name,
            });
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "generate_voice_sample": {
            needPid();
            if (!voice_text) throw new Error("voice_text is required");
            const r = await client.ifVoiceSample(pid, voice_text);
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "update_bios": {
            needPid();
            const r = await client.ifUpdateBios(pid, {
              bios: bios ?? {},
              generate_with_llm,
            });
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "blotato_whoami": {
            const r = await client.ifBlotatoWhoami();
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "blotato_accounts": {
            const r = await client.ifBlotatoAccounts();
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "register_blotato_account": {
            needPid();
            if (!platform || !account_id)
              throw new Error("platform and account_id are required");
            const r = await client.ifRegisterBlotato(pid, platform, {
              account_id,
              page_id,
              board_id,
              handle,
              media_type,
            });
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          case "unregister_blotato_account": {
            needPid();
            if (!platform) throw new Error("platform is required");
            const r = await client.ifUnregisterBlotato(pid, platform);
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(r, null, 2) },
              ],
            };
          }
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `mind_personas error: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ─── mind_trader ────────────────────────────────────────
  // TraderMIND: any agent can run the trader for you. Read the engine
  // (live feed, MIND Vision forecasts — latest cone + resolved history +
  // per-bar scores, candles, cycle summaries, calibration honesty curve,
  // engine health, the trader's own narrated journal) and act on it as YOU —
  // save/star/like objects (and undo), leave notes and structured feedback
  // the engine learns from, read back your notes/interactions/public counts,
  // keep a full-CRUD trading journal, and pull personalized insights.
  // 1:1 endpoint map (same MIND base URL, MIND API key auth):
  //   feed → GET /api/mindtrades/feed · forecast_latest → GET /api/trader/forecasts/latest
  //   forecasts → GET /api/trader/forecasts · bar_scores → GET /api/trader/forecasts/{id}/bar-scores
  //   candles → GET /api/trader/candles · cycles → GET /api/trader/cycles
  //   health → GET /api/trader/health · calibration → GET /api/trader/calibration
  //   ai_journal → GET /api/trader/ai-journal · save/star/like → POST /api/trader/interact
  //   unsave → DELETE /api/trader/interact · interactions → GET /api/trader/interactions
  //   counts → GET /api/trader/counts · note/feedback → POST /api/trader/note
  //   notes → GET /api/trader/notes · journal_* → GET/POST/PUT/DELETE /api/trader/journal[/{id}]
  //   saved → GET /api/trader/saved · insights → GET /api/trader/insights

  server.tool(
    "mind_trader",
    "Operate TraderMIND — the agentic trading engine. Use whenever the user asks about markets, the trader, a MIND Vision forecast, their trading journal, or wants to react to a trade idea. " +
      "Read the engine: feed (live trade-idea feed) · forecast_latest (latest MIND Vision cone for a symbol) · forecasts (recent forecast history incl. resolution — every hit and miss) · bar_scores (per-candle predicted-vs-actual for one resolved forecast_id) · candles (OHLCV) · cycles (engine cycle summaries: regime, ideas, lessons) · health (is the engine up) · calibration (published honesty curve) · ai_journal (the trader's own narrated 'what I saw / did / why'). " +
      "Act as the user: save | star | like an object (object_type forecast|idea|journal_ai + object_id) · unsave (undo one of those — pass undo_action) · note (attach a note) · feedback (agree/disagree/context — reaches the engine's brain and shapes future hypotheses) · interactions (what you already saved/starred on a batch of object_ids — check before writing) · notes (read back your notes) · saved (your saved/starred items, filterable via filter_action). Writes are rate-limited (300 save/star/like per hour, 60 notes/feedback per hour) — batch-check with action=interactions before writing. " +
      "Your journal: journal_list · journal_create · journal_get · journal_update · journal_delete (entry_id). insights = personalized insights from your activity + the trader brain (cached 15 min). " +
      "Auth: all engine reads (feed, forecast_latest, forecasts, bar_scores, candles, cycles, health, calibration, ai_journal) plus counts are public — they work even with a missing or invalid key. Only the act-as-you actions (save/star/like/unsave, note/feedback, notes, interactions, saved, journal_*, insights) authenticate as the key's owner. Saves, notes, feedback, and journal entries also land in the owner's MIND knowledge graph.",
    {
      action: z
        .enum([
          "feed",
          "forecast_latest",
          "forecasts",
          "bar_scores",
          "candles",
          "cycles",
          "health",
          "calibration",
          "ai_journal",
          "save",
          "star",
          "like",
          "unsave",
          "note",
          "feedback",
          "notes",
          "interactions",
          "counts",
          "journal_list",
          "journal_create",
          "journal_get",
          "journal_update",
          "journal_delete",
          "saved",
          "insights",
        ])
        .describe(
          "The operation to run — see the tool description for the grouped taxonomy and per-action requirements."
        ),
      symbol: z
        .string()
        .regex(/^[A-Za-z0-9.\-]{1,12}$/, "symbol must be 1-12 chars of A-Z, 0-9, '.' or '-'")
        .optional()
        .describe("Instrument symbol, 1–12 chars of A-Z, 0-9, '.' or '-' (e.g. ES, NQ, SPY, BTC-USD; case-insensitive — normalized to uppercase). Required for forecast_latest and candles; optional filter on forecasts/ai_journal/saved; recommended on save/star/like/note/feedback."),
      object_type: z
        .enum(["forecast", "idea", "journal_ai"])
        .optional()
        .describe("Type of the actable object — required for save/star/like/unsave/note/feedback."),
      object_id: z
        .string()
        .max(200)
        .optional()
        .describe("Id of the actable object (≤200 chars) — required for save/star/like/unsave/note/feedback; optional filter for notes."),
      object_ids: z
        .array(z.string().max(200))
        .min(1)
        .max(200)
        .optional()
        .describe("Batch of object ids (1–200, each ≤200 chars) — required for interactions and counts."),
      undo_action: z
        .enum(["save", "star", "like"])
        .optional()
        .describe("Which interaction to undo — required for unsave."),
      forecast_id: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Numeric forecast id — required for bar_scores. Get ids from action=forecasts."),
      text: z
        .string()
        .max(8000)
        .optional()
        .describe("Note or feedback text (≤8000 chars) — required for note/feedback."),
      tag: z
        .enum(["agree", "disagree", "context"])
        .optional()
        .describe("Structured tag stored with the note/feedback (agree | disagree | context). On feedback it reaches the engine's Hypothesizer and shapes future forecasts."),
      note_kind: z
        .enum(["note", "feedback"])
        .optional()
        .describe("action=notes: filter your notes by kind."),
      filter_action: z
        .enum(["save", "star", "like"])
        .optional()
        .describe("action=saved: return only items with this interaction (e.g. only what you starred). Default: saves + stars."),
      title: z
        .string()
        .max(300)
        .optional()
        .describe("Journal entry title (≤300 chars) — required for journal_create; optional on journal_update."),
      body: z
        .string()
        .max(50000)
        .optional()
        .describe("Journal entry body (≤50000 chars) — journal_create/journal_update."),
      symbols: z
        .array(
          z
            .string()
            .regex(/^[A-Za-z0-9.\-]{1,12}$/, "each symbol must be 1-12 chars of A-Z, 0-9, '.' or '-'")
        )
        .max(20)
        .optional()
        .describe("Symbols linked to a journal entry, ≤20 of ≤12 chars each (journal_create/journal_update — update REPLACES the list)."),
      linked_ids: z
        .array(z.string().max(200))
        .max(50)
        .optional()
        .describe("Forecast/idea ids linked to a journal entry, ≤50 (journal_create/journal_update — update REPLACES the list)."),
      tags: z
        .array(z.string().max(50))
        .max(20)
        .optional()
        .describe("Tags for a journal entry, ≤20 (journal_create/journal_update — update REPLACES the list)."),
      entry_id: z
        .string()
        .max(200)
        .optional()
        .describe("Journal entry id (≤200 chars) — required for journal_get/journal_update/journal_delete."),
      tf: z
        .enum(["1m", "5m", "15m", "1h", "4h", "1d"])
        .optional()
        .describe("Candle timeframe for candles (default 5m)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe("Max items. Per-action bounds/defaults: candles 1–2000 default 300 · forecasts ≤500 default 50 · feed/ai_journal/journal_list ≤200 default 50 · cycles ≤200 default 20 · saved/notes ≤500 default 100. Values above an action's cap are clamped to the cap. Use 'page' to continue past 'limit' on notes/saved/journal_list."),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("notes / saved / journal_list: page number (default 1); responses include 'total' and 'page' so you can walk pages."),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe("History window in days for calibration (1–365, default 90)."),
      kind: z
        .enum(["execute", "no_trade", "error", "all"])
        .optional()
        .describe("Feed filter for action=feed."),
      refresh: z
        .boolean()
        .optional()
        .describe("action=insights: bypass the 15-minute cache and recompose. A 60-second floor still applies — refresh=true within 60s of the last compose returns the cached result."),
    },
    async ({
      action,
      symbol,
      object_type,
      object_id,
      object_ids,
      undo_action,
      forecast_id,
      text,
      tag,
      note_kind,
      filter_action,
      title,
      body,
      symbols,
      linked_ids,
      tags,
      entry_id,
      tf,
      limit,
      page,
      days,
      kind,
      refresh,
    }) => {
      // ok / err / apiDetail are the module-scope shared MCP result helpers.
      // Clamp limit to each action's backend cap instead of letting the API
      // 422 — the describe documents these bounds; the clamp enforces them.
      const LIMIT_CAPS: Record<string, number> = {
        feed: 200,
        forecasts: 500,
        candles: 2000,
        cycles: 200,
        ai_journal: 200,
        notes: 500,
        journal_list: 200,
        saved: 500,
      };
      const lim =
        limit !== undefined ? Math.min(limit, LIMIT_CAPS[action] ?? limit) : undefined;

      try {
        switch (action) {
          case "feed":
            return ok(await client.traderFeed({ limit: lim, kind }));

          case "forecast_latest":
            if (!symbol) return err("Error: 'symbol' is required for forecast_latest.");
            return ok(await client.traderForecastLatest(symbol));

          case "forecasts":
            return ok(await client.traderForecasts(symbol, lim));

          case "bar_scores":
            if (forecast_id === undefined)
              return err("Error: 'forecast_id' is required for bar_scores. Get ids from action=forecasts.");
            return ok(await client.traderBarScores(forecast_id));

          case "candles":
            if (!symbol) return err("Error: 'symbol' is required for candles.");
            return ok(await client.traderCandles(symbol, tf, lim));

          case "cycles":
            return ok(await client.traderCycles(lim));

          case "health":
            return ok(await client.traderHealth());

          case "calibration":
            return ok(await client.traderCalibration(days));

          case "ai_journal":
            return ok(await client.traderAiJournal(symbol, lim));

          case "save":
          case "star":
          case "like": {
            if (!object_type || !object_id)
              return err(`Error: 'object_type' and 'object_id' are required for ${action}.`);
            const r = await client.traderInteract({
              object_type,
              object_id,
              action,
              symbol,
            });
            return ok(r);
          }

          case "unsave": {
            if (!object_type || !object_id)
              return err("Error: 'object_type' and 'object_id' are required for unsave.");
            if (!undo_action)
              return err("Error: 'undo_action' (save | star | like) is required for unsave.");
            const r = (await client.traderUninteract({
              object_type,
              object_id,
              action: undo_action,
            })) as Record<string, unknown> | null;
            if (r && typeof r === "object" && r.deleted === false)
              return ok({
                ...r,
                hint: `Nothing was deleted — you have no existing ${undo_action} on that object. Call action=interactions with its object_id to see what you actually have.`,
              });
            return ok(r);
          }

          case "note":
          case "feedback": {
            if (!object_type || !object_id)
              return err(`Error: 'object_type' and 'object_id' are required for ${action}.`);
            if (!text) return err(`Error: 'text' is required for ${action}.`);
            const r = await client.traderNote({
              object_type,
              object_id,
              kind: action,
              text,
              tag,
              symbol,
            });
            return ok(r);
          }

          case "notes":
            return ok(await client.traderNotes({ object_id, kind: note_kind, limit: lim, page }));

          case "interactions":
            if (!object_ids?.length)
              return err("Error: 'object_ids' (1–200 ids) is required for interactions.");
            return ok(await client.traderInteractions(object_ids));

          case "counts":
            if (!object_ids?.length)
              return err("Error: 'object_ids' (1–200 ids) is required for counts.");
            return ok(await client.traderCounts(object_ids));

          case "journal_list":
            return ok(await client.traderJournalList(lim, page));

          case "journal_create":
            if (!title) return err("Error: 'title' is required for journal_create.");
            return ok(
              await client.traderJournalCreate({ title, body, symbols, linked_ids, tags })
            );

          case "journal_get":
            if (!entry_id) return err("Error: 'entry_id' is required for journal_get.");
            return ok(await client.traderJournalGet(entry_id));

          case "journal_update": {
            if (!entry_id) return err("Error: 'entry_id' is required for journal_update.");
            if (
              title === undefined &&
              body === undefined &&
              symbols === undefined &&
              linked_ids === undefined &&
              tags === undefined
            )
              return err(
                "Error: journal_update needs at least one of 'title', 'body', 'symbols', 'linked_ids', 'tags'."
              );
            return ok(
              await client.traderJournalUpdate(entry_id, { title, body, symbols, linked_ids, tags })
            );
          }

          case "journal_delete":
            if (!entry_id) return err("Error: 'entry_id' is required for journal_delete.");
            return ok(await client.traderJournalDelete(entry_id));

          case "saved":
            return ok(
              await client.traderSaved({ action: filter_action, symbol, object_type, limit: lim, page })
            );

          case "insights":
            return ok(await client.traderInsights(refresh));

          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) {
          if (e.status === 404 && action === "forecast_latest")
            return err(
              `No forecast yet for ${symbol?.trim().toUpperCase() || "that symbol"} — the engine may not cover it. Call action=feed or action=cycles to see the live universe of symbols.`
            );
          if (
            e.status === 404 &&
            (action === "journal_get" || action === "journal_update" || action === "journal_delete")
          )
            return err(
              `No journal entry with entry_id '${entry_id ?? ""}' — it may have been deleted. Call action=journal_list to get valid entry ids.`
            );
          if (e.status === 404 && action === "bar_scores")
            return err(
              `No bar scores for forecast_id ${forecast_id ?? ""} — the id is wrong or the forecast hasn't resolved yet. Call action=forecasts (resolution status included) to find resolved ids.`
            );
          if (e.status === 401 || e.status === 403)
            return err(
              "mind_trader auth error: the MIND API key was rejected (missing/expired or lacks trader access). Re-run setup with a fresh key from m-i-n-d.ai → Settings → Developer → API Keys."
            );
          if (e.status === 429)
            return err(
              `mind_trader rate limit (HTTP 429): ${apiDetail(e)} Write ceilings: 300 save/star/like per hour, 60 notes/feedback per hour. counts is IP-rate-limited per minute (default 60/min); other reads are unlimited. Stop writing and retry after the window resets.`
            );
          if (e.status === 502 || e.status === 503)
            return err(
              "mind_trader: the trading engine is unreachable or not configured right now. Call action=health to check engine status, and retry shortly."
            );
          return err(`mind_trader ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        }
        return err(`mind_trader error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // FULL-COVERAGE APP TOOLS (v0.25.0) — mind_mindmap, mind_moneymind,
  // mind_budget, mind_sheets, mind_email, mind_checklists, mind_sign,
  // mind_invoices, mind_books, mind_timer, mind_forms, mind_library
  // ═══════════════════════════════════════════════════════════════════

  // ─── mind_mindmap ───────────────────────────────────────
  server.tool(
    "mind_mindmap",
    "MIND Mind Map — visual mind-mapping canvases at m-i-n-d.ai/#/mind-map. Actions: list, get, create, update, delete, get_shared (read a publicly shared map, no auth needed). Sharing, collaborators and AI generation from a prompt or project stay in the web app at m-i-n-d.ai/#/mind-map.",
    {
      action: z
        .enum(["list", "get", "create", "update", "delete", "get_shared"])
        .describe("Which mind-map operation to perform."),
      map_id: z.string().optional().describe("Mind map id — required for get/update/delete."),
      name: z.string().optional().describe("Map name/title — create/update (defaults to 'Untitled map' on create)."),
      data: z.record(z.string(), z.any()).optional().describe("Map contents: {nodes, edges, camera, defaults, nextId, notes} — create/update."),
      thumbnail: z.string().optional().describe("Base64/data-url thumbnail image — create/update."),
      share_id: z.string().optional().describe("Public share id — required for get_shared."),
    },
    async (args) => {
      const { action } = args;
      try {
        switch (action) {
          case "list":
            return ok(await client.call("GET", "/mindmaps", args));
          case "get": {
            const m = need(args, ["map_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", "/mindmaps/{map_id}", args, ["map_id"]));
          }
          case "create":
            return ok(await client.call("POST", "/mindmaps", args, [], [], ["name", "data", "thumbnail"]));
          case "update": {
            const m = need(args, ["map_id"]);
            if (m) return err(m);
            return ok(await client.call("PUT", "/mindmaps/{map_id}", args, ["map_id"], [], ["name", "data", "thumbnail"]));
          }
          case "delete": {
            const m = need(args, ["map_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", "/mindmaps/{map_id}", args, ["map_id"]));
          }
          case "get_shared": {
            const m = need(args, ["share_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", "/mindmaps/shared/{share_id}", args, ["share_id"]));
          }
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_mindmap ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_mindmap error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_moneymind ─────────────────────────────────────
  server.tool(
    "mind_moneymind",
    "MoneyMIND — personal finance at m-i-n-d.ai/#/moneyMIND: accounts, transactions, categories, budgets, recurring bills, net worth, goals, credit, alerts, bill negotiation, bank statements. Actions: overview, accounts_list, account_create, account_update, account_delete, transactions_list, transaction_create, transaction_update, transaction_split, spending_summary, categories_list, category_create, rules_list, rule_create, rule_delete, budgets_list, budget_set, budget_delete, recurring_list, recurring_update, recurring_cancel, networth, networth_manual, networth_snapshot, goals_list, goal_create, goal_update, goal_delete, credit, alerts_config, alerts_config_set, alerts_feed, negotiate_list, negotiate_create, statements_list, statement_get, statement_delete. Note: rule_create's REST body field 'action' is exposed here as `rule_action` (an 'action' field would collide with this tool's own dispatch key).",
    {
      action: z
        .enum([
          "overview", "accounts_list", "account_create", "account_update", "account_delete",
          "transactions_list", "transaction_create", "transaction_update", "transaction_split",
          "spending_summary", "categories_list", "category_create", "rules_list", "rule_create", "rule_delete",
          "budgets_list", "budget_set", "budget_delete", "recurring_list", "recurring_update", "recurring_cancel",
          "networth", "networth_manual", "networth_snapshot", "goals_list", "goal_create", "goal_update", "goal_delete",
          "credit", "alerts_config", "alerts_config_set", "alerts_feed", "negotiate_list", "negotiate_create",
          "statements_list", "statement_get", "statement_delete",
        ])
        .describe("Which MoneyMIND operation to perform."),
      account_id: z.string().optional().describe("Account id — account_update/account_delete; also filters transactions_list."),
      name: z.string().optional().describe("Display name — account_create/category_create/goal_create/goal_update/networth_manual."),
      type: z.enum(["checking", "savings", "credit", "loan", "investment", "manual"]).optional().describe("Account type — account_create (default 'manual')."),
      balance_cents: z.number().int().optional().describe("Balance in cents — account_create/account_update."),
      institution: z.string().optional().describe("Bank/institution name — account_create/account_update."),
      mask: z.string().optional().describe("Last-4 account mask — account_create."),
      currency: z.string().optional().describe("ISO currency code — account_create (default 'USD')."),
      hidden: z.boolean().optional().describe("Hide from overview — account_update/recurring_update."),
      txn_id: z.string().optional().describe("Transaction id — transaction_update/transaction_split."),
      from: z.string().optional().describe("Start date (YYYY-MM-DD) — transactions_list filter."),
      to: z.string().optional().describe("End date (YYYY-MM-DD) — transactions_list filter."),
      category: z.string().optional().describe("Category name — transactions_list filter / transaction_create / transaction_update; also the path segment for budget_set/budget_delete."),
      search: z.string().optional().describe("Free-text search — transactions_list filter."),
      limit: z.number().int().optional().describe("Max results — transactions_list."),
      cursor: z.string().optional().describe("Pagination cursor — transactions_list."),
      recurring: z.boolean().optional().describe("Filter to recurring transactions — transactions_list."),
      excluded: z.boolean().optional().describe("Filter by excluded flag — transactions_list filter; also set on transaction_update."),
      date: z.string().optional().describe("Transaction date (YYYY-MM-DD) — required for transaction_create."),
      amount_cents: z.number().int().optional().describe("Amount in cents — required for transaction_create."),
      merchant: z.string().optional().describe("Merchant name — transaction_create (required)/transaction_update."),
      notes: z.string().optional().describe("Free-text notes — transaction_update/negotiate context fields elsewhere."),
      splits: z.array(z.record(z.string(), z.any())).optional().describe("[{category, amount_cents}] — transaction_split (required) / transaction_update."),
      period: z.string().optional().describe("Summary period, e.g. 'month' — spending_summary (default 'month')."),
      anchor: z.string().optional().describe("Anchor date (YYYY-MM-DD) for spending_summary."),
      group: z.string().optional().describe("Category group — category_create (default 'Other')."),
      icon: z.string().optional().describe("Icon name — category_create."),
      color: z.string().optional().describe("Color hex/token — category_create."),
      match: z.record(z.string(), z.any()).optional().describe("{field: 'merchant'|'raw_name'|'amount_cents', op: 'contains'|'equals'|'starts_with'|'gt'|'lt', value} — required for rule_create."),
      rule_action: z.record(z.string(), z.any()).optional().describe("{set_category?, exclude?, assign_bill?} — required for rule_create. Maps to the REST body field named 'action'."),
      rule_id: z.string().optional().describe("Rule id — required for rule_delete."),
      limit_cents: z.number().int().optional().describe("Monthly limit in cents — required for budget_set."),
      rollover: z.boolean().optional().describe("Roll unused budget forward — budget_set."),
      recurring_id: z.string().optional().describe("Recurring bill id — recurring_update/recurring_cancel."),
      status: z.string().optional().describe("New status ('active'|'inactive'|'cancel_requested'|'cancelled') — recurring_update."),
      reason: z.string().optional().describe("Cancellation reason — recurring_cancel."),
      kind: z.enum(["asset", "liability"]).optional().describe("Manual net-worth item kind — networth_manual (default 'asset')."),
      value_cents: z.number().int().optional().describe("Value in cents — required for networth_manual."),
      goal_id: z.string().optional().describe("Savings goal id — goal_update/goal_delete."),
      target_cents: z.number().int().optional().describe("Goal target in cents — required for goal_create; goal_update."),
      mode: z.enum(["autopilot", "custom"]).optional().describe("Goal funding mode — goal_create (default 'custom')/goal_update."),
      ambition: z.string().optional().describe("Free-text ambition note — goal_create/goal_update."),
      monthly_cents: z.number().int().optional().describe("Monthly contribution in cents — goal_create/goal_update."),
      saved_cents: z.number().int().optional().describe("Amount saved so far in cents — goal_update."),
      alert_type: z.string().optional().describe("Alert type key — required for alerts_config_set. Maps to the REST body field 'type'."),
      enabled: z.boolean().optional().describe("Enable/disable the alert — alerts_config_set (default true)."),
      threshold_cents: z.number().int().optional().describe("Alert threshold in cents — alerts_config_set."),
      channels: z.array(z.string()).optional().describe("Notification channels — alerts_config_set."),
      bill_id: z.string().optional().describe("Bill id to negotiate — negotiate_create."),
      provider: z.string().optional().describe("Provider/company name — required for negotiate_create."),
      statement_doc_id: z.string().optional().describe("Linked statement document id — negotiate_create."),
      statement_id: z.string().optional().describe("Bank statement id — required for statement_get/statement_delete."),
    },
    async (args) => {
      const { action } = args;
      const base = "/developer/v1/moneymind";
      try {
        switch (action) {
          case "overview":
            return ok(await client.call("GET", `${base}/overview`, args));
          case "accounts_list":
            return ok(await client.call("GET", `${base}/accounts`, args));
          case "account_create":
            return ok(await client.call("POST", `${base}/accounts`, args, [], [], ["name", "type", "balance_cents", "institution", "mask", "currency"]));
          case "account_update": {
            const m = need(args, ["account_id"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/accounts/{account_id}`, args, ["account_id"], [], ["name", "balance_cents", "hidden", "institution"]));
          }
          case "account_delete": {
            const m = need(args, ["account_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/accounts/{account_id}`, args, ["account_id"]));
          }
          case "transactions_list":
            return ok(
              await client.call("GET", `${base}/transactions`, args, [], [
                "from", "to", "account_id", "category", "search", "limit", "cursor", "recurring", "excluded",
              ])
            );
          case "transaction_create": {
            const m = need(args, ["date", "amount_cents", "merchant", "account_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/transactions`, args, [], [], ["date", "amount_cents", "merchant", "category", "account_id", "notes"]));
          }
          case "transaction_update": {
            const m = need(args, ["txn_id"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/transactions/{txn_id}`, args, ["txn_id"], [], ["category", "notes", "excluded", "splits", "merchant"]));
          }
          case "transaction_split": {
            const m = need(args, ["txn_id", "splits"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/transactions/{txn_id}/split`, args, ["txn_id"], [], ["splits"]));
          }
          case "spending_summary":
            return ok(await client.call("GET", `${base}/spending/summary`, args, [], ["period", "anchor"]));
          case "categories_list":
            return ok(await client.call("GET", `${base}/categories`, args));
          case "category_create": {
            const m = need(args, ["name"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/categories`, args, [], [], ["name", "group", "icon", "color"]));
          }
          case "rules_list":
            return ok(await client.call("GET", `${base}/rules`, args));
          case "rule_create": {
            const m = need(args, ["match", "rule_action"]);
            if (m) return err(m);
            const body = { ...args, action: args.rule_action };
            return ok(await client.call("POST", `${base}/rules`, body, [], [], ["match", "action"]));
          }
          case "rule_delete": {
            const m = need(args, ["rule_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/rules/{rule_id}`, args, ["rule_id"]));
          }
          case "budgets_list":
            return ok(await client.call("GET", `${base}/budgets`, args));
          case "budget_set": {
            const m = need(args, ["category", "limit_cents"]);
            if (m) return err(m);
            return ok(await client.call("PUT", `${base}/budgets/{category}`, args, ["category"], [], ["limit_cents", "rollover"]));
          }
          case "budget_delete": {
            const m = need(args, ["category"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/budgets/{category}`, args, ["category"]));
          }
          case "recurring_list":
            return ok(await client.call("GET", `${base}/recurring`, args));
          case "recurring_update": {
            const m = need(args, ["recurring_id"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/recurring/{recurring_id}`, args, ["recurring_id"], [], ["status", "category", "hidden"]));
          }
          case "recurring_cancel": {
            const m = need(args, ["recurring_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/recurring/{recurring_id}/cancel`, args, ["recurring_id"], [], ["reason"]));
          }
          case "networth":
            return ok(await client.call("GET", `${base}/networth`, args));
          case "networth_manual": {
            const m = need(args, ["name", "value_cents"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/networth/manual`, args, [], [], ["name", "kind", "value_cents"]));
          }
          case "networth_snapshot":
            return ok(await client.call("POST", `${base}/networth/snapshot`, args));
          case "goals_list":
            return ok(await client.call("GET", `${base}/goals`, args));
          case "goal_create": {
            const m = need(args, ["name", "target_cents"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/goals`, args, [], [], ["name", "target_cents", "mode", "ambition", "monthly_cents"]));
          }
          case "goal_update": {
            const m = need(args, ["goal_id"]);
            if (m) return err(m);
            return ok(
              await client.call("PATCH", `${base}/goals/{goal_id}`, args, ["goal_id"], [], [
                "name", "target_cents", "saved_cents", "monthly_cents", "ambition", "mode",
              ])
            );
          }
          case "goal_delete": {
            const m = need(args, ["goal_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/goals/{goal_id}`, args, ["goal_id"]));
          }
          case "credit":
            return ok(await client.call("GET", `${base}/credit`, args));
          case "alerts_config":
            return ok(await client.call("GET", `${base}/alerts/config`, args));
          case "alerts_config_set": {
            const m = need(args, ["alert_type"]);
            if (m) return err(m);
            const body = { ...args, type: args.alert_type };
            return ok(await client.call("PUT", `${base}/alerts/config`, body, [], [], ["type", "enabled", "threshold_cents", "channels"]));
          }
          case "alerts_feed":
            return ok(await client.call("GET", `${base}/alerts/feed`, args));
          case "negotiate_list":
            return ok(await client.call("GET", `${base}/negotiate`, args));
          case "negotiate_create": {
            const m = need(args, ["provider"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/negotiate`, args, [], [], ["bill_id", "recurring_id", "provider", "statement_doc_id"]));
          }
          case "statements_list":
            return ok(await client.call("GET", `${base}/statements`, args));
          case "statement_get": {
            const m = need(args, ["statement_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/statements/{statement_id}`, args, ["statement_id"]));
          }
          case "statement_delete": {
            const m = need(args, ["statement_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/statements/{statement_id}`, args, ["statement_id"]));
          }
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_moneymind ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_moneymind error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_budget ────────────────────────────────────────
  server.tool(
    "mind_budget",
    "MIND Budget — 13-week cash-flow planner at m-i-n-d.ai/#/budget. Actions: overview, set_cells, set_starting, set_rows, row_create, row_update, row_delete, rows_reorder, row_cancel, row_restore, set_goals, set_quarter, variance, roll_forward, autofill_from_statement, autofill_accept, build_from_statements, build_accept, automanage_health.",
    {
      action: z
        .enum([
          "overview", "set_cells", "set_starting", "set_rows", "row_create", "row_update", "row_delete",
          "rows_reorder", "row_cancel", "row_restore", "set_goals", "set_quarter", "variance", "roll_forward",
          "autofill_from_statement", "autofill_accept", "build_from_statements", "build_accept", "automanage_health",
        ])
        .describe("Which 13-week budget operation to perform."),
      cells: z.array(z.record(z.string(), z.any())).optional().describe("[{quarter_id, layer: 'projected'|'actual', row_id, week_index 0-12, amount_cents}] — set_cells."),
      quarter_id: z.string().optional().describe("Quarter id — set_starting (required), variance (required), roll_forward/autofill_*/build_* (required)."),
      layer: z.enum(["projected", "actual"]).optional().describe("Which layer to write — set_starting (required)."),
      starting_cents: z.number().int().optional().describe("Starting cash balance in cents — required for set_starting."),
      rows: z.array(z.record(z.string(), z.any())).optional().describe("[{id?, label, group: 'receipt'|'paidout'|'paidout2', order}] — set_rows (replaces the whole row set)."),
      row_id: z.string().optional().describe("Row id — row_update/row_delete/row_cancel/row_restore."),
      label: z.string().optional().describe("Row label — required for row_create; row_update."),
      group: z.enum(["receipt", "paidout", "paidout2"]).optional().describe("Row group — row_create (default 'paidout')/row_update."),
      order: z.number().int().optional().describe("Sort order — row_create/row_update."),
      category: z.string().optional().describe("Category tag — row_create/row_update."),
      orders: z.array(z.record(z.string(), z.any())).optional().describe("[{id, order}] — rows_reorder."),
      from_week: z.number().int().optional().describe("Week index 0-12 to cancel from — row_cancel (defaults to current week)."),
      note: z.string().optional().describe("Free-text note — row_cancel."),
      goals: z.array(z.string()).optional().describe("Headline goal strings — set_goals."),
      label_text: z.string().optional().describe("Quarter label, e.g. 'Q1 2027' — set_quarter. Maps to the REST body field 'label'."),
      start_date: z.string().optional().describe("Quarter start date (YYYY-MM-DD) — set_quarter."),
      carry_ending: z.boolean().optional().describe("Carry the previous quarter's ending balance forward — set_quarter (default true)."),
      threshold_pct: z.number().optional().describe("Variance alert threshold percent — variance (server default 20)."),
      create_next: z.boolean().optional().describe("Create the next quarter — roll_forward (default true)."),
      as_of: z.string().optional().describe("As-of date (YYYY-MM-DD) — roll_forward."),
      transactions: z.array(z.record(z.string(), z.any())).optional().describe("[{date, amount?, amount_cents?, merchant?, description?, category?, direction?}] — autofill_from_statement/build_from_statements."),
      apply: z.boolean().optional().describe("Apply the autofill immediately — autofill_from_statement (default false)."),
      proposal_ids: z.array(z.string()).optional().describe("Which autofill proposals to accept — autofill_accept (empty = accept all)."),
      replace_rows: z.boolean().optional().describe("Replace existing rows — build_from_statements/build_accept (default true)."),
      align_to_statement: z.boolean().optional().describe("Align cells to statement dates — build_from_statements (default true)."),
      proposal: z.record(z.string(), z.any()).optional().describe("The full BuildProposal object returned by build_from_statements — required for build_accept."),
    },
    async (args) => {
      const { action } = args;
      const base = "/developer/v1/budget";
      try {
        switch (action) {
          case "overview":
            return ok(await client.call("GET", `${base}/overview`, args));
          case "set_cells":
            return ok(await client.call("PUT", `${base}/cells`, args, [], [], ["cells"]));
          case "set_starting": {
            const m = need(args, ["quarter_id", "layer", "starting_cents"]);
            if (m) return err(m);
            return ok(await client.call("PUT", `${base}/starting`, args, [], [], ["quarter_id", "layer", "starting_cents"]));
          }
          case "set_rows":
            return ok(await client.call("PUT", `${base}/rows`, args, [], [], ["rows"]));
          case "row_create": {
            const m = need(args, ["label"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/rows`, args, [], [], ["label", "group", "order", "category"]));
          }
          case "row_update": {
            const m = need(args, ["row_id"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/rows/{row_id}`, args, ["row_id"], [], ["label", "group", "order", "category"]));
          }
          case "row_delete": {
            const m = need(args, ["row_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/rows/{row_id}`, args, ["row_id"]));
          }
          case "rows_reorder":
            return ok(await client.call("POST", `${base}/rows/reorder`, args, [], [], ["orders"]));
          case "row_cancel": {
            const m = need(args, ["row_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/rows/{row_id}/cancel`, args, ["row_id"], [], ["quarter_id", "from_week", "note"]));
          }
          case "row_restore": {
            const m = need(args, ["row_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/rows/{row_id}/restore`, args, ["row_id"]));
          }
          case "set_goals":
            return ok(await client.call("PUT", `${base}/goals`, args, [], [], ["goals"]));
          case "set_quarter": {
            const body = { ...args, label: args.label_text };
            return ok(await client.call("POST", `${base}/quarter`, body, [], [], ["label", "start_date", "carry_ending"]));
          }
          case "variance": {
            const m = need(args, ["quarter_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/variance`, args, [], ["quarter_id", "threshold_pct"]));
          }
          case "roll_forward":
            return ok(await client.call("POST", `${base}/roll-forward`, args, [], [], ["quarter_id", "create_next", "as_of"]));
          case "autofill_from_statement": {
            const m = need(args, ["quarter_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/autofill-from-statement`, args, [], [], ["quarter_id", "transactions", "apply"]));
          }
          case "autofill_accept": {
            const m = need(args, ["quarter_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/autofill/accept`, args, [], [], ["quarter_id", "proposal_ids"]));
          }
          case "build_from_statements": {
            const m = need(args, ["quarter_id"]);
            if (m) return err(m);
            return ok(
              await client.call("POST", `${base}/build-from-statements`, args, [], [], [
                "quarter_id", "transactions", "replace_rows", "align_to_statement",
              ])
            );
          }
          case "build_accept": {
            const m = need(args, ["quarter_id", "proposal"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/build/accept`, args, [], [], ["quarter_id", "proposal"]));
          }
          case "automanage_health":
            return ok(await client.call("GET", `${base}/automanage/health`, args));
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_budget ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_budget error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_sheets ────────────────────────────────────────
  server.tool(
    "mind_sheets",
    "MIND Sheets — Airtable-style tables at m-i-n-d.ai/#/sheets. Actions: tables_list, table_create, table_update, table_delete, column_add, column_update, column_delete, columns_reorder, rows_list, row_create, row_update, row_delete, rows_bulk_delete, export_csv (returns raw CSV text).",
    {
      action: z
        .enum([
          "tables_list", "table_create", "table_update", "table_delete", "column_add", "column_update",
          "column_delete", "columns_reorder", "rows_list", "row_create", "row_update", "row_delete",
          "rows_bulk_delete", "export_csv",
        ])
        .describe("Which sheets operation to perform."),
      table_id: z.string().optional().describe("Table id — every action except tables_list/table_create."),
      name: z.string().optional().describe("Table name (table_create required/table_update required) or column name (column_add required/column_update)."),
      columns: z.array(z.record(z.string(), z.any())).optional().describe("[{name, type, options?, width?}] — table_create initial columns."),
      column_id: z.string().optional().describe("Column id — column_update/column_delete."),
      type: z.string().optional().describe("Column type: text|number|select|date|checkbox|url — required for column_add; column_update."),
      options: z.array(z.string()).optional().describe("Select-type options — column_add/column_update."),
      width: z.number().int().optional().describe("Column width in px — column_update."),
      column_ids: z.array(z.string()).optional().describe("New column order — required for columns_reorder."),
      limit: z.number().int().optional().describe("Max rows — rows_list (default 500, max 2000)."),
      offset: z.number().int().optional().describe("Row offset — rows_list (default 0)."),
      row_id: z.string().optional().describe("Row id — row_update/row_delete."),
      cells: z.record(z.string(), z.any()).optional().describe("{column_id: value, ...} — row_create/row_update (required)."),
      row_ids: z.array(z.string()).optional().describe("Row ids to delete — required for rows_bulk_delete."),
    },
    async (args) => {
      const { action } = args;
      const base = "/sheets";
      try {
        switch (action) {
          case "tables_list":
            return ok(await client.call("GET", `${base}/tables`, args));
          case "table_create": {
            const m = need(args, ["name"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/tables`, args, [], [], ["name", "columns"]));
          }
          case "table_update": {
            const m = need(args, ["table_id", "name"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/tables/{table_id}`, args, ["table_id"], [], ["name"]));
          }
          case "table_delete": {
            const m = need(args, ["table_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/tables/{table_id}`, args, ["table_id"]));
          }
          case "column_add": {
            const m = need(args, ["table_id", "name", "type"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/tables/{table_id}/columns`, args, ["table_id"], [], ["name", "type", "options"]));
          }
          case "column_update": {
            const m = need(args, ["table_id", "column_id"]);
            if (m) return err(m);
            return ok(
              await client.call("PATCH", `${base}/tables/{table_id}/columns/{column_id}`, args, ["table_id", "column_id"], [], [
                "name", "type", "options", "width",
              ])
            );
          }
          case "column_delete": {
            const m = need(args, ["table_id", "column_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/tables/{table_id}/columns/{column_id}`, args, ["table_id", "column_id"]));
          }
          case "columns_reorder": {
            const m = need(args, ["table_id", "column_ids"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/tables/{table_id}/columns/reorder`, args, ["table_id"], [], ["column_ids"]));
          }
          case "rows_list": {
            const m = need(args, ["table_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/tables/{table_id}/rows`, args, ["table_id"], ["limit", "offset"]));
          }
          case "row_create": {
            const m = need(args, ["table_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/tables/{table_id}/rows`, args, ["table_id"], [], ["cells"]));
          }
          case "row_update": {
            const m = need(args, ["table_id", "row_id", "cells"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/tables/{table_id}/rows/{row_id}`, args, ["table_id", "row_id"], [], ["cells"]));
          }
          case "row_delete": {
            const m = need(args, ["table_id", "row_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/tables/{table_id}/rows/{row_id}`, args, ["table_id", "row_id"]));
          }
          case "rows_bulk_delete": {
            const m = need(args, ["table_id", "row_ids"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/tables/{table_id}/rows/bulk_delete`, args, ["table_id"], [], ["row_ids"]));
          }
          case "export_csv": {
            const m = need(args, ["table_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/tables/{table_id}/export.csv`, args, ["table_id"]));
          }
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_sheets ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_sheets error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_email ─────────────────────────────────────────
  server.tool(
    "mind_email",
    "MIND Email Manager at m-i-n-d.ai/#/email. Actions: status, inbox, thread, message, search, sync, action (archive/trash/mark_read/mark_unread/star/unstar a batch of messages), draft (AI-draft a reply or new email, no send), draft_save, send (⚠️ OUTWARD — sends a real email; confirm with the user before calling), voice, voice_pref_set, voice_pref_clear, voice_rebuild. Note: the REST body field 'action' on the `action` operation is exposed here as `email_action` (an 'action' field would collide with this tool's own dispatch key).",
    {
      action: z
        .enum(["status", "inbox", "thread", "message", "search", "sync", "action", "draft", "draft_save", "send", "voice", "voice_pref_set", "voice_pref_clear", "voice_rebuild"])
        .describe("Which email operation to perform."),
      mode: z.string().optional().describe("Mailbox mode, e.g. 'user' — most actions (default 'user')."),
      thread_id: z.string().optional().describe("Thread id — required for action=thread."),
      message_id: z.string().optional().describe("Message id — required for action=message; also draft (reply target)/draft_save (required)."),
      q: z.string().optional().describe("Search query — required for search."),
      limit: z.number().int().optional().describe("Max results — search/inbox (as 'top')."),
      top: z.number().int().optional().describe("Max results to sync/list — inbox/sync (default 25)."),
      page_token: z.string().optional().describe("Pagination token — inbox."),
      unread_only: z.boolean().optional().describe("Only unread messages — inbox."),
      message_ids: z.array(z.string()).optional().describe("Message ids to act on — required for action='action'."),
      email_action: z.enum(["archive", "trash", "mark_read", "mark_unread", "star", "unstar"]).optional().describe("Which mailbox action to apply — required for action='action'. Maps to the REST body field 'action'."),
      instructions: z.string().optional().describe("Free-text drafting instructions — draft."),
      thread_context: z.string().optional().describe("Pre-fetched thread context to skip a lookup — draft."),
      remember_instruction: z.boolean().optional().describe("Promote the instruction to a standing voice correction — draft."),
      body_text: z.string().optional().describe("Draft/send body text — draft_save (required)/send."),
      to: z.array(z.string()).optional().describe("Recipient addresses — send (required unless reply_to_message_id is set)."),
      cc: z.array(z.string()).optional().describe("CC addresses — send."),
      subject: z.string().optional().describe("Subject line — send."),
      body: z.string().optional().describe("Send body (HTML/plain) — send (either body or body_text required)."),
      reply_to_message_id: z.string().optional().describe("Reply target message id — send."),
      instruction: z.string().optional().describe("Voice instruction text — required for voice_pref_set/voice_pref_clear."),
    },
    async (args) => {
      const { action } = args;
      const base = "/email";
      try {
        switch (action) {
          case "status":
            return ok(await client.call("GET", `${base}/status`, args, [], ["mode"]));
          case "inbox":
            return ok(await client.call("GET", `${base}/inbox`, args, [], ["mode", "top", "page_token", "unread_only"]));
          case "thread": {
            const m = need(args, ["thread_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/thread/{thread_id}`, args, ["thread_id"], ["mode"]));
          }
          case "message": {
            const m = need(args, ["message_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/message/{message_id}`, args, ["message_id"], ["mode"]));
          }
          case "search": {
            const m = need(args, ["q"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/search`, args, [], ["mode", "q", "limit"]));
          }
          case "sync":
            return ok(await client.call("POST", `${base}/sync`, args, [], [], ["mode", "top"]));
          case "action": {
            const m = need(args, ["message_ids", "email_action"]);
            if (m) return err(m);
            const body = { ...args, action: args.email_action };
            return ok(await client.call("POST", `${base}/action`, body, [], [], ["mode", "message_ids", "action"]));
          }
          case "draft":
            return ok(
              await client.call("POST", `${base}/draft`, args, [], [], [
                "mode", "message_id", "instructions", "thread_context", "remember_instruction",
              ])
            );
          case "draft_save": {
            const m = need(args, ["message_id", "body_text"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/draft/save`, args, [], [], ["mode", "message_id", "body_text"]));
          }
          case "send": {
            if (!args.body && !args.body_text) return err("Error: body or body_text required for send.");
            return ok(
              await client.call("POST", `${base}/send`, args, [], [], [
                "mode", "to", "cc", "subject", "body", "body_text", "reply_to_message_id",
              ])
            );
          }
          case "voice":
            return ok(await client.call("GET", `${base}/voice`, args));
          case "voice_pref_set": {
            const m = need(args, ["instruction"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/voice/pref`, args, [], [], ["instruction"]));
          }
          case "voice_pref_clear": {
            const m = need(args, ["instruction"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/voice/pref`, args, [], [], ["instruction"]));
          }
          case "voice_rebuild":
            return ok(await client.call("POST", `${base}/voice/rebuild`, args));
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_email ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_email error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_checklists ────────────────────────────────────
  server.tool(
    "mind_checklists",
    "Kanon checklists at kanon.theastraway.com, attached to Life items or tasks. Actions: templates_list, template_get, template_create, template_update, template_delete, list, get, create, update, delete, toggle_item, complete, progress (rollup for a parent_type+parent_id).",
    {
      action: z
        .enum(["templates_list", "template_get", "template_create", "template_update", "template_delete", "list", "get", "create", "update", "delete", "toggle_item", "complete", "progress"])
        .describe("Which checklist operation to perform."),
      template_id: z.string().optional().describe("Checklist template id — template_get/template_update/template_delete (required); create (instantiate from a template)."),
      title: z.string().optional().describe("Title — template_create (required)/template_update; create/update (checklist title)."),
      description: z.string().optional().describe("Long description — template_create/template_update."),
      sections: z.array(z.record(z.string(), z.any())).optional().describe("[{section_id?, title, phase: 'pre'|'run'|'post', items: [{item_id?, label, note?, checked?, assignee?}]}] — template_create/template_update; create/update (inline sections, alternative to template_id)."),
      origin: z.enum(["user", "flagship"]).optional().describe("Template origin — template_create (default 'user')."),
      schedule: z.record(z.string(), z.any()).optional().describe("Recurrence config — template_create/template_update; create/update."),
      checklist_id: z.string().optional().describe("Checklist id — get/update/delete/toggle_item/complete (required)."),
      parent_type: z.enum(["life_item", "task"]).optional().describe("Parent type — create (required); list/progress filter (progress requires it)."),
      parent_id: z.string().optional().describe("Parent id (a Life item_id or task id) — create (required); list/progress filter (progress requires it)."),
      parent_label: z.string().optional().describe("Human-readable parent label — create."),
      assigned_to: z.string().optional().describe("Assignee (e.g. 'Dae') — create/update."),
      item_id: z.string().optional().describe("Checklist item id — required for toggle_item."),
    },
    async (args) => {
      const { action } = args;
      const base = "/developer/v1/checklists";
      try {
        switch (action) {
          case "templates_list":
            return ok(await client.call("GET", `${base}/templates`, args));
          case "template_get": {
            const m = need(args, ["template_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/templates/{template_id}`, args, ["template_id"]));
          }
          case "template_create": {
            const m = need(args, ["title"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/templates`, args, [], [], ["title", "description", "sections", "origin", "schedule"]));
          }
          case "template_update": {
            const m = need(args, ["template_id"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/templates/{template_id}`, args, ["template_id"], [], ["title", "description", "sections", "schedule"]));
          }
          case "template_delete": {
            const m = need(args, ["template_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/templates/{template_id}`, args, ["template_id"]));
          }
          case "list":
            return ok(await client.call("GET", base, args, [], ["parent_type", "parent_id"]));
          case "get": {
            const m = need(args, ["checklist_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/{checklist_id}`, args, ["checklist_id"]));
          }
          case "create": {
            const m = need(args, ["parent_type", "parent_id"]);
            if (m) return err(m);
            return ok(
              await client.call("POST", base, args, [], [], [
                "parent_type", "parent_id", "parent_label", "template_id", "title", "sections", "schedule", "assigned_to",
              ])
            );
          }
          case "update": {
            const m = need(args, ["checklist_id"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/{checklist_id}`, args, ["checklist_id"], [], ["title", "sections", "schedule", "assigned_to"]));
          }
          case "delete": {
            const m = need(args, ["checklist_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/{checklist_id}`, args, ["checklist_id"]));
          }
          case "toggle_item": {
            const m = need(args, ["checklist_id", "item_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/{checklist_id}/items/{item_id}/toggle`, args, ["checklist_id", "item_id"]));
          }
          case "complete": {
            const m = need(args, ["checklist_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/{checklist_id}/complete`, args, ["checklist_id"]));
          }
          case "progress": {
            const m = need(args, ["parent_type", "parent_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/progress`, args, [], ["parent_type", "parent_id"]));
          }
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_checklists ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_checklists error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_sign ──────────────────────────────────────────
  server.tool(
    "mind_sign",
    "MIND Sign — e-signature envelopes at m-i-n-d.ai/#/mindsign. Actions: list, get, create (JSON variant — document by pdf_url or pdf_base64), setup, fields, send (⚠️ OUTWARD — emails every signer; confirm with the user before calling), resend (⚠️ OUTWARD — re-emails one signer; confirm with the user before calling), void, delete, audit, certificate, download_url (returns a download link string, no binary transferred through MCP).",
    {
      action: z
        .enum(["list", "get", "create", "setup", "fields", "send", "resend", "void", "delete", "audit", "certificate", "download_url"])
        .describe("Which e-signature operation to perform."),
      envelope_id: z.string().optional().describe("Envelope id — every action except list/create."),
      status: z.enum(["draft", "sent", "completed", "voided"]).optional().describe("Filter by status — list."),
      q: z.string().optional().describe("Free-text search — list."),
      limit: z.number().int().optional().describe("Max results — list (default 50, 1-200)."),
      offset: z.number().int().optional().describe("Pagination offset — list (default 0)."),
      include_deleted: z.boolean().optional().describe("Include soft-deleted envelopes — list/get."),
      title: z.string().optional().describe("Envelope title — required for create."),
      pdf_url: z.string().optional().describe("Source PDF URL — create (exactly one of pdf_url/pdf_base64 required)."),
      pdf_base64: z.string().optional().describe("Source PDF as base64 — create (exactly one of pdf_url/pdf_base64 required)."),
      signers: z.array(z.record(z.string(), z.any())).optional().describe("[{name, email}] — required for create/setup."),
      fields: z.array(z.record(z.string(), z.any())).optional().describe("[{page, x, y, w, h, type: 'signature'|'initials'|'name'|'date'|'text', signer_index?, label?, default_value?, required?, font_size?}] — required for create/setup/fields."),
      message: z.string().optional().describe("Message to signers — create/send/resend."),
      send: z.boolean().optional().describe("Send immediately on create — create (default false)."),
      signing_order: z.enum(["parallel", "sequential"]).optional().describe("Signing order — create/setup."),
      only_email: z.string().optional().describe("Send only to this signer's email — send."),
      signer_email: z.string().optional().describe("Signer email to resend to — required for resend."),
      reason: z.string().optional().describe("Void reason — void."),
    },
    async (args) => {
      const { action } = args;
      const base = "/api/sign/envelopes";
      try {
        switch (action) {
          case "list":
            return ok(await client.call("GET", base, args, [], ["status", "q", "limit", "offset", "include_deleted"]));
          case "get": {
            const m = need(args, ["envelope_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/{envelope_id}`, args, ["envelope_id"], ["include_deleted"]));
          }
          case "create": {
            const m = need(args, ["title", "signers", "fields"]);
            if (m) return err(m);
            if (!args.pdf_url && !args.pdf_base64) return err("Error: pdf_url or pdf_base64 required for create.");
            return ok(
              await client.call("POST", `${base}/json`, args, [], [], [
                "title", "pdf_url", "pdf_base64", "signers", "fields", "message", "send", "signing_order",
              ])
            );
          }
          case "setup": {
            const m = need(args, ["envelope_id", "fields", "signers"]);
            if (m) return err(m);
            return ok(await client.call("PUT", `${base}/{envelope_id}/setup`, args, ["envelope_id"], [], ["fields", "signers", "signing_order"]));
          }
          case "fields": {
            const m = need(args, ["envelope_id", "fields"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/{envelope_id}/fields`, args, ["envelope_id"], [], ["fields"]));
          }
          case "send": {
            const m = need(args, ["envelope_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/{envelope_id}/send`, args, ["envelope_id"], [], ["message", "only_email"]));
          }
          case "resend": {
            const m = need(args, ["envelope_id", "signer_email"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/{envelope_id}/resend`, args, ["envelope_id"], [], ["signer_email", "message"]));
          }
          case "void": {
            const m = need(args, ["envelope_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/{envelope_id}/void`, args, ["envelope_id"], [], ["reason"]));
          }
          case "delete": {
            const m = need(args, ["envelope_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/{envelope_id}`, args, ["envelope_id"]));
          }
          case "audit": {
            const m = need(args, ["envelope_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/{envelope_id}/audit`, args, ["envelope_id"]));
          }
          case "certificate": {
            const m = need(args, ["envelope_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/{envelope_id}/certificate`, args, ["envelope_id"]));
          }
          case "download_url": {
            const m = need(args, ["envelope_id"]);
            if (m) return err(m);
            return ok({ download_url: `https://www.m-i-n-d.ai/api/sign/envelopes/${encodeURIComponent(String(args.envelope_id))}/download` });
          }
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_sign ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_sign error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_invoices ──────────────────────────────────────
  server.tool(
    "mind_invoices",
    "Invoice Agent at m-i-n-d.ai/#/invoiceagent. Actions: list, get, create, update, delete, ask (ask a question about an invoice), invite (⚠️ OUTWARD — emails the bill-to party a payment link; confirm with the user before calling), pdf_url (returns a PDF link string, no binary transferred through MCP), received (invoices billed to you).",
    {
      action: z.enum(["list", "get", "create", "update", "delete", "ask", "invite", "pdf_url", "received"]).describe("Which invoice operation to perform."),
      invoice_id: z.string().optional().describe("Invoice id — every action except list/create/received."),
      limit: z.number().int().optional().describe("Max results — list (default 100)/received (default 100)."),
      invoice_number: z.string().optional().describe("Invoice number — create/update."),
      issue_date: z.string().optional().describe("Issue date (YYYY-MM-DD) — create/update."),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD) — create/update."),
      bill_from: z.record(z.string(), z.any()).optional().describe("{name, company?, email?, address_line_1?, address_line_2?, city?, region?, postal_code?, country?, tax_id?} — required for create; update."),
      bill_to: z.record(z.string(), z.any()).optional().describe("Same shape as bill_from — required for create; update."),
      line_items: z.array(z.record(z.string(), z.any())).optional().describe("[{description, quantity?, unit_price?, tier?, agent_slug?, project_id?, line_kind?, period_start?, period_end?, market_value?, market_price?, market_note?, net_price?, justification?}] — create/update."),
      tax_rate: z.number().optional().describe("Tax rate (e.g. 0.0825) — create/update."),
      discount_amount: z.number().optional().describe("Flat discount amount — create/update."),
      currency: z.string().optional().describe("Currency code — create/update (default 'USD')."),
      notes: z.string().optional().describe("Free-text notes — create/update."),
      payment_terms: z.string().optional().describe("Payment terms string — create/update (default 'Net 15')."),
      logo_data_url: z.string().optional().describe("Logo image as a data URL — create/update."),
      status: z.enum(["draft", "sent", "paid", "overdue", "void"]).optional().describe("Invoice status — update."),
      question: z.string().optional().describe("Question about the invoice — required for ask."),
      outstanding_only: z.boolean().optional().describe("Only unpaid received invoices — received (default true)."),
    },
    async (args) => {
      const { action } = args;
      const base = "/invoices";
      try {
        switch (action) {
          case "list":
            return ok(await client.call("GET", base, args, [], ["limit"]));
          case "get": {
            const m = need(args, ["invoice_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/{invoice_id}`, args, ["invoice_id"]));
          }
          case "create": {
            const m = need(args, ["bill_from", "bill_to"]);
            if (m) return err(m);
            return ok(
              await client.call("POST", base, args, [], [], [
                "invoice_number", "issue_date", "due_date", "bill_from", "bill_to", "line_items",
                "tax_rate", "discount_amount", "currency", "notes", "payment_terms", "logo_data_url",
              ])
            );
          }
          case "update": {
            const m = need(args, ["invoice_id"]);
            if (m) return err(m);
            return ok(
              await client.call("PATCH", `${base}/{invoice_id}`, args, ["invoice_id"], [], [
                "invoice_number", "issue_date", "due_date", "bill_from", "bill_to", "line_items",
                "tax_rate", "discount_amount", "currency", "notes", "payment_terms", "status", "logo_data_url",
              ])
            );
          }
          case "delete": {
            const m = need(args, ["invoice_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/{invoice_id}`, args, ["invoice_id"]));
          }
          case "ask": {
            const m = need(args, ["invoice_id", "question"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/{invoice_id}/ask`, args, ["invoice_id"], [], ["question"]));
          }
          case "invite": {
            const m = need(args, ["invoice_id"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/{invoice_id}/invite`, args, ["invoice_id"]));
          }
          case "pdf_url": {
            const m = need(args, ["invoice_id"]);
            if (m) return err(m);
            return ok({ pdf_url: `https://www.m-i-n-d.ai/invoices/${encodeURIComponent(String(args.invoice_id))}/pdf` });
          }
          case "received":
            return ok(await client.call("GET", `${base}/received`, args, [], ["outstanding_only", "limit"]));
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_invoices ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_invoices error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_books ─────────────────────────────────────────
  server.tool(
    "mind_books",
    "MIND Books — small-business accounting at m-i-n-d.ai/#/mind-books. Actions: overview, vendors_list, vendor_create, customers_list, customer_create, accounts, bills, invoices, health.",
    {
      action: z.enum(["overview", "vendors_list", "vendor_create", "customers_list", "customer_create", "accounts", "bills", "invoices", "health"]).describe("Which MIND Books operation to perform."),
      display_name: z.string().optional().describe("Vendor/customer display name — required for vendor_create/customer_create."),
      email: z.string().optional().describe("Contact email — vendor_create/customer_create."),
      phone: z.string().optional().describe("Contact phone — vendor_create."),
      note: z.string().optional().describe("Free-text note — vendor_create."),
    },
    async (args) => {
      const { action } = args;
      const base = "/developer/v1/mind-books";
      try {
        switch (action) {
          case "overview":
            return ok(await client.call("GET", `${base}/overview`, args));
          case "vendors_list":
            return ok(await client.call("GET", `${base}/vendors`, args));
          case "vendor_create": {
            const m = need(args, ["display_name"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/vendors`, args, [], [], ["display_name", "email", "phone", "note"]));
          }
          case "customers_list":
            return ok(await client.call("GET", `${base}/customers`, args));
          case "customer_create": {
            const m = need(args, ["display_name"]);
            if (m) return err(m);
            return ok(await client.call("POST", `${base}/customers`, args, [], [], ["display_name", "email"]));
          }
          case "accounts":
            return ok(await client.call("GET", `${base}/accounts`, args));
          case "bills":
            return ok(await client.call("GET", `${base}/bills`, args));
          case "invoices":
            return ok(await client.call("GET", `${base}/invoices`, args));
          case "health":
            return ok(await client.call("GET", `${base}/health`, args));
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_books ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_books error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_timer ─────────────────────────────────────────
  server.tool(
    "mind_timer",
    "Tempo time tracking. Actions: start, stop, current (the running entry, if any), entries_list, entry_create (manual entry), entry_update, entry_delete, summary.",
    {
      action: z.enum(["start", "stop", "current", "entries_list", "entry_create", "entry_update", "entry_delete", "summary"]).describe("Which timer operation to perform."),
      description: z.string().optional().describe("What you're working on — start/entry_create/entry_update."),
      entry_id: z.string().optional().describe("Time entry id — required for entry_update/entry_delete."),
      item_id: z.string().optional().describe("Life item_id this time is logged against — start/entry_create/entry_update."),
      project: z.string().optional().describe("Free-text project label — start/entry_create/entry_update."),
      tags: z.array(z.string()).optional().describe("Tags — start/entry_create/entry_update."),
      billable: z.boolean().optional().describe("Mark billable — start/entry_create/entry_update (default false)."),
      days: z.number().int().optional().describe("How many days back to list — entries_list (default 7, 1-90)."),
      started_at: z.string().optional().describe("Start timestamp (ISO 8601) — required for entry_create; entry_update."),
      stopped_at: z.string().optional().describe("Stop timestamp (ISO 8601) — required for entry_create; entry_update."),
    },
    async (args) => {
      const { action } = args;
      const base = "/timer";
      try {
        switch (action) {
          case "start":
            return ok(await client.call("POST", `${base}/start`, args, [], [], ["description", "item_id", "project", "tags", "billable"]));
          case "stop":
            return ok(await client.call("POST", `${base}/stop`, args));
          case "current":
            return ok(await client.call("GET", `${base}/current`, args));
          case "entries_list":
            return ok(await client.call("GET", `${base}/entries`, args, [], ["days"]));
          case "entry_create": {
            const m = need(args, ["started_at", "stopped_at"]);
            if (m) return err(m);
            return ok(
              await client.call("POST", `${base}/entries`, args, [], [], [
                "description", "item_id", "project", "tags", "billable", "started_at", "stopped_at",
              ])
            );
          }
          case "entry_update": {
            const m = need(args, ["entry_id"]);
            if (m) return err(m);
            return ok(
              await client.call("PATCH", `${base}/entries/{entry_id}`, args, ["entry_id"], [], [
                "description", "project", "item_id", "tags", "billable", "started_at", "stopped_at",
              ])
            );
          }
          case "entry_delete": {
            const m = need(args, ["entry_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/entries/{entry_id}`, args, ["entry_id"]));
          }
          case "summary":
            return ok(await client.call("GET", `${base}/summary`, args));
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_timer ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_timer error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_forms ─────────────────────────────────────────
  server.tool(
    "mind_forms",
    "Quill forms at m-i-n-d.ai/#/forms — public lead-capture forms that can auto-create CRM contacts / Life items. Actions: list, get, create, update, delete, submissions, public_get (read a published form by its public slug, no auth needed).",
    {
      action: z.enum(["list", "get", "create", "update", "delete", "submissions", "public_get"]).describe("Which form operation to perform."),
      form_id: z.string().optional().describe("Form id — get/update/delete/submissions (required)."),
      name: z.string().optional().describe("Form name — required for create; update."),
      description: z.string().optional().describe("Form description — create/update."),
      fields: z.array(z.record(z.string(), z.any())).optional().describe("[{field_id?, label, type?, required?, options?, placeholder?, maps_to?}] — create/update."),
      settings: z.record(z.string(), z.any()).optional().describe("{create_contact?, create_life_item?, contact_type?, success_message?, accent?} — create/update."),
      is_published: z.boolean().optional().describe("Publish/unpublish the form — update."),
      slug: z.string().optional().describe("Public form slug — required for public_get."),
    },
    async (args) => {
      const { action } = args;
      const base = "/forms";
      try {
        switch (action) {
          case "list":
            return ok(await client.call("GET", base, args));
          case "get": {
            const m = need(args, ["form_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/{form_id}`, args, ["form_id"]));
          }
          case "create": {
            const m = need(args, ["name"]);
            if (m) return err(m);
            return ok(await client.call("POST", base, args, [], [], ["name", "description", "fields", "settings"]));
          }
          case "update": {
            const m = need(args, ["form_id"]);
            if (m) return err(m);
            return ok(await client.call("PATCH", `${base}/{form_id}`, args, ["form_id"], [], ["name", "description", "fields", "settings", "is_published"]));
          }
          case "delete": {
            const m = need(args, ["form_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/{form_id}`, args, ["form_id"]));
          }
          case "submissions": {
            const m = need(args, ["form_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/{form_id}/submissions`, args, ["form_id"]));
          }
          case "public_get": {
            const m = need(args, ["slug"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/public/{slug}`, args, ["slug"]));
          }
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_forms ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_forms error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_library ───────────────────────────────────────
  server.tool(
    "mind_library",
    "MIND Library — personal bookshelf at m-i-n-d.ai/#/library. Actions: authors (author stats), books_list, book_get, book_content (chapter text/table of contents), book_companion (AI reading companion for a book), book_create, book_update, book_delete.",
    {
      action: z.enum(["authors", "books_list", "book_get", "book_content", "book_companion", "book_create", "book_update", "book_delete"]).describe("Which library operation to perform."),
      book_id: z.string().optional().describe("Book id — every action except authors/books_list/book_create."),
      q: z.string().optional().describe("Free-text search — books_list."),
      author: z.string().optional().describe("Filter by author — books_list."),
      genre: z.string().optional().describe("Filter by genre — books_list."),
      series: z.string().optional().describe("Filter by series — books_list; book_create/book_update."),
      status: z.enum(["unread", "reading", "finished", "abandoned"]).optional().describe("Filter by reading status — books_list; book_create (default 'unread')/book_update."),
      shelf_id: z.string().optional().describe("Filter by shelf id — books_list."),
      tag: z.string().optional().describe("Filter by tag — books_list."),
      sort: z.string().optional().describe("Sort field — books_list (default 'added')."),
      order: z.string().optional().describe("Sort order 'asc'|'desc' — books_list (default 'desc')."),
      limit: z.number().int().optional().describe("Max results — books_list (default 60, 1-500)."),
      offset: z.number().int().optional().describe("Pagination offset — books_list (default 0)."),
      chapter: z.string().optional().describe("Return only this chapter id — book_content."),
      toc_only: z.boolean().optional().describe("Return only the table of contents, no HTML — book_content (default false)."),
      title: z.string().optional().describe("Book title — required for book_create; book_update."),
      subtitle: z.string().optional().describe("Book subtitle — book_create/book_update."),
      authors: z.array(z.string()).optional().describe("Author names — book_create/book_update."),
      genres: z.array(z.string()).optional().describe("Genres — book_create/book_update."),
      series_index: z.number().optional().describe("Position within the series — book_create/book_update."),
      isbn10: z.string().optional().describe("ISBN-10 — book_create/book_update."),
      isbn13: z.string().optional().describe("ISBN-13 — book_create/book_update."),
      publisher: z.string().optional().describe("Publisher — book_create/book_update."),
      published_year: z.number().int().optional().describe("Publication year — book_create/book_update."),
      language: z.string().optional().describe("Language code — book_create/book_update."),
      page_count: z.number().int().optional().describe("Page count — book_create/book_update."),
      description: z.string().optional().describe("Book description/blurb — book_create/book_update."),
      cover_url: z.string().optional().describe("Cover image URL — book_create/book_update."),
      tags: z.array(z.string()).optional().describe("Tags — book_create/book_update."),
      source: z.string().optional().describe("Source of the record — book_create (default 'manual')."),
      source_id: z.string().optional().describe("External source id — book_create."),
      file_url: z.string().optional().describe("Book file URL — book_create/book_update."),
      file_format: z.string().optional().describe("File format, e.g. 'epub'/'pdf' — book_create/book_update."),
      file_size: z.number().int().optional().describe("File size in bytes — book_create/book_update."),
      progress_pct: z.number().int().optional().describe("Reading progress percent 0-100 — book_create (default 0)/book_update."),
      rating: z.number().optional().describe("Rating 0-5 — book_create/book_update."),
      notes: z.string().optional().describe("Free-text notes — book_create/book_update."),
      date_started: z.string().optional().describe("Date started (YYYY-MM-DD) — book_create/book_update."),
      date_finished: z.string().optional().describe("Date finished (YYYY-MM-DD) — book_create/book_update."),
    },
    async (args) => {
      const { action } = args;
      const base = "/library";
      try {
        switch (action) {
          case "authors":
            return ok(await client.call("GET", `${base}/authors`, args));
          case "books_list":
            return ok(
              await client.call("GET", `${base}/books`, args, [], [
                "q", "author", "genre", "series", "status", "shelf_id", "tag", "sort", "order", "limit", "offset",
              ])
            );
          case "book_get": {
            const m = need(args, ["book_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/books/{book_id}`, args, ["book_id"]));
          }
          case "book_content": {
            const m = need(args, ["book_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/books/{book_id}/content`, args, ["book_id"], ["chapter", "toc_only"]));
          }
          case "book_companion": {
            const m = need(args, ["book_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", `${base}/books/{book_id}/companion`, args, ["book_id"]));
          }
          case "book_create": {
            const m = need(args, ["title"]);
            if (m) return err(m);
            return ok(
              await client.call("POST", `${base}/books`, args, [], [], [
                "title", "subtitle", "authors", "genres", "series", "series_index", "isbn10", "isbn13",
                "publisher", "published_year", "language", "page_count", "description", "cover_url", "tags",
                "source", "source_id", "file_url", "file_format", "file_size", "status", "progress_pct",
                "rating", "notes", "date_started", "date_finished",
              ])
            );
          }
          case "book_update": {
            const m = need(args, ["book_id"]);
            if (m) return err(m);
            return ok(
              await client.call("PUT", `${base}/books/{book_id}`, args, ["book_id"], [], [
                "title", "subtitle", "authors", "genres", "series", "series_index", "isbn10", "isbn13",
                "publisher", "published_year", "language", "page_count", "description", "cover_url", "tags",
                "file_url", "file_format", "file_size", "status", "progress_pct", "rating", "notes",
                "date_started", "date_finished",
              ])
            );
          }
          case "book_delete": {
            const m = need(args, ["book_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", `${base}/books/{book_id}`, args, ["book_id"]));
          }
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_library ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_library error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  // ─── mind_share ─────────────────────────────────────────
  // Share links for one MIND document (distinct from mind_mindmap's own
  // share/unshare, which are web-app-only). Mirrors the hosted handler
  // _t_mind_share in backend/routes/mcp_server_routes.py 1:1.
  server.tool(
    "mind_share",
    "Create and manage share links for a MIND document. Actions: create (default — mint a new share link), list (this document's share links), list_all (every share link across your documents), revoke (delete one share link).",
    {
      action: z
        .enum(["create", "list", "list_all", "revoke"])
        .optional()
        .default("create")
        .describe("Which share operation to perform. Defaults to 'create'."),
      doc_id: z.string().optional().describe("Document id — required for create/list/revoke."),
      role: z.string().optional().describe("Access role granted to the share, e.g. 'viewer' — create."),
      grantee_username: z.string().optional().describe("Share directly with this MIND username instead of a public link — create."),
      expires_in_days: z.number().int().optional().describe("Share link expiry in days — create."),
      password: z.string().optional().describe("Password to protect the share link — create."),
      share_id: z.string().optional().describe("Share id — required for revoke."),
    },
    async (args) => {
      const { action } = args;
      try {
        switch (action) {
          case "create": {
            const m = need(args, ["doc_id"]);
            if (m) return err(m);
            return ok(
              await client.call("POST", "/developer/v1/documents/{doc_id}/share", args, ["doc_id"], [], [
                "role", "grantee_username", "expires_in_days", "password",
              ])
            );
          }
          case "list": {
            const m = need(args, ["doc_id"]);
            if (m) return err(m);
            return ok(await client.call("GET", "/developer/v1/documents/{doc_id}/share", args, ["doc_id"]));
          }
          case "list_all":
            return ok(await client.call("GET", "/developer/v1/documents/shares", args));
          case "revoke": {
            const m = need(args, ["doc_id", "share_id"]);
            if (m) return err(m);
            return ok(await client.call("DELETE", "/developer/v1/documents/{doc_id}/share/{share_id}", args, ["doc_id", "share_id"]));
          }
          default: {
            const _exhaustive: never = action;
            return err(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (e) {
        if (e instanceof MindApiError) return err(`mind_share ${action} failed (HTTP ${e.status}): ${apiDetail(e)}`);
        return err(`mind_share error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  );

  return server;
}
