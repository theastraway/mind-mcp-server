# @astramindapp/mcp-server

**MIND MCP Server** — The most complete AI memory layer available. 15 tools, 89 actions.

Your AI agents forget everything between sessions. MIND fixes that. Connect any MCP-compatible agent to your personal knowledge graph — with emotional intelligence, CRM, life management, social features, self-training, autonomous insights, and more.

## 15 Tools

| Tool | Actions | What It Does |
|------|---------|-------------|
| `mind_query` | 1 | Semantic search across your knowledge graph (5 search modes) |
| `mind_remember` | 5 | Store, search, get, list, delete — documents, entries, thoughts |
| `mind_context` | 1 | Load persistent identity, preferences, rules, priorities, recent activity |
| `mind_life` | 12 | Goals, projects, tasks + full calendar management + productivity stats |
| `mind_crm` | 7 | Contacts, pipeline, activity logging, interaction history |
| `mind_graph` | 3 | Graph stats, diagnostics, entity labels |
| `mind_admin` | 7 | User provisioning, featured minds, tier/credit management |
| `mind_sense` | 7 | MINDsense emotional intelligence — state, signals, timeline, KG weights, spikes |
| `mind_research` | 3 | Launch autonomous deep research jobs |
| `mind_train` | 7 | Self-training sessions + save chats to knowledge graph |
| `mind_social` | 14 | Thoughts (posts), social feed, communities, likes, comments |
| `mind_profile` | 9 | Profile, custom system prompts, LLM model selection |
| `mind_insights` | 7 | Autonomous Learning Engine insights, weekly summaries, feedback |
| `mind_automate` | 6 | Scheduled automations, event triggers, execution history |
| `mind_notify` | 4 | Notifications, mark read, stats |

## Quick Start

### 1. Get a MIND API Key

Sign up at [m-i-n-d.ai](https://m-i-n-d.ai) → Settings → Developer → Create API Key

### 2. Install

```bash
npm install -g @astramindapp/mcp-server
```

### 3. Configure Your AI Tool

#### Claude Code

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
| Tools | 8 | 4 | 9 | **15** |
| Knowledge graph | Basic (JSON) | No (vectors) | Yes (Neo4j) | **Yes (LightRAG)** |
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

MIT — Astrai AI, Inc.
