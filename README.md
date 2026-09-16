# @astramindapp/mcp-server

**MIND MCP Server** — The most complete AI memory layer available. 44 tools, 384 actions.

Your AI agents forget everything between sessions. MIND fixes that. Connect any MCP-compatible agent to your personal knowledge graph — with emotional intelligence, CRM, life management, site-wide assignable tasks, social features, self-training, autonomous insights, an admin-only Agent Command Center with per-agent ticket queues, an admin-only **Featured Minds Portal** (curate the public marketplace at `m-i-n-d.ai` from any MCP client — model, public chat prompt, temperature, brand fields, write-through to the linked user's profile), and more.

**Self-describing.** Every connecting client receives a full integration briefing in the MCP `initialize` response, and can read the complete playbook from the `mind://integration-guide` resource — so any agent knows what MIND is, which integration path fits its runtime (MCP server / OpenClaw plugin / REST API), how to authenticate, and the session protocol, without being told.

## 44 Tools

| Tool | Actions | What It Does |
|------|---------|-------------|
| `mind_query` | 1 | Semantic search across your knowledge graph (5 search modes) |
| `mind_remember` | 5 | Store, search, get, list, delete — `document` & `entry` (PRIVATE), `feed_post` (PUBLIC, explicit user request only — `thought` kept as deprecated alias) |
| `mind_folders` | 7 | Organize documents into folders — list, create, rename, move, delete, file documents |
| `mind_folder_routes` | 4 | Configure deterministic system-folder routing — which folder each kind of system-generated doc (life items, CRM, chat saves, tasks, training, trader signals, cloud imports) is filed into automatically |
| `mind_folder_suggest` | 1 | Ask MIND which folder a piece of content belongs in, via its routing_hint + a cheap LLM picker |
| `mind_share` | 4 | Create and manage share links for one MIND document — create (default), list, list_all, revoke |
| `mind_context` | 1 | Load persistent identity, preferences, rules, priorities, recent activity |
| `mind_life` | 16 | Goals, projects, tasks + full calendar management + productivity stats |
| `mind_focuses` | 5 | Focus → Project buckets — the top-level groupings above Life Projects |
| `mind_crm` | 7 | Contacts, pipeline, activity logging, interaction history |
| `mind_tasks` | 9 | Site-wide tasks — assignable, completable work items on projects, contacts, or agents, plus completion reports |
| `mind_graph` | 3 | Graph stats, diagnostics, entity labels |
| `mind_admin` | 11 | **Admin-only.** User provisioning + the **Featured Minds Portal**: full CRUD over the public marketplace (get_full / update / update_owner_profile / reorder / delete), tier/credit management |
| `mind_sense` | 7 | MINDsense emotional intelligence — state, signals, timeline, KG weights, spikes |
| `mind_osint` | 7 | Operate Ozzie — the autonomous OSINT analyst — for cited intelligence dossiers on a domain/IP/org/person, plus live-feed alerts and watchlists |
| `mind_research` | 3 | Launch autonomous deep research jobs |
| `mind_train` | 7 | Self-training sessions + save chats to knowledge graph |
| `mind_social` | 14 | Public feed posts, social feed, communities, likes, comments — ⚠️ posting writes to the user's PUBLIC feed, only call on explicit user request |
| `mind_social_analytics` | 6 | YouTube/LinkedIn/X/Twitch channel stats, recent video performance, retention/traffic/sentiment, goal progress |
| `mind_profile` | 9 | Profile, custom system prompts, LLM model selection |
| `mind_trader` | 25 | TraderMIND — the agentic trading engine: live feed, MIND Vision forecasts (latest cone + resolved history + per-bar scores), candles, cycles, calibration honesty curve, engine health, save/star/like + undo, notes + structured feedback the engine learns from, full trading-journal CRUD, personalized insights. Engine reads + counts are public (work even with no/invalid key); only the act-as-you actions authenticate as the key's owner |
| `mind_insights` | 7 | Autonomous Learning Engine insights, weekly summaries, feedback |
| `mind_automate` | 6 | Scheduled automations, event triggers, execution history |
| `mind_notify` | 4 | Notifications, mark read, stats |
| `mind_agents` | 25 | **Admin-only.** Agent Command Center — list/search/get/create/update/delete agents, heartbeats, probes, activity log, import from MIND, seed canonical fleet, link invoices, transfer ownership + share agents with other accounts |
| `mind_tickets` | 7 | **Admin-only.** Agent ticket queue — file, view, answer (comment), triage, resolve, and delete client feedback / bugs / ideas on any agent |
| `mind_personas` | 17 | **Admin-only.** Influencer Factory Command Center — synthetic-persona CRUD, face anchor + variants, ElevenLabs voice, per-platform bios, Blotato account registration |
| `mind_accounts` | 6 | Multi-MIND accounts — list MINDs you can access, create new ones, delete MINDs you own, manage owners/viewers, send email invitations |
| `mind_list_templates` | 1 | List the 16 Front Layer typed-document templates |
| `mind_get_template` | 1 | Fetch the full spec for one Front Layer template |
| `mind_save_typed` | 1 | Save a filled-out Front Layer document with its type tag |
| `mind_bootstrap_templates` | 1 | Seed all 16 Front Layer templates into a MIND tenant |
| `mind_mindmap` | 6 | MIND Mind Map (m-i-n-d.ai/#/mind-map) — visual canvases: list/get/create/update/delete, read a public shared map. Sharing, collaborators and AI generation from a prompt/project stay in the web app (JWT-only, human-only) |
| `mind_moneymind` | 37 | MoneyMIND (m-i-n-d.ai/#/moneyMIND) — accounts, transactions + splits + rules, budgets, recurring bills, net worth, savings goals, credit, alerts, bill negotiation, bank statements |
| `mind_budget` | 19 | 13-week cash-flow planner (m-i-n-d.ai/#/budget) — cells, rows, quarters, variance, roll-forward, autofill/build from bank statements |
| `mind_sheets` | 14 | Airtable-style tables (m-i-n-d.ai/#/sheets) — tables, columns, rows, CSV export |
| `mind_email` | 14 | MIND Email Manager (m-i-n-d.ai/#/email) — inbox, threads, search, AI draft, ⚠️ send (outward), voice/tone preferences |
| `mind_checklists` | 13 | Kanon checklists (kanon.theastraway.com) attached to Life items or tasks — templates, runs, toggle_item, progress rollups |
| `mind_sign` | 12 | MIND Sign e-signature (m-i-n-d.ai/#/mindsign) — envelopes, fields, ⚠️ send/resend (outward), void, audit, certificate |
| `mind_invoices` | 9 | Invoice Agent (m-i-n-d.ai/#/invoiceagent) — create/update, ask a question about an invoice, ⚠️ invite (outward), received invoices |
| `mind_books` | 9 | MIND Books accounting (m-i-n-d.ai/#/mind-books) — vendors, customers, chart of accounts, bills, invoices overview |
| `mind_timer` | 8 | Tempo time tracking — start/stop, manual entries, summaries |
| `mind_forms` | 7 | Quill lead-capture forms (m-i-n-d.ai/#/forms) — build, read submissions, public read by slug |
| `mind_library` | 8 | Personal bookshelf (m-i-n-d.ai/#/library) — authors, books, chapter content, AI reading companion |

## Quick Start

### Fastest: one-paste remote connect (Claude Code / Claude Desktop / claude.ai)

No install, no API key handling — paste one command, click **Connect** in the
browser, done:

```bash
claude mcp add --transport http mind https://www.m-i-n-d.ai/mcp
```

Claude opens the m-i-n-d.ai consent page, you click **Connect**, and MIND is
live. Auth, key minting, and refresh are all handled by OAuth.

### No browser OAuth in your host? Use a key on the same URL

Every host that lets you add a custom MCP server with a header can use MIND
with no OAuth and no npm install: same remote server URL, just swap in a key.

- **Server URL**: `https://www.m-i-n-d.ai/mcp`
- **Header**: `Authorization: Bearer mind_<your key>`
- **Mint a key**: https://www.m-i-n-d.ai → Settings → Developer → API Keys

Agents: if `AuthenticateMcpServer` or the host's connect card fails, ask the
user for a MIND API key and rewire the same URL with that header — do not
fall back to the local npm server just because OAuth didn't work.

### Local stdio install: browser-connect setup wizard

For tools that run MCP servers locally (Claude Desktop, Cursor, Windsurf,
VS Code Copilot), run the setup wizard — it opens your browser, you click
**Connect** on m-i-n-d.ai, and it receives your API key automatically and
writes every tool config for you:

```bash
npx -y --package=@astramindapp/mcp-server mind-mcp-setup
```

No manual key copying. The wizard auto-detects your installed AI tools and
configures each one.

### Manual alternative: paste an API key

If you'd rather mint a key yourself: sign up at
[www.m-i-n-d.ai](https://www.m-i-n-d.ai) → Settings → Developer → Create API Key, then:

```bash
npx -y --package=@astramindapp/mcp-server mind-mcp-setup --key mind_xxx
```

or install globally and configure by hand:

```bash
npm install -g @astramindapp/mcp-server
```

#### Claude Code (local stdio with a manual key)

```bash
claude mcp add mind -- env MIND_API_KEY=mind_xxx mind-mcp
```

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mind": {
      "command": "mind-mcp",
      "env": {
        "MIND_API_KEY": "mind_your_key_here"
      }
    }
  }
}
```

The config file lives at `~/Library/Application Support/Claude/claude_desktop_config.json`
on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows. Fully quit and
reopen Claude Desktop after editing — it only reads this file on launch.

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mind": {
      "command": "mind-mcp",
      "env": {
        "MIND_API_KEY": "mind_your_key_here"
      }
    }
  }
}
```

#### Any MCP-Compatible Agent

The server works with any tool that supports Model Context Protocol — Claude, GPT, Gemini, Llama, or any future model.

## How It Works

```
Your AI Agent  <-->  MCP Protocol  <-->  MIND MCP Server  <-->  Personal Knowledge Graph
                                                                  |
                                                           Emotional Intelligence
                                                           Autonomous Learning
                                                           CRM + Life + Social
```

1. Agent calls `mind_context` at session start → loads identity, rules, priorities
2. Agent calls `mind_query` before decisions → retrieves relevant memories
3. Agent calls `mind_remember` after tasks → stores outcomes and learnings
4. Agent calls `mind_sense` → reads user's emotional state to adapt responses
5. Agent calls `mind_insights` → surfaces autonomous pattern detection
6. Next session, any agent has full context. Knowledge compounds.

## What Makes MIND Different

### vs. Flat File Memory (MEMORY.md)

| | Flat Files | MIND |
|---|---|---|
| Size | ~20K chars, truncated | Unlimited knowledge graph |
| Retrieval | Loads everything every turn | Only relevant memories via semantic search |
| Structure | Unstructured text | Graph with entities, relationships, and emotional weights |
| Cross-agent | One tool only | Shared across all AI agents |
| Intelligence | None | Autonomous pattern detection + emotional encoding |

### vs. Other MCP Memory Servers

| | Anthropic Official | Mem0 | Graphiti/Zep | MIND |
|---|---|---|---|---|
| Tools | 8 | 4 | 9 | **24** |
| Knowledge graph | Basic (JSON) | No (vectors) | Yes (Neo4j) | **Yes (per-user MIND graph)** |
| Emotional intelligence | No | No | No | **Yes (patent-pending)** |
| CRM | No | No | No | **Yes** |
| Life management | No | No | No | **Yes** |
| Social features | No | No | No | **Yes** |
| Self-training | No | No | No | **Yes** |
| Research agent | No | No | No | **Yes** |
| Automations | No | No | No | **Yes** |
| Mobile app | No | No | No | **Yes** |

## Tool Reference

### `mind_query` — Search Your Knowledge Graph

```
query: "What did I decide about the authentication approach?"
mode: "hybrid"  // hybrid (default), mix, global, local, naive
```

Returns RETRIEVED CONTEXT from your stored documents, entries, and feed posts with source attribution — raw graph context for the calling model to synthesize, not a finished answer. Uses no MIND LLM and costs 0 credits. Pass `retrieve_only=false` for a MIND-written answer (spends credits).

### `mind_remember` — Store & Manage Content

| Action | Description |
|--------|-------------|
| `create` | Store content. **PRIVATE**: `document`, `entry` (default). **PUBLIC**: `feed_post` — writes to the user's public social feed, NEVER use unless the user explicitly said "post", "share", "tweet", "feed", or "thought to my feed". (`thought` is a deprecated alias for `feed_post`.) |
| `delete` | Remove by ID |
| `search` | Find entries / feed posts by query |
| `get` | Retrieve specific item by ID |
| `list` | Paginated listing of all content |

### `mind_folders` — Organize Documents into Folders

Folders are a presentation layer over the document tray — the knowledge graph still indexes and retrieves across every document regardless of folder.

| Action | Description |
|--------|-------------|
| `list` | All folders, each with its document count |
| `create` | Create a folder (optionally nested under a parent) |
| `rename` | Change a folder's name |
| `move` | Re-nest a folder under a different parent |
| `delete` | Remove a folder — its documents and subfolders move up a level; nothing is deleted |
| `move_documents` | File one or more documents into a folder |

### `mind_context` — Load Persistent Context

Loads five structured sections at session start:
- **Soul** — Core identity, mission, personality
- **User** — Who the user is, their role, preferences
- **Rules** — Operating constraints, behavioral guidelines
- **Priorities** — Current goals, active projects, deadlines
- **Recent** — Latest activity, outcomes, decisions

### `mind_life` — Life Management + Calendar

| Action | Description |
|--------|-------------|
| `list`, `create`, `update`, `complete`, `delete`, `move`, `get` | Full task/goal CRUD |
| `bulk_delete` | Delete up to 200 life items in one call (`item_ids` array) |
| `calendar_list`, `calendar_create`, `calendar_update`, `calendar_delete` | Calendar events |
| `stats` | Productivity metrics and completion rates |

### `mind_crm` — Contact Relationship Management

| Action | Description |
|--------|-------------|
| `list`, `create`, `update`, `delete`, `get` | Contact CRUD with pipeline stages |
| `log_activity` | Record calls, emails, meetings, notes |
| `list_activities` | View interaction history |

### `mind_tasks` — Site-Wide Tasks

Assignable, completable, reportable work items. A task can attach to a Life
project (`parent_type: "life_item"`), a CRM contact (`"contact"`), an agent
(`"agent"`), or stand alone. Assign tasks to a MIND member, an agent, or an
external email address.

| Action | Description |
|--------|-------------|
| `list` | List/filter tasks by status, priority, parent, assignee, or overdue |
| `create` | Create a task — attach to a project/contact/agent, assign, set a due date |
| `get`, `update`, `delete` | Task CRUD |
| `complete`, `reopen` | Mark a task done or reopen it |
| `assign` | (Re)assign to a member/agent/external; optionally fire the agent |
| `reports` | Completion analytics — counts, overdue, by-assignee, 8-week throughput |

```js
mind_tasks({ action: "create", title: "Follow up with Acme",
             parent_type: "contact", parent_id: "<contact_id>",
             assignee_type: "agent", assignee_id: "fundraising-agent",
             dispatch_agent: true, due_date: "2026-06-01" })

mind_tasks({ action: "reports" })
```

### `mind_sense` — MINDsense Emotional Intelligence

| Action | Description |
|--------|-------------|
| `state` | Current emotional state (valence, arousal, trend, sensitivity) |
| `signals` | Recent emotional signals with strength and source |
| `timeline` | Historical emotional data |
| `kg_weights` | Entities weighted by emotional significance |
| `spikes` | Detected emotional spikes |
| `acknowledge` | Mark a spike as acknowledged |
| `summary` | AI-generated emotional summary |

### `mind_research` — Autonomous Research

| Action | Description |
|--------|-------------|
| `start` | Launch a deep research job on any topic |
| `status` | Check job progress |
| `list` | View all research jobs |

### `mind_train` — Self-Training

| Action | Description |
|--------|-------------|
| `start` | Begin guided training (basics, network, expertise, history, goals, freeform) |
| `chat` | Send training message |
| `status`, `list_sessions`, `pause`, `resume` | Session management |
| `save_chat` | Save any chat conversation into the knowledge graph |

### `mind_social` — Social Layer

| Action | Description |
|--------|-------------|
| `create_thought`, `get_thought`, `delete_thought`, `like_thought` | Public feed post management — ⚠️ `create_thought` writes to the user's PUBLIC feed, only call on explicit user request (see tool description) |
| `feed`, `user_feed`, `search_feed` | Social feed browsing |
| `create_community`, `list_communities`, `get_community` | Community management |
| `join_community`, `leave_community` | Membership |
| `create_post`, `list_posts` | Community posts |

### `mind_profile` — Profile & Preferences

| Action | Description |
|--------|-------------|
| `get`, `update` | Profile management |
| `get_chat_prompt`, `set_chat_prompt` | Custom chat system prompt |
| `get_thought_prompt`, `set_thought_prompt` | Custom feed-post generation prompt (used when the user asks MIND to draft a post) |
| `get_model`, `set_model`, `list_models` | LLM model selection (50+ models) |

### `mind_insights` — Autonomous Learning Engine

| Action | Description |
|--------|-------------|
| `list` | Recent pattern-detected insights |
| `unread_count` | Count of unseen insights |
| `view`, `feedback` | Mark seen, rate helpfulness |
| `analyze` | Trigger on-demand analysis |
| `weekly_summary` | Weekly intelligence summary |
| `context` | ALE context data |

### `mind_automate` — Automations

| Action | Description |
|--------|-------------|
| `list`, `create`, `update`, `delete` | Automation CRUD |
| `run_now` | Trigger immediately |
| `history` | Execution log |

### `mind_notify` — Notifications

| Action | Description |
|--------|-------------|
| `list` | View all notifications |
| `mark_read`, `mark_all_read` | Read management |
| `stats` | Notification overview |

### `mind_admin` — Administration & Featured Minds Portal

Requires an admin-scoped MIND API key. Powers everything at `https://m-i-n-d.ai/#/admin/featuredmindsportal` — the same surface any MCP client (Claude Code, Cursor, Windsurf, n8n via MCP, custom agents) can drive end-to-end.

#### User provisioning + tier/credits
| Action | Description |
|--------|-------------|
| `create_user` | Provision new MIND account; optionally generate an API key |
| `list_users` | List users with analytics, filterable by activity window and `source` tenant |
| `update_user_tier` | Change subscription tier (free / pro / enterprise) |
| `adjust_user_credits` | Add (+) or deduct (–) credits |

#### Featured Minds Portal — full CRUD
The catalog (`featured_minds` collection) and the linked owner profile (`user_profiles`) edited together so changes hit `https://m-i-n-d.ai/m/{username}` immediately.

| Action | Description |
|--------|-------------|
| `create_featured_mind` | Promote a user's MIND into the featured catalog |
| `list_featured_minds` | List every featured mind with `mind_id`, `display_order`, `featured`, `is_public` |
| `get_featured_mind_full` | Bundled view in one round-trip: featured_mind doc + linked user_profile + available_models catalog (what the portal side sheet loads) |
| `update_featured_mind` | Catalog fields: `title`, `subtitle`, `description`, `tags`, `featured`, `display_order`, `is_public`, `avatar_url`, `banner_url`, `price` |
| `update_featured_mind_owner_profile` | **Write-through to user_profiles** for the linked user: `preferred_llm_model`, `public_mind_prompt` (≤3000 chars), `chat_temperature` (0.0–2.0), `chat_reasoning_effort` (minimal/low/medium/high, thinking models only), `public_mind_enabled`, `public_mind_tagline`/`greeting`/`persona`, `bio`, `avatar_url`, `banner_url`. Pass `null` on `preferred_llm_model` to clear and fall back to platform default. |
| `reorder_featured_minds` | Bulk display_order via `ordered_mind_ids: string[]` — index in list becomes the order. Idempotent. |
| `delete_featured_mind` | Remove from catalog. The user's underlying MIND is preserved. |

##### Recipe — change a featured MIND's model + prompt from MCP
```
mind_admin({ action: "list_featured_minds" })
// → grab the mind_id you want

mind_admin({ action: "get_featured_mind_full", mind_id: "<id>" })
// → see current owner_profile + the full available_models catalog

mind_admin({
  action: "update_featured_mind_owner_profile",
  mind_id: "<id>",
  preferred_llm_model: "anthropic/claude-sonnet-4.6",
  chat_temperature: 0.7,
  public_mind_prompt: "You are Anthony's public MIND. Answer in his voice."
})
// → next anonymous chat at /m/{username} uses the new model + prompt + temp
```

### `mind_agents` — Agent Command Center (Admin)

Canonical registry of every agent across the workspace fleet — running on a VPS, planned, archived. Solves the recurring "every Claude Code session re-discovers my agents from scratch" problem. Backed by `/admin/agents` on the MIND backend. Requires an admin API key.

| Action | Description |
|--------|-------------|
| `list` | List/search agents with filters (`list_status`, `list_host`, `list_tag`, `list_query` free-text) and a fleet-wide stats payload |
| `get` | Detail for one agent + last 20 activities inline |
| `create` | Register a new agent record (slug must be unique) |
| `update` | Partial update — name, description, status, cadence, host, responsibilities, etc. |
| `delete` | Soft-archive (default) or `hard=true` to permanently remove |
| `heartbeat` | Push a heartbeat from the agent's runtime (updates `last_heartbeat` + `current_job`) |
| `probe` | Active liveness probe (HTTP `health_url` or OpenClaw gateway) — logs result as activity |
| `log_activity` | Append a manual activity entry (notes, status changes, errors) |
| `list_activities` | Paginated activity history for one agent |
| `set_status` | Shortcut update — flip status to running/paused/planned/archived/error |
| `set_current_job` | Shortcut update — record what the agent is doing right now |
| `import_from_mind` | Enrich agent records from MIND `agent-identity` documents |
| `seed_known` | Idempotent upsert of the canonical seed list (additive; `overwrite=true` to reset) |
| `transfer_owner` | Move the agent to another MIND account's board (`owner_username` — the account must exist) |
| `share` | Grant another account access — `grantee_username` + `share_role` (`owner` = full control, `viewer` = read-only) |
| `list_shares` | List every account the agent is shared with |
| `revoke_share` | Drop a share grant by `share_id` (from `list_shares`) |

```typescript
// Before scaffolding a new agent — check what exists
mind_agents({ action: "list" })

// After non-trivial work — keep the registry honest
mind_agents({
  action: "heartbeat",
  slug: "social-media-manager",
  current_job: "drafting LinkedIn carousel for Friday"
})

// Promote a planned agent to running
mind_agents({ action: "set_status", slug: "audit-agent", status: "running" })

// Hand an agent to a teammate's board, or share it read-only
mind_agents({ action: "transfer_owner", slug: "audit-agent", owner_username: "jane" })
mind_agents({ action: "share", slug: "audit-agent", grantee_username: "sam", share_role: "viewer" })
```

```typescript
// Search the fleet by free text — slug, name, description, or tags
mind_agents({ action: "list", list_query: "atlas" })
```

UI: visit `https://m-i-n-d.ai/agents` (admin-only) to browse the fleet visually.

### `mind_tickets` — Agent Ticket Queue (Admin)

Every agent in the Command Center carries a ticket queue — client feedback, critique, ideas, feature requests, and bugs. A consulting client an agent is shared with files tickets; the agent's owner triages and resolves them. Every ticket auto-assigns to the **Ernie** triage agent and mirrors into MIND Life as a task. Backed by `/admin/agents/{slug}/tickets`. Requires an admin API key. `agent_slug` is required on every call.

| Action | Description |
|--------|-------------|
| `list` | Every ticket on an agent + open/total stats; optional `status` filter |
| `get` | One ticket plus its full comment thread |
| `create` | File a new ticket (`title` required; `kind`, `body`, `priority` optional) |
| `comment` | Answer a ticket — add a reply to its comment thread (`body` = the reply) |
| `update` | Triage — change `status`, `priority`, `kind`, or reassign (`assignee`) |
| `resolve` | Shortcut — mark the ticket `resolved` |
| `delete` | Remove the ticket, its comments, and its mirrored Life task |

`kind`: `feedback` · `critique` · `idea` · `feature` · `bug`
`status`: `open` → `triaged` → `in_progress` → `resolved` → `closed`
`priority`: `low` · `medium` · `high` · `urgent`

```typescript
// File a bug against an agent
mind_tickets({ action: "create", agent_slug: "social-media-manager",
               kind: "bug", priority: "high",
               title: "Carousel export drops the last slide",
               body: "Repro: 7-slide deck exports as 6." })

// Answer it, then resolve it
mind_tickets({ action: "comment", agent_slug: "social-media-manager",
               ticket_id: "<id>", body: "Fixed in the export batch size — verified." })
mind_tickets({ action: "resolve", agent_slug: "social-media-manager", ticket_id: "<id>" })
```

### `mind_accounts` — Multi-MIND Accounts

A "MIND" is a knowledge-graph account. One person can own — or be granted access to — many MINDs (work, research, a client's, a shared team MIND) and switch between them. This tool lets an agent discover and manage them. Backed by `/developer/v1/accounts` on the MIND backend.

| Action | Description |
|--------|-------------|
| `list` | Every MIND your API key's owner can access, with role (owner/viewer) and which is active |
| `create` | Spin up a brand-new MIND you own (pass `label`) |
| `delete` | Permanently delete a MIND you own — account, grants, and invitations (pass `mind_username`) |
| `members` | Owners, viewers, and pending invitations of a MIND you own (pass `mind_username`) |
| `grant` | Give an existing MINDapp user owner/viewer access (`mind_username`, `grantee_username`, `role`) |
| `invite` | Email an invitation to co-own or view a MIND (`mind_username`, `email`, `role`) |

```typescript
// Discover every MIND you can reach
mind_accounts({ action: "list" })

// Create a dedicated MIND for a new workstream
mind_accounts({ action: "create", label: "Acme Corp Research" })

// Grant a teammate read-only access
mind_accounts({
  action: "grant",
  mind_username: "acme_research_a1b2c3",
  grantee_username: "teammate",
  role: "viewer"
})
```

Note: owner = full access, viewer = read-only. Requires `MULTI_MIND_ACCOUNTS_ENABLED` on the MIND backend; `list` returns `enabled: false` when the feature is off.

## Partner Integration

Partner apps can programmatically create MIND accounts using partner keys:

```bash
curl -X POST https://m-i-n-d.ai/admin/users/create \
  -H "X-API-Key: mind_partner_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "user@app.com",
    "password": "securepassword",
    "generate_api_key": true
  }'
```

Returns a JWT + permanent API key. Your app stores the API key and uses it for all subsequent MCP/API calls on behalf of that user.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MIND_API_KEY` | Yes | — | Your MIND Developer API key |
| `MIND_BASE_URL` | No | `https://www.m-i-n-d.ai` | MIND API base URL |

## Programmatic Usage

```typescript
import { createMindMcpServer, MindClient } from "@astramindapp/mcp-server";

const client = new MindClient({
  baseUrl: "https://www.m-i-n-d.ai",
  apiKey: "mind_xxx",
});

const server = createMindMcpServer(client);
// Connect to any MCP transport
```

## Patents

MIND's core technology — including emotion-weighted knowledge graph encoding
and cross-agent persistent memory via the Model Context Protocol — is the
subject of pending patent applications. Patents pending.

## Troubleshooting

- **"Connect" opened the MIND website instead of connecting** — this was a bug in the
  non-www endpoint, fixed July 2026. Use `https://www.m-i-n-d.ai/mcp` (with the `www`)
  and retry.
- **No "Connectors" option in my tool** — use the Claude Code one-liner above if you're
  on Claude Code, or the local npm install (`npm install -g @astramindapp/mcp-server`)
  for any other MCP-compatible tool.
- **`npx` says "could not determine executable to run" / hangs** — `npx -y <pkg>` only
  runs the bin named after the package's last path segment (`mcp-server`), so
  `npx -y @astramindapp/mcp-server` alone fails, and adding `@latest` plus a trailing
  `mind-mcp-setup` just passes it as an *argument* instead of selecting that bin — use
  `npx -y --package=@astramindapp/mcp-server mind-mcp-setup` (or `mind-mcp`), which works on
  every version, or install globally first (`npm install -g @astramindapp/mcp-server`).
- **I have multiple MIND accounts** — add the connector once per account under a
  different name (e.g. `mind-personal`, `mind-work`); each Connect click lets you pick
  the account on the consent screen.

## Links

- **Website**: [www.m-i-n-d.ai](https://www.m-i-n-d.ai)
- **GitHub**: [theastraway/mind-mcp-server](https://github.com/theastraway/mind-mcp-server)
- **npm**: [@astramindapp/mcp-server](https://www.npmjs.com/package/@astramindapp/mcp-server)
- **MCP Docs**: [m-i-n-d.ai/mcp.html](https://www.m-i-n-d.ai/mcp.html)

## License

MIT — Astra AI, Inc.
