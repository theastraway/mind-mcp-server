# MCP Server Expansion Spec — v2.0

## Current: 7 tools (~20 endpoints)
## Proposed: 15 tools (~120 endpoints)

---

## Existing Tools — Enhanced

### 1. `mind_query` (ENHANCED)

Current: query + mode only.
Add: streaming, custom settings, model override.

```typescript
{
  query: z.string(),
  mode: z.enum(["hybrid", "mix", "graph", "vector"]).default("hybrid"),
  // NEW
  stream: z.boolean().optional().default(false),
  model: z.string().optional().describe("Override LLM model for this query"),
  top_k: z.number().optional().describe("Number of graph entities to retrieve"),
  history_turns: z.number().optional().describe("Chat history context turns"),
}
```

### 2. `mind_remember` (ENHANCED → full content management)

Current: create only.
Add: update, delete, rename, search, get by ID, upload.

```typescript
{
  action: z.enum(["create", "update", "delete", "rename", "search", "get", "list"]),
  type: z.enum(["document", "entry", "thought"]).optional(),

  // create/update
  content: z.string().optional(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().default("mcp-agent"),

  // update/delete/rename/get
  item_id: z.string().optional(),

  // rename
  new_title: z.string().optional(),

  // search
  query: z.string().optional(),

  // list
  page: z.number().optional(),
  limit: z.number().optional(),
}
```

**Maps to:**
| Action | Endpoint |
|--------|----------|
| create document | POST `/developer/v1/documents` |
| create entry | POST `/developer/v1/entries` |
| create thought | POST `/developer/v1/thoughts` |
| update document | POST `/documents/{id}/update` (needs dev API wrapper) |
| delete document | DELETE `/developer/v1/documents/{id}` |
| delete entry | DELETE `/developer/v1/entries/{id}` |
| delete thought | DELETE `/developer/v1/thoughts/{id}` |
| rename document | PATCH `/documents/{id}/rename` (needs dev API wrapper) |
| search entries | GET `/developer/v1/entries/search` |
| search thoughts | GET `/developer/v1/thoughts/search` |
| get entry | GET `/developer/v1/entries/{id}` |
| list documents | GET `/developer/v1/documents` |
| list entries | GET `/developer/v1/entries` |
| list thoughts | GET `/developer/v1/thoughts` |

### 3. `mind_context` (KEEP AS-IS)

Works well. No changes needed.

### 4. `mind_life` (ENHANCED → calendar, steps, stats, templates)

Current: list/create/update/complete/delete items only.
Add: calendar events, subtasks/steps, stats, templates, auto-schedule.

```typescript
{
  action: z.enum([
    // items (existing)
    "list", "create", "update", "complete", "delete", "move",
    // calendar (new)
    "calendar_list", "calendar_create", "calendar_update", "calendar_delete",
    // steps (new)
    "add_step", "update_step", "delete_step",
    // stats (new)
    "stats", "weekly_stats", "mindscore",
    // templates (new)
    "list_templates", "apply_template", "save_as_template",
    // ai (new)
    "generate_plan", "auto_schedule", "reflect",
  ]),

  // items
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  due_date: z.string().optional(),
  item_id: z.string().optional(),

  // calendar events
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  event_id: z.string().optional(),
  all_day: z.boolean().optional(),

  // steps
  step_id: z.string().optional(),
  step_title: z.string().optional(),
  step_completed: z.boolean().optional(),

  // templates
  template_id: z.string().optional(),
}
```

### 5. `mind_crm` (ENHANCED → delete, activities, pipeline, triggers)

Current: list/create/update contacts only.
Add: delete, log activities, pipeline view, triggers, analytics.

```typescript
{
  action: z.enum([
    // contacts (existing)
    "list", "create", "update",
    // new
    "delete", "get",
    "log_activity", "list_activities",
    "pipeline",
    "dashboard",
    "create_trigger", "list_triggers", "delete_trigger",
    "analyze",
  ]),

  // contacts
  name: z.string().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
  type: z.string().optional(),
  stage: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  contact_id: z.string().optional(),

  // activities
  activity_type: z.string().optional().describe("call, email, meeting, note"),
  activity_notes: z.string().optional(),

  // triggers
  trigger_id: z.string().optional(),
  trigger_event: z.string().optional(),
  trigger_action: z.string().optional(),
}
```

### 6. `mind_graph` (ENHANCED → diagnostics, labels, nodes)

Current: basic stats only.
Add: diagnostics, label list, entity details.

```typescript
{
  action: z.enum(["stats", "diagnostics", "labels", "popular_labels"]).default("stats"),
}
```

### 7. `mind_admin` (KEEP AS-IS)

Already comprehensive. No changes needed.

---

## New Tools

### 8. `mind_sense` (NEW — MINDsense Emotional Intelligence)

The emotional brain of MIND. Agents can read the user's emotional state, view signal history, understand KG emotional weights, and acknowledge spikes.

```typescript
server.tool(
  "mind_sense",
  "Access MINDsense emotional intelligence — the user's living emotional state, signal history, emotional timeline, and KG entity weights. Use this to understand how the user is feeling and what emotionally significant events have occurred.",
  {
    action: z.enum([
      "state",           // Current emotional state (label, valence, arousal, trend, sensitivity)
      "signals",         // Recent emotional signals
      "timeline",        // Emotional timeline (historical)
      "kg_weights",      // Emotionally weighted KG entities
      "spikes",          // Recent emotional spikes
      "acknowledge",     // Acknowledge a spike signal
      "summary",         // AI-generated emotional summary
    ]),
    signal_id: z.string().optional().describe("Signal ID for acknowledge action"),
    days: z.number().optional().default(7).describe("Lookback days for timeline/signals"),
    limit: z.number().optional().default(20).describe("Max items to return"),
  }
)
```

**Maps to:**
| Action | Endpoint |
|--------|----------|
| state | GET `/mindsense/state` |
| signals | GET `/mindsense/signals` |
| timeline | GET `/mindsense/timeline` |
| kg_weights | GET `/mindsense/kg-weights` |
| spikes | GET `/mindsense/spikes` |
| acknowledge | POST `/mindsense/acknowledge/{id}` |
| summary | GET `/mindsense/summary` |

**Needs:** Dev API wrappers for all 7 mindsense endpoints (currently JWT-only).

---

### 9. `mind_research` (NEW — Deep Research Agent)

Launch and monitor deep research jobs that autonomously gather, analyze, and store findings into the KG.

```typescript
server.tool(
  "mind_research",
  "Launch and manage deep research jobs. Research runs autonomously — it gathers information, analyzes it, and stores findings in the knowledge graph. Use for competitive analysis, market research, technical deep-dives.",
  {
    action: z.enum(["start", "status", "list"]),
    topic: z.string().optional().describe("Research topic/question for start action"),
    job_id: z.string().optional().describe("Job ID for status action"),
    limit: z.number().optional().default(10),
  }
)
```

**Maps to:**
| Action | Endpoint |
|--------|----------|
| start | POST `/mind-entries/research/start` |
| status | GET `/mind-entries/research/{job_id}` |
| list | GET `/mind-entries/research/list` or GET `/developer/v1/research` |

**Needs:** Dev API wrappers for research endpoints.

---

### 10. `mind_train` (NEW — Self-Training / Chat-to-KG)

Train MIND through guided sessions or save existing chats to the knowledge graph.

```typescript
server.tool(
  "mind_train",
  "Train MIND's knowledge graph. Start guided training sessions to teach it about yourself, or save existing chat conversations into the knowledge graph for persistent memory.",
  {
    action: z.enum([
      "start",          // Start a training session
      "chat",           // Send training message
      "status",         // Get training status
      "list_sessions",  // List past training sessions
      "pause",          // Pause current session
      "resume",         // Resume paused session
      "save_chat",      // Save a chat session to KG
    ]),
    message: z.string().optional().describe("Training message for chat action"),
    session_type: z.string().optional().describe("Training type: basics, network, expertise, history, goals, freeform"),
    session_id: z.string().optional().describe("Session ID for save_chat action"),
  }
)
```

**Maps to:**
| Action | Endpoint |
|--------|----------|
| start | POST `/training/start` |
| chat | POST `/training/chat` |
| status | GET `/training/status` |
| list_sessions | GET `/training/sessions` |
| pause | POST `/training/pause` |
| resume | POST `/training/resume` |
| save_chat | POST `/chat-data/sessions/save-to-mind` |

**Needs:** Dev API wrappers for training + chat-data endpoints.

---

### 11. `mind_social` (NEW — Thoughts, Communities, Feed)

The social layer. Create thoughts (posts), engage with the feed, manage communities.

```typescript
server.tool(
  "mind_social",
  "Interact with MIND's social layer — create thoughts (posts), browse the feed, manage communities, and engage with other users' content.",
  {
    action: z.enum([
      // thoughts
      "create_thought", "create_thought_with_images", "generate_thought",
      "get_thought", "delete_thought",
      "like_thought", "repost_thought",
      "list_comments", "add_comment", "delete_comment",
      // feed
      "feed", "user_feed", "search_feed",
      // communities
      "create_community", "list_communities", "get_community",
      "update_community", "delete_community",
      "join_community", "leave_community",
      "list_members",
      "create_post", "list_posts", "delete_post",
    ]),

    // thought content
    content: z.string().optional(),
    images: z.array(z.string()).optional().describe("Image URLs for thought"),

    // targeting
    thought_id: z.string().optional(),
    comment_id: z.string().optional(),
    community_id: z.string().optional(),
    post_id: z.string().optional(),
    username: z.string().optional(),

    // community fields
    name: z.string().optional(),
    description: z.string().optional(),
    visibility: z.enum(["public", "private"]).optional(),

    // pagination
    page: z.number().optional(),
    limit: z.number().optional(),
  }
)
```

**Needs:** Dev API wrappers for thoughts, feed, and communities (currently JWT-only).

---

### 12. `mind_profile` (NEW — Profile, Prompts, Model Selection)

Manage user profile, customize AI behavior, and configure model preferences.

```typescript
server.tool(
  "mind_profile",
  "Manage your MIND profile, AI prompt settings, and model preferences. Update your bio, set custom system prompts for chat and thought generation, and choose your preferred LLM model.",
  {
    action: z.enum([
      "get",                  // Get profile
      "update",               // Update profile fields
      "get_chat_prompt",      // Get chat system prompt
      "set_chat_prompt",      // Set chat system prompt
      "get_thought_prompt",   // Get thought generation prompt
      "set_thought_prompt",   // Set thought generation prompt
      "get_model",            // Get current LLM model
      "set_model",            // Set LLM model preference
      "list_models",          // List available models
    ]),
    username: z.string().optional(),
    bio: z.string().optional(),
    display_name: z.string().optional(),
    prompt: z.string().optional().describe("System prompt content for set_chat_prompt/set_thought_prompt"),
    model_id: z.string().optional().describe("Model ID for set_model"),
  }
)
```

**Maps to:**
| Action | Endpoint |
|--------|----------|
| get | GET `/profile/{username}` |
| update | PUT `/profile` |
| get_chat_prompt | GET `/profile/chat-prompt` |
| set_chat_prompt | PUT `/profile/chat-prompt` |
| get_thought_prompt | GET `/profile/thought-prompt` |
| set_thought_prompt | PUT `/profile/thought-prompt` |
| get_model | GET `/profile/llm-model/current` |
| set_model | PUT `/profile/llm-model` |
| list_models | GET `/profile/llm-models/available` |

**Needs:** Dev API wrappers for profile endpoints.

---

### 13. `mind_insights` (NEW — ALE Insights + Analytics)

Access insights generated by the Autonomous Learning Engine, weekly summaries, and provide feedback.

```typescript
server.tool(
  "mind_insights",
  "Access insights from MIND's Autonomous Learning Engine — patterns detected in your knowledge graph, weekly summaries, and proactive intelligence. Also trigger on-demand analysis.",
  {
    action: z.enum([
      "list",           // List recent insights
      "unread_count",   // Count of unread insights
      "view",           // Mark insight as viewed
      "feedback",       // Rate an insight (helpful/not helpful)
      "analyze",        // Trigger on-demand analysis
      "weekly_summary", // Get weekly summary
      "context",        // Get user context (for ALE)
    ]),
    insight_id: z.string().optional(),
    rating: z.enum(["helpful", "not_helpful"]).optional(),
    limit: z.number().optional().default(10),
  }
)
```

**Maps to:**
| Action | Endpoint |
|--------|----------|
| list | GET `/insights` |
| unread_count | GET `/insights/unread-count` |
| view | POST `/insights/{id}/view` |
| feedback | POST `/insights/{id}/feedback` |
| analyze | POST `/insights/analyze` |
| weekly_summary | GET `/insights/summary` |
| context | GET `/insights/context` |

**Needs:** Dev API wrappers for insights endpoints.

---

### 14. `mind_automate` (NEW — Automations + Triggers)

Create and manage automated workflows, CRM triggers, and life automation rules.

```typescript
server.tool(
  "mind_automate",
  "Create and manage automations in MIND — scheduled workflows, event triggers, and rules that run automatically. Connect CRM events to actions, schedule recurring tasks, and build custom pipelines.",
  {
    action: z.enum([
      // automations
      "list", "create", "update", "delete", "run_now", "history",
      // life rules
      "list_rules", "create_rule", "update_rule", "delete_rule", "toggle_rule", "run_rules",
    ]),

    automation_id: z.string().optional(),
    rule_id: z.string().optional(),

    // automation fields
    name: z.string().optional(),
    description: z.string().optional(),
    trigger_type: z.string().optional().describe("schedule, webhook, event"),
    trigger_config: z.string().optional().describe("JSON config for the trigger"),
    action_type: z.string().optional(),
    action_config: z.string().optional().describe("JSON config for the action"),
    enabled: z.boolean().optional(),
  }
)
```

---

### 15. `mind_notify` (NEW — Notifications)

Read and manage notifications across the platform.

```typescript
server.tool(
  "mind_notify",
  "Read and manage MIND notifications — alerts, reminders, insight notifications, and system messages.",
  {
    action: z.enum(["list", "mark_read", "mark_all_read", "stats"]),
    notification_id: z.string().optional(),
    limit: z.number().optional().default(20),
  }
)
```

---

## Implementation Priority

### Phase 1 — Wire existing dev API endpoints (no backend changes)
These already have dev API routes. Just add MCP tool calls.

| Tool | Actions to Add | Effort |
|------|---------------|--------|
| mind_remember | delete, search, get, list | 2 hours |
| mind_crm | delete, log_activity, list_activities | 1 hour |
| mind_life | calendar CRUD, stats, move | 2 hours |
| mind_graph | diagnostics, labels | 30 min |

**Total: ~6 hours. Goes from 7 tools to 7 enhanced tools covering ~50 endpoints.**

### Phase 2 — New dev API wrappers needed (backend + MCP)
These exist as app routes but need `/developer/v1/` wrappers first.

| Tool | Backend Work | MCP Work | Effort |
|------|-------------|----------|--------|
| mind_sense | 7 dev API wrappers | 1 new tool | 4 hours |
| mind_insights | 7 dev API wrappers | 1 new tool | 3 hours |
| mind_profile | 9 dev API wrappers | 1 new tool | 3 hours |
| mind_research | 3 dev API wrappers | 1 new tool | 2 hours |
| mind_train | 7 dev API wrappers | 1 new tool | 3 hours |

**Total: ~15 hours. Goes from 7 to 12 tools covering ~90 endpoints.**

### Phase 3 — Social + Automations (backend + MCP)

| Tool | Backend Work | MCP Work | Effort |
|------|-------------|----------|--------|
| mind_social | 20+ dev API wrappers | 1 new tool | 8 hours |
| mind_automate | 11 dev API wrappers | 1 new tool | 4 hours |
| mind_notify | 4 dev API wrappers | 1 new tool | 2 hours |

**Total: ~14 hours. Goes from 12 to 15 tools covering ~120 endpoints.**

---

## Summary

| Phase | Tools | Endpoints | Effort | Coverage |
|-------|-------|-----------|--------|----------|
| Current | 7 | ~20 | Done | 9% |
| Phase 1 | 7 (enhanced) | ~50 | 6 hrs | 22% |
| Phase 2 | 12 | ~90 | 15 hrs | 39% |
| Phase 3 | 15 | ~120 | 14 hrs | 52% |

The remaining 48% are admin infra, OAuth, Stripe webhooks, health checks, and widget endpoints that agents shouldn't access.

**At 15 tools / 120 endpoints, agents have full access to everything a user can do in the app.**
