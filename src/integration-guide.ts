/**
 * Self-describing integration layer for the MIND MCP server.
 *
 * `SERVER_INSTRUCTIONS` is returned to every client in the MCP `initialize`
 * response — it is the first thing any connecting agent sees. It must orient
 * an agent that knows nothing about MIND: what it is, which integration path
 * to use for its runtime, how to authenticate, and the session protocol.
 *
 * `INTEGRATION_GUIDE` is the full playbook, exposed as the readable MCP
 * resource `mind://integration-guide` for agents that want the deep dive.
 */

export const SERVER_INSTRUCTIONS = `MIND is the persistent memory and knowledge-graph layer for AI agents — identity, memories, decisions, tasks, contacts, and emotional context that survive across every session, every tool, and every agent.

═══ HOW TO INTEGRATE — pick the path for your runtime ═══
• You are an MCP client (Claude Code, Claude Desktop, Cursor, Windsurf, or any MCP host): you are already connected. Call the mind_* tools directly — nothing else to install.
• You are an OpenClaw agent: do NOT use this MCP server. Install the OpenClaw plugin instead — \`openclaw plugins install @astramindapp/openclaw-mind\` — which exposes the same MIND surface as native OpenClaw tools.
• You are any other runtime (custom agent, script, n8n, backend): call the REST API directly at https://m-i-n-d.ai/developer/v1 with header \`X-API-Key: <key>\`. Every mind_* tool maps 1:1 to a /developer/v1 endpoint.

AUTH: every path needs a MIND API key (prefix \`mind_\`). Get one at https://m-i-n-d.ai → Settings → Developer → API Keys. For this MCP server, set env var MIND_API_KEY (and optionally MIND_BASE_URL). The admin tools (mind_admin, mind_agents, mind_tickets) require an admin-scoped key.

═══ SESSION PROTOCOL — do this every session ═══
1. START: call mind_context — loads identity, operating rules, priorities, recent activity. Never skip it.
2. BEFORE deciding or asserting: call mind_query on the topic. MIND is authoritative memory — do not guess or claim something does not exist without querying.
3. AFTER completing non-trivial work: call mind_remember to log the outcome. Unlogged work is invisible to the next session. Use \`type: "entry"\` (PRIVATE — default) for all agent outcomes, logs, decisions, and research.

⚠️ PRIVATE vs PUBLIC: \`document\` and \`entry\` (via mind_remember) are PRIVATE to the user's knowledge graph. \`feed_post\` (mind_remember) and mind_social create_thought are PUBLIC — they post to the user's social feed where everyone can see them. NEVER write to the public feed unless the user explicitly said "post", "share", "tweet", "feed", or "thought to my feed". Deploy logs, PR notes, work outcomes, and agent activity belong in \`entry\` — NEVER on the public feed.

═══ TOOL MAP — 44 tools ═══
MEMORY      mind_query (semantic search) · mind_remember (store / list / delete) · mind_context (load identity + rules) · mind_folders (organize documents) · mind_folder_routes / mind_folder_suggest (routing) · mind_share (document share links)
LIFE & WORK mind_life (goals, tasks, calendar — supports delete + bulk_delete) · mind_focuses (Focus → Project buckets) · mind_tasks (assignable, reportable work items) · mind_checklists (Kanon checklists — templates, runs, toggle, progress) · mind_automate (triggers + workflows) · mind_notify (notifications)
PEOPLE      mind_crm (contacts, pipeline stages, activity logging)
GRAPH       mind_graph (KG stats + health) · mind_insights (Autonomous Learning Engine patterns) · mind_sense (MINDsense emotional state) · mind_osint (Osiris OSINT analyst)
KNOWLEDGE   mind_research (autonomous deep-research jobs) · mind_train (teach the KG / save chats)
FRONT LAYER mind_list_templates · mind_get_template · mind_save_typed · mind_bootstrap_templates (16 structured document types: SOUL, IDENTITY, BELIEFS, USER, AGENTS, TOOLS, SENSES, SKILLS, BEHAVIOR, LESSON, DECISION, POLICY, …)
SOCIAL      mind_social (public feed posts, social feed, communities — ⚠️ posting writes to the user's PUBLIC feed) · mind_social_analytics · mind_profile (bio, prompts, model preferences) · mind_personas (Influencer Factory synthetic personas)
TRADER      mind_trader (TraderMIND: live feed · MIND Vision forecasts + history + per-bar scores · candles · cycles · calibration · engine health · save/star/like + undo · notes + feedback the engine learns from · full journal CRUD · personalized insights)
FLEET/ADMIN mind_agents (Agent Command Center — agent registry, heartbeat, probe; admin key) · mind_tickets (agent ticket queue — file / answer / triage / resolve; admin key) · mind_admin (user provisioning; admin key) · mind_accounts (own / switch / share multiple MINDs)
APPS        mind_mindmap (MIND Mind Map) · mind_moneymind (MoneyMIND personal finance) · mind_budget (13-week cash flow) · mind_sheets (Airtable-style tables) · mind_email (Email Manager, ⚠️ send is outward) · mind_sign (e-signature, ⚠️ send/resend are outward) · mind_invoices (Invoice Agent, ⚠️ invite is outward) · mind_books (MIND Books accounting) · mind_timer (Tempo time tracking) · mind_forms (Quill lead-capture forms) · mind_library (personal bookshelf)

Every tool's own description lists its exact actions and required parameters. For the full playbook — endpoint mapping, scopes, and common recipes — read the resource \`mind://integration-guide\`.`;

export const INTEGRATION_GUIDE = `# MIND — Complete Integration Guide

MIND is the persistent memory and knowledge-graph layer for AI agents. It stores
identity, memories, decisions, goals, tasks, contacts, and emotional context, and
makes them queryable across every session, tool, and agent — so an AI never starts
from zero.

This guide tells any agent exactly how to integrate, regardless of how it runs.

---

## 1. Choose your integration path

MIND meets your agent wherever it runs. There are three paths — pick the one that
matches your runtime. They all read and write the *same* knowledge graph.

| Your runtime | Path | How to connect |
|---|---|---|
| MCP host — Claude Code, Claude Desktop, Cursor, Windsurf, Zed, any MCP client | **MCP server** | Remote, no install: add \`https://www.m-i-n-d.ai/mcp\` as a custom connector and sign in via browser OAuth — or, if your host has no OAuth flow but lets you add a header, use the same URL with \`Authorization: Bearer mind_<key>\` and no OAuth at all. Prefer local stdio? \`npx -y --package=@astramindapp/mcp-server mind-mcp-setup\`, or add the server to your MCP config. You are reading this because you are already connected — just call the \`mind_*\` tools. |
| OpenClaw agent | **OpenClaw plugin** | \`openclaw plugins install @astramindapp/openclaw-mind\`. Do NOT install the MCP server for OpenClaw — OpenClaw consumes a plugin, not an MCP server, for its memory slot. The plugin exposes MIND as native OpenClaw tools. |
| Anything else — custom agent, backend service, script, n8n, automation | **REST API** | Call \`https://m-i-n-d.ai/developer/v1/*\` directly with header \`X-API-Key: <key>\`. Every MCP tool is a thin wrapper over one of these endpoints. |

All three paths are equivalent in capability. The MCP server and OpenClaw plugin
are convenience layers over the same \`/developer/v1\` REST API.

**No browser OAuth in your host? Use a key on the same URL.** Every host that
lets you add a custom MCP server with a header can use MIND with no OAuth and
no npm install: Server URL \`https://www.m-i-n-d.ai/mcp\`, header
\`Authorization: Bearer mind_<your key>\`. Mint a key at
https://www.m-i-n-d.ai → Settings → Developer → API Keys. Agents: if
\`AuthenticateMcpServer\` or the host's connect card fails, ask the user for a
MIND API key and rewire the same URL with that header — do not fall back to
the local npm server just because OAuth didn't work.

## 2. Authenticate

Every path needs a **MIND API key** — a string with the prefix \`mind_\`.

- Get a key: https://m-i-n-d.ai → Settings → Developer → API Keys.
- MCP server: set env var \`MIND_API_KEY\`. Optionally \`MIND_BASE_URL\` (defaults to the production host).
- REST: send it as the \`X-API-Key\` request header.
- Keys carry **scopes** (e.g. \`life:read\`, \`life:write\`, \`crm:write\`). A new key gets the full standard set. The admin tools \`mind_admin\`, \`mind_agents\`, and \`mind_tickets\` require an **admin-scoped** key.

## 3. Session protocol

Follow this every session — it is the difference between an agent with memory and
an agent that re-discovers the world each time.

1. **Start** — call \`mind_context\`. Loads identity, operating rules, current priorities, and recent activity.
2. **Before deciding or asserting** — call \`mind_query\` on the specific topic. MIND is the authoritative memory; never claim something does not exist without querying first.
3. **After completing non-trivial work** — call \`mind_remember\` to log the outcome (what worked, what didn't, decisions made). Tag it. Set \`source\` to your agent name.

## 4. The 44 tools

### Memory
- **mind_query** — semantic search across the knowledge graph. Returns RETRIEVED CONTEXT (documents, entries, entities, relationships) for YOU to synthesize — not a finished answer — and costs 0 credits. Pass \`retrieve_only=false\` to have MIND write the answer itself (spends credits). 5 search modes.
- **mind_remember** — store/manage content. Actions: create, search, get, list, delete. Types: **PRIVATE**: \`document\` (long-form research/specs), \`entry\` (medium-form observations/agent logs — DEFAULT). **PUBLIC**: \`feed_post\` (a social-media post on the user's public feed — NEVER use unless the user explicitly said "post", "share", "tweet", "feed", or "thought to my feed"; deploy logs and agent outcomes belong in \`entry\`). \`thought\` is a deprecated alias for \`feed_post\`.
- **mind_folders** — organize documents into folders. Actions: list, create, rename, move, delete, move_documents. Folders are a presentation layer — the graph still indexes every document regardless of folder. Typical flow: \`mind_remember\` create a document, then \`mind_folders\` move_documents to file it.
- **mind_share** — create and manage share links for one MIND document. Actions: create (default — mint a link, optionally scoped to a \`grantee_username\`, with \`expires_in_days\`/\`password\`), list (this document's links), list_all (every link across your documents), revoke.
- **mind_context** — load persistent identity, preferences, rules, priorities, recent activity as retrieved context (0 credits; YOU synthesize).

### Life & work
- **mind_life** — goals, projects, tasks, calendar events, productivity stats. Actions: list, create, update, complete, delete, **bulk_delete** (up to 200 ids in one call), move, get, calendar_*, stats.
- **mind_tasks** — site-wide assignable work items that attach to projects, contacts, or agents. Actions: list, create, get, update, complete, reopen, assign, delete, reports.
- **mind_automate** — scheduled workflows, event triggers, rules.
- **mind_notify** — read and manage notifications.

### People
- **mind_crm** — contacts, pipeline stages, activity logging, interaction history.

### Knowledge graph & intelligence
- **mind_graph** — KG statistics, diagnostics, label/entity breakdown, health.
- **mind_insights** — patterns surfaced by the Autonomous Learning Engine, weekly summaries.
- **mind_sense** — MINDsense emotional intelligence: the user's living emotional state, signal history, KG entity weights.
- **mind_research** — launch and manage autonomous deep-research jobs; findings land in the graph.
- **mind_train** — guided training sessions and chat-to-KG ingestion.

### Front Layer templates (structured documents)
- **mind_list_templates** / **mind_get_template** / **mind_save_typed** / **mind_bootstrap_templates** — the 16 typed-document templates (SOUL, IDENTITY, BELIEFS, USER, AGENTS, TOOLS, SENSES, SKILLS, BEHAVIOR, LESSON, DECISION, POLICY, and more) that give a MIND tenant a well-structured front layer.

### Social & profile
- **mind_social** — PUBLIC feed posts, social feed, communities. ⚠️ \`create_thought\` writes to the user's PUBLIC social feed — NEVER call unless the user explicitly said "post", "share", "tweet", "feed", or "thought to my feed". For private agent outcomes, use \`mind_remember\` with \`type=entry\` instead.
- **mind_profile** — bio, AI prompt settings, model preferences.

### Trading (TraderMIND)
- **mind_trader** — operate TraderMIND, the agentic trading engine. Read the engine: \`feed\` (live trade-idea feed) · \`forecast_latest\` / \`forecasts\` / \`bar_scores\` (MIND Vision forecasts — latest cone, resolved history, per-candle scores) · \`candles\` · \`cycles\` (regime / ideas / lessons) · \`health\` · \`calibration\` (the published honesty curve) · \`ai_journal\` (the trader's own narration). Act as the user: \`save\` / \`star\` / \`like\` / \`unsave\` · \`note\` / \`feedback\` (feedback reaches the engine's brain) · \`notes\` / \`interactions\` / \`counts\` (read back state + public social proof) · full journal CRUD (\`journal_list/create/get/update/delete\`) · \`insights\` (personalized, cached 15 min). Auth: engine reads plus \`counts\` are public — they work even with a missing or invalid key; only the act-as-you actions (save/star/like/unsave, note/feedback, notes, interactions, saved, journal_*, insights) authenticate as the key's owner. Saves, notes, feedback, and journal entries also land in the owner's MIND knowledge graph.

### Fleet & administration (admin key required)
- **mind_agents** — the **Agent Command Center**: the canonical registry of every agent in the fleet (running, planned, archived). Each agent is owned by a MIND account (\`owner_username\`). Actions: list (with \`list_query\` free-text search), get, create, update, delete, heartbeat, probe, log_activity, list_activities, import_from_mind, seed_known, set_status, set_current_job, transfer_owner, share, list_shares, revoke_share, plus invoice linking. Backed by \`/admin/agents\`.
- **mind_tickets** — the **agent ticket queue**: client feedback, critique, ideas, feature requests, and bugs filed against any agent. Actions: list, get, create, comment (answer a ticket), update (triage status/priority/kind/assignee), resolve, delete. \`agent_slug\` is required on every call. Backed by \`/admin/agents/{slug}/tickets\`.
- **mind_admin** — user provisioning + the **Featured Minds Portal**: full CRUD over featured minds with admin write-through to the linked \`user_profiles\` doc. Actions: \`create_user\`, \`list_users\`, \`update_user_tier\`, \`adjust_user_credits\`, \`create_featured_mind\`, \`list_featured_minds\`, \`get_featured_mind_full\` (bundled mind + owner profile + model catalog — what the portal side sheet loads), \`update_featured_mind\` (catalog fields: title / subtitle / description / tags / featured / display_order / is_public / avatar_url / banner_url / price), \`update_featured_mind_owner_profile\` (write-through to user_profiles: \`preferred_llm_model\`, \`public_mind_prompt\`, \`chat_temperature\`, \`chat_reasoning_effort\`, \`public_mind_enabled\`, \`public_mind_tagline\` / \`greeting\` / \`persona\`, \`bio\`, \`avatar_url\`, \`banner_url\` — changes hit /m/{username} immediately), \`reorder_featured_minds\` (bulk display_order via \`ordered_mind_ids\`), \`delete_featured_mind\`.
- **mind_accounts** — multi-MIND ownership: discover, create, and switch between MINDs; manage owners, viewers, and invitations.

### Full-coverage apps (v0.25.0)
- **mind_mindmap** — MIND Mind Map (m-i-n-d.ai/#/mind-map). Actions: list, get, create, update, delete, get_shared. Sharing, collaborators and AI generation from a prompt or project stay in the web app on purpose (JWT-only, human-only — see \`tests/test_mindmap_apikey_auth.py\`).
- **mind_moneymind** — MoneyMIND personal finance (m-i-n-d.ai/#/moneyMIND). Accounts, transactions, categories, budgets, recurring bills, net worth, goals, credit, alerts, bill negotiation, bank statements — 36 actions.
- **mind_budget** — 13-week cash-flow planner (m-i-n-d.ai/#/budget). Cells, rows, quarters, variance, roll-forward, statement autofill/build.
- **mind_sheets** — Airtable-style tables (m-i-n-d.ai/#/sheets). Tables, columns, rows, CSV export.
- **mind_email** — MIND Email Manager (m-i-n-d.ai/#/email). Inbox, threads, search, draft, ⚠️ send (outward), voice/tone preferences.
- **mind_checklists** — Kanon checklists (kanon.theastraway.com), attached to Life items or tasks. Templates + runs + toggle_item + progress rollups.
- **mind_sign** — MIND Sign e-signature (m-i-n-d.ai/#/mindsign). Envelopes, fields, ⚠️ send/resend (outward), void, audit, certificate.
- **mind_invoices** — Invoice Agent (m-i-n-d.ai/#/invoiceagent). Create/update invoices, ask questions about one, ⚠️ invite (outward), received invoices.
- **mind_books** — MIND Books accounting (m-i-n-d.ai/#/mind-books). Vendors, customers, accounts, bills, invoices overview.
- **mind_timer** — Tempo time tracking. Start/stop, manual entries, summaries.
- **mind_forms** — Quill lead-capture forms (m-i-n-d.ai/#/forms). Build forms, read submissions, public read by slug.
- **mind_library** — Personal bookshelf (m-i-n-d.ai/#/library). Authors, books, chapter content, AI reading companion.

Each tool's own MCP description is the source of truth for its exact action list
and required parameters — read it before calling.

## 5. REST endpoint mapping

If you integrate over REST, every tool maps to \`/developer/v1\`. Examples:

| Capability | Method + path |
|---|---|
| Query the graph | \`POST /developer/v1/query\` |
| List / create life items | \`GET\` / \`POST /developer/v1/life/items\` |
| Delete one life item | \`DELETE /developer/v1/life/items/{id}\` |
| Delete many life items | \`POST /developer/v1/life/items/bulk-delete\` (body: \`{"item_ids": [...]}\`) |
| CRM contacts | \`GET\` / \`POST /developer/v1/crm/contacts\` |
| Documents (PRIVATE) | \`/developer/v1/documents\` |
| Entries (PRIVATE) | \`/developer/v1/entries\` |
| Feed posts (PUBLIC) — personal CRUD | \`/developer/v1/thoughts\` — scope \`thoughts:read\` / \`thoughts:write\`. \`/feed_posts\` is a semantic alias mounted on the same handlers + collection (UI JWT path). |
| Feed posts (PUBLIC) — social layer | \`/developer/v1/social/thoughts\` (create / get / delete / like) + \`/developer/v1/social/feed\` (browse) — scope \`social:write\` / \`social:read\` |
| Folders | \`GET\` / \`POST /developer/v1/folders\`, \`PATCH\` / \`DELETE /developer/v1/folders/{id}\` |
| Move documents into a folder | \`POST /developer/v1/documents/move\` (body: \`{"doc_ids": [...], "folder_id": "..."}\`) |
| TraderMIND — latest MIND Vision forecast | \`GET /api/trader/forecasts/latest?symbol=ES\` (engine reads — \`/api/trader/forecasts\`, \`/candles\`, \`/cycles\`, \`/calibration\`, \`/health\`, \`/ai-journal\`, plus \`GET /api/mindtrades/feed\` and \`GET /api/trader/counts\` — are public; the act-as-you routes \`/interact\`, \`/note\`, \`/notes\`, \`/interactions\`, \`/saved\`, \`/journal\`, \`/insights\` need the user's key) |
| Agent Command Center | \`/admin/agents\` (admin key) |
| Agent ticket queue | \`/admin/agents/{slug}/tickets\` — \`GET\`/\`POST\`, \`/{ticket_id}\` \`GET\`/\`PATCH\`/\`DELETE\`, \`/{ticket_id}/comments\` \`POST\` (admin key) |
| **Featured Minds Portal** | \`/admin/featured-minds\` \`GET\`/\`POST\`, \`/admin/featured-minds/{id}\` \`PUT\`/\`DELETE\`, \`/admin/featured-minds/{id}/full\` \`GET\` (bundled view), \`/admin/featured-minds/{id}/owner-profile\` \`PUT\` (admin write-through to user_profiles: model, prompt, temperature, brand fields), \`/admin/featured-minds/reorder\` \`PUT\` (body: \`{"ordered_mind_ids": [...]}\`), \`/admin/featured-minds/{id}/upload\` \`POST\` (multipart: \`kind=avatar|banner\`, \`file\`) — all admin key |

## 6. Common recipes

- **Clear the life board** — \`mind_life\` action \`bulk_delete\` with every item id (list first, then pass the ids), or repeated for boards over 200 items.
- **Start a session right** — \`mind_context\`, then \`mind_query\` for anything you are about to act on.
- **Record an outcome** — \`mind_remember\` action \`create\`, type \`entry\`, with tags and your \`source\`.
- **File a document in a folder** — \`mind_folders\` action \`create\` to make the folder, \`mind_remember\` to create the document, then \`mind_folders\` action \`move_documents\` with the document id and the folder id. \`folder_id: "root"\` files at the top level.
- **Register / update an agent** — \`mind_agents\` (admin key) — \`create\` or \`update\`, then \`heartbeat\` from the agent runtime.
- **Handle agent tickets** — \`mind_tickets\` (admin key) — \`list\` an agent's queue, \`get\` a ticket with its thread, \`comment\` to answer, then \`resolve\`. \`agent_slug\` is required on every call.
- **Run the Featured Minds Portal from MCP** — \`mind_admin\` (admin key) — \`list_featured_minds\` to get every mind_id, \`get_featured_mind_full\` for a bundled view (featured_mind doc + owner profile + model catalog in one round-trip), \`update_featured_mind\` for catalog fields (title/tags/featured/display_order/is_public/avatar/banner/subtitle/price), \`update_featured_mind_owner_profile\` for chat-behavior fields (preferred_llm_model, public_mind_prompt, chat_temperature, chat_reasoning_effort, public_mind_tagline/greeting/persona, bio) — this write-through hits /m/{username} immediately, \`reorder_featured_minds\` for bulk display_order, \`delete_featured_mind\` to remove from the catalog (user's MIND is preserved).

## 7. Feed post endpoint surfaces (clarification)

A "feed post" is a public social-media-style post on the user's MIND feed. There are three endpoint surfaces, all backed by the **same** \`thoughts\` MongoDB collection — pick by what your key carries:

| Surface | Use when | Scope required |
|---|---|---|
| \`/developer/v1/thoughts\` (POST / GET / DELETE / search) | Personal feed post CRUD via a developer API key | \`thoughts:read\` / \`thoughts:write\` |
| \`/developer/v1/social/thoughts\` (POST / GET / DELETE / like) + \`/developer/v1/social/feed\` (browse) | Same create/delete + the social-feed read surface for browsing other users' posts, likes, repost flow | \`social:write\` (writes) / \`social:read\` (browse) |
| \`/feed_posts\` (POST / GET / DELETE + comments/likes/reposts) | Semantic alias for \`/thoughts\` — same UI JWT handlers under a clearer URL. Both paths share handlers and the MongoDB collection. | UI JWT |

There is no functional difference for create/delete between \`/thoughts\` and \`/social/thoughts\` — both insert into \`db.thoughts\`. Pick the surface that matches your auth path and the scope your key carries. **Whichever surface you write through, the post lands on the user's PUBLIC feed.** Follow the explicit-trigger rule in every tool description.

## 8. Brand & rules

The product is **MIND** by **Astra AI**. Never reference underlying libraries in
user-facing content — MIND is the brand. Treat MIND as the authoritative memory:
when the graph and local files disagree, reconcile explicitly rather than guessing.
`;
