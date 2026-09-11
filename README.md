# @astramindapp/mcp-server

**MIND MCP Server** — The most complete AI memory layer available. 31 tools, 208 actions.

Your AI agents forget everything between sessions. MIND fixes that. Connect any MCP-compatible agent to your personal knowledge graph — with emotional intelligence, CRM, life management, social features, self-training, autonomous insights, and more.

## 31 Tools

| Tool | Actions | What It Does |
|------|---------|-------------|
| `mind_query` | 1 | Semantic search across your knowledge graph (5 search modes) |
| `mind_remember` | 5 | Store, search, get, list, delete — documents, entries, thoughts |
| `mind_context` | 1 | Load persistent identity, preferences, rules, priorities, recent activity |
| `mind_focuses` | 5 | Top-level Focus buckets that group Life projects |
| `mind_life` | 16 | Focus → Project → Outcome hierarchy + calendar + cross-account sharing + stats |
| `mind_tasks` | 9 | Assignable, completable, reportable work items on Life/CRM/agents or standalone |
| `mind_checklists` | 9 | Task-level checklists — templates, phase-bucketed steps, completion tracking |
| `mind_crm` | 7 | Contacts, pipeline, activity logging, interaction history |
| `mind_graph` | 3 | Graph stats, diagnostics, entity labels |
| `mind_admin` | 11 | User provisioning, Featured Minds Portal, tier/credit management (admin-only) |
| `mind_sense` | 7 | MINDsense emotional intelligence — state, signals, timeline, KG weights, spikes |
| `mind_research` | 3 | Launch and track autonomous deep research jobs |
| `mind_train` | 7 | Self-training sessions + save chats to knowledge graph |
| `mind_social` | 14 | Thoughts (posts), social feed, communities, likes, comments |
| `mind_profile` | 9 | Profile, custom system prompts, LLM model selection |
| `mind_insights` | 7 | Autonomous Learning Engine insights, weekly summaries, feedback |
| `mind_automate` | 6 | Scheduled automations, event triggers, execution history |
| `mind_notify` | 4 | Notifications, mark read, stats |
| `mind_folders` | 7 | Organize documents into folders (a presentation layer over the graph) |
| `mind_folder_routes` | 4 | Deterministic system-folder routing for auto-filed docs |
| `mind_folder_suggest` | 1 | Ask MIND which folder a piece of content belongs in |
| `mind_list_templates` | 1 | List the 16 MIND Front Layer template types |
| `mind_get_template` | 1 | Fetch the full markdown spec for one Front Layer template |
| `mind_save_typed` | 1 | Save a filled Front Layer document with its type tag |
| `mind_bootstrap_templates` | 1 | Seed all 16 Front Layer templates into a tenant |
| `mind_agents` | 25 | Admin-only Agent Command Center — registry, status, invoices, workflows |
| `mind_tickets` | 7 | Agent ticket queue — file, triage, resolve client feedback/bugs |
| `mind_accounts` | 6 | Manage multi-MIND accounts — list, create, delete, members, grant, invite |
| `mind_social_analytics` | 6 | YouTube/LinkedIn/X/Twitch channel analytics from the Social Dashboard |
| `mind_personas` | 17 | Influencer Factory Command Center — synthetic personas across Blotato platforms (admin-only) |
| `mind_osint` | 7 | Operate Ozzie, the autonomous OSINT analyst — investigate targets, monitors, watchlists |

## Quick Start

### 1. Get a MIND API Key

Sign up at [m-i-n-d.ai](https://m-i-n-d.ai) → Settings → Developer → Create API Key

### 2. Install

No install needed — run it directly with `npx`:

```bash
npx -y @astramindapp/mcp-server
```

If your MCP client resolves the bin by package name instead (or you want the
explicit form), you can also run:

```bash
npx -y --package=@astramindapp/mcp-server mind-mcp
```

Prefer a global install? That works too:

```bash
npm install -g @astramindapp/mcp-server
```

### 3. Configure Your AI Tool

#### Claude Code

```bash
claude mcp add mind -- env MIND_API_KEY=mind_xxx npx -y @astramindapp/mcp-server
```

Or, using the explicit package+bin form:

```bash
claude mcp add mind -- env MIND_API_KEY=mind_xxx npx -y --package=@astramindapp/mcp-server mind-mcp
```

If you installed globally (`npm install -g @astramindapp/mcp-server`), you can use the bin directly instead: `mind-mcp`.

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mind": {
      "command": "npx",
      "args": ["-y", "@astramindapp/mcp-server"],
      "env": {
        "MIND_API_KEY": "mind_your_key_here"
      }
    }
  }
}
```

Explicit package+bin form (equivalent):

```json
{
  "mcpServers": {
    "mind": {
      "command": "npx",
      "args": ["-y", "--package=@astramindapp/mcp-server", "mind-mcp"],
      "env": {
        "MIND_API_KEY": "mind_your_key_here"
      }
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mind": {
      "command": "npx",
      "args": ["-y", "@astramindapp/mcp-server"],
      "env": {
        "MIND_API_KEY": "mind_your_key_here"
      }
    }
  }
}
```

Explicit package+bin form (equivalent):

```json
{
  "mcpServers": {
    "mind": {
      "command": "npx",
      "args": ["-y", "--package=@astramindapp/mcp-server", "mind-mcp"],
      "env": {
        "MIND_API_KEY": "mind_your_key_here"
      }
    }
  }
}
```

#### Windsurf

Add to your Windsurf MCP config (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "mind": {
      "command": "npx",
      "args": ["-y", "@astramindapp/mcp-server"],
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
| Tools | 8 | 4 | 9 | **15** |
| Knowledge graph | Basic (JSON) | No (vectors) | Yes (Neo4j) | **Yes (native graph)** |
| Emotional intelligence | No | No | No | **Yes (patented)** |
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

Returns an AI-synthesized answer from your stored documents, entries, and thoughts with source attribution.

### `mind_remember` — Store & Manage Content

| Action | Description |
|--------|-------------|
| `create` | Store content (auto-categorized as document, entry, or thought) |
| `delete` | Remove by ID |
| `search` | Find entries/thoughts by query |
| `get` | Retrieve specific item by ID |
| `list` | Paginated listing of all content |

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
| `calendar_list`, `calendar_create`, `calendar_update`, `calendar_delete` | Calendar events |
| `stats` | Productivity metrics and completion rates |

### `mind_crm` — Contact Relationship Management

| Action | Description |
|--------|-------------|
| `list`, `create`, `update`, `delete`, `get` | Contact CRUD with pipeline stages |
| `log_activity` | Record calls, emails, meetings, notes |
| `list_activities` | View interaction history |

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
| `create_thought`, `get_thought`, `delete_thought`, `like_thought` | Thought (post) management |
| `feed`, `user_feed`, `search_feed` | Social feed browsing |
| `create_community`, `list_communities`, `get_community` | Community management |
| `join_community`, `leave_community` | Membership |
| `create_post`, `list_posts` | Community posts |

### `mind_profile` — Profile & Preferences

| Action | Description |
|--------|-------------|
| `get`, `update` | Profile management |
| `get_chat_prompt`, `set_chat_prompt` | Custom chat system prompt |
| `get_thought_prompt`, `set_thought_prompt` | Custom thought generation prompt |
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

### `mind_admin` — Administration

| Action | Description |
|--------|-------------|
| `create_user` | Provision new MIND account |
| `list_users` | List users with analytics |
| `update_user_tier` | Change subscription tier |
| `adjust_user_credits` | Add/deduct credits |
| `create_featured_mind` | Create public featured mind |
| `list_featured_minds`, `update_featured_mind` | Featured minds catalog |

### `mind_focuses` — Focus Buckets

| Action | Description |
|--------|-------------|
| `list`, `get` | View Focuses and their project counts |
| `create`, `update`, `delete` | Maintain the top-level buckets that group Life projects |

### `mind_tasks` — Site-Wide Tasks

| Action | Description |
|--------|-------------|
| `list`, `create`, `get`, `update`, `delete` | Task CRUD — attach to a Life project, CRM contact, agent, or stand alone |
| `complete`, `reopen` | Completion tracking |
| `assign` | Assign to a MIND member, agent, or external email |
| `reports` | Completion analytics |

### `mind_checklists` — Task-Level Checklists

| Action | Description |
|--------|-------------|
| `list_templates`, `get_template`, `create_template` | Reusable checklist blueprints (incl. global flagship templates) |
| `list`, `create`, `get`, `delete` | Checklist runs attached to a task or Life item |
| `toggle_item` | Check/uncheck a step |
| `complete` | Finish a checklist and mirror it into the knowledge graph |

### `mind_folders` — Document Folders

| Action | Description |
|--------|-------------|
| `list`, `create`, `rename`, `delete` | Folder CRUD (a presentation layer — the graph still indexes across every document) |
| `move`, `move_documents` | File documents into folders |
| `set_hint` | Set the agent-routing hint read by `mind_folder_suggest` |

### `mind_folder_routes` — System-Folder Routing

| Action | Description |
|--------|-------------|
| `list`, `set`, `clear` | Configure which folder each kind of system-generated doc is filed into |
| `apply_recommended` | Idempotent one-tap setup wiring every source type to a default folder |

### `mind_folder_suggest` — Folder Suggestion

Reads every folder's routing hint and uses a cheap LLM to pick the best match for a piece of content. Returns `folder_id=null` when nothing clearly applies.

### `mind_list_templates` / `mind_get_template` / `mind_save_typed` / `mind_bootstrap_templates` — Front Layer Templates

Four tools for MIND's 16 Front Layer document types (SOUL, IDENTITY, BELIEFS, USER, AGENTS, TOOLS, SENSES, SKILLS, BEHAVIOR, LESSON, DECISION, POLICY, WORKFLOW, PREFERENCE, GOAL, RELATIONSHIP): list the types, fetch a template's full spec, save a filled document with the correct type tag, or seed all 16 templates into a new tenant.

### `mind_agents` — Agent Command Center (admin-only)

Canonical registry of every Astra AI agent — status, current job, ownership/sharing (`transfer_owner`, `share`, `list_shares`, `revoke_share`), heartbeats, activity logs, and linked invoices/workflows. 25 actions.

### `mind_tickets` — Agent Ticket Queue

| Action | Description |
|--------|-------------|
| `list`, `get`, `create` | File and view client feedback, critiques, ideas, feature requests, and bugs on an agent |
| `comment`, `update`, `resolve`, `delete` | Triage a ticket thread |

### `mind_accounts` — Multi-MIND Accounts

| Action | Description |
|--------|-------------|
| `list`, `create`, `delete` | Discover, spin up, or permanently remove a MIND account |
| `members`, `grant`, `invite` | See who has access, grant it, or email an invitation |

### `mind_social_analytics` — Social Dashboard

YouTube/LinkedIn/X/Twitch channel stats, recent videos with performance, retention curves, traffic sources, comment sentiment, and goal progress.

### `mind_personas` — Influencer Factory (admin-only)

Synthetic-persona creators that publish across Blotato platforms: persona CRUD, AI-generated or user-uploaded face anchors, image-to-image face variants, ElevenLabs voice library/cloning, per-platform bios, and Blotato account registration.

### `mind_osint` — Ozzie (OSINT Analyst)

| Action | Description |
|--------|-------------|
| `investigate` | Get a cited intelligence dossier on a domain, IP, org, or person |
| `add_monitor`, `list_monitors`, `remove_monitor` | Natural-language live-feed alerts |
| `add_watchlist`, `list_watchlist`, `remove_watchlist` | Watchlist management |

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
| `MIND_BASE_URL` | No | `https://m-i-n-d.ai` | MIND API base URL |

## Programmatic Usage

```typescript
import { createMindMcpServer, MindClient } from "@astramindapp/mcp-server";

const client = new MindClient({
  baseUrl: "https://m-i-n-d.ai",
  apiKey: "mind_xxx",
});

const server = createMindMcpServer(client);
// Connect to any MCP transport
```

## Patents

MIND's technology is protected by multiple provisional patents including:
- Emotion-Weighted Knowledge Graph Encoding (U.S. App. 64/030,662)
- Cross-Agent Persistent Memory via Model Context Protocol

## Links

- **Website**: [m-i-n-d.ai](https://m-i-n-d.ai)
- **GitHub**: [theastraway/mind-mcp-server](https://github.com/theastraway/mind-mcp-server)
- **npm**: [@astramindapp/mcp-server](https://www.npmjs.com/package/@astramindapp/mcp-server)
- **MCP Docs**: [m-i-n-d.ai/mcp.html](https://www.m-i-n-d.ai/mcp.html)

## License

MIT — Astra AI, LLC.
