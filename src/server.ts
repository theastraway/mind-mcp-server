/**
 * MIND MCP Server
 *
 * Exposes the MIND knowledge graph as MCP tools that any LLM agent can use.
 * This is the universal AI memory layer.
 *
 * Tools (15):
 *   mind_query     — Semantic search across the knowledge graph
 *   mind_remember  — Store/manage content in the graph (auto-categorized)
 *   mind_context   — Get structured always-loaded context (soul/user/rules)
 *   mind_life      — Read/write goals, projects, tasks, calendar events, stats
 *   mind_crm       — Read/write contacts, interactions, and activities
 *   mind_graph     — Get graph statistics, diagnostics, and labels
 *   mind_admin     — Admin-only user and featured mind management
 *   mind_sense     — MINDsense emotional intelligence layer
 *   mind_research  — Deep research agent jobs
 *   mind_train     — Self-training and chat-to-KG sessions
 *   mind_social    — Thoughts, communities, and feed
 *   mind_profile   — Profile, prompts, and model preferences
 *   mind_insights  — ALE insights and analytics
 *   mind_automate  — Automations and triggers
 *   mind_notify    — Notifications management
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MindClient } from "./mind-client.js";

export function createMindMcpServer(client: MindClient): McpServer {
  const server = new McpServer({
    name: "mind",
    version: "0.2.0",
  });

  // ─── mind_query ─────────────────────────────────────────
  // Semantic search across the user's knowledge graph.
  // Replaces flat MEMORY.md — returns only relevant memories.

  server.tool(
    "mind_query",
    "Search your MIND knowledge graph. Returns AI-synthesized answer from your stored documents, entries, and thoughts. Use this BEFORE making decisions — MIND is your memory.",
    {
      query: z.string().describe("What to search for in your knowledge graph"),
      mode: z
        .enum(["mix", "hybrid", "global", "local", "naive"])
        .optional()
        .default("hybrid")
        .describe("Search mode: hybrid (default, best results — combines semantic + graph traversal), mix (balanced), global (broad graph search), local (focused graph search), naive (simple vector search)"),
    },
    async ({ query, mode }) => {
      try {
        const result = await client.query({ query, mode });
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

  // ─── mind_remember ──────────────────────────────────────
  // Store/manage content in the knowledge graph. Auto-categorized by type.
  // Enhanced: now supports create, delete, search, get, list actions.

  server.tool(
    "mind_remember",
    "Store and manage content in your MIND knowledge graph. Use for facts, decisions, learnings, research, notes — anything worth remembering. Auto-categorized. Always log outcomes here after completing tasks. Supports create (default), delete, search, get, and list.",
    {
      action: z
        .enum(["create", "delete", "search", "get", "list"])
        .optional()
        .default("create")
        .describe("Action: create (store new content — default), delete (remove by ID), search (find entries), get (retrieve by ID), list (paginated listing)"),
      content: z.string().optional().describe("What to remember — the actual content to store (required for create)"),
      type: z
        .enum(["document", "entry", "thought"])
        .optional()
        .default("entry")
        .describe(
          "Storage type: document (long-form, structured — research, specs, strategies), entry (medium — observations, findings, action logs), thought (quick — fleeting ideas, one-liners)"
        ),
      title: z
        .string()
        .optional()
        .describe("Title for documents and entries (auto-generated if omitted for thoughts)"),
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

              case "thought":
                result = await client.createThought({ content });
                storedAs = "thought";
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
              case "thought":
                await client.deleteThought(item_id);
                break;
              case "entry":
              default:
                await client.deleteEntry(item_id);
                break;
            }
            return {
              content: [{ type: "text" as const, text: `✅ Deleted ${type} ${item_id}` }],
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
              case "thought": {
                const result = await client.listThoughts();
                const thoughts = result.thoughts ?? [];
                if (thoughts.length === 0) {
                  return { content: [{ type: "text" as const, text: "No thoughts found." }] };
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

  // ─── mind_context ───────────────────────────────────────
  // Get structured always-loaded context.
  // Equivalent to OpenClaw's SOUL.md + USER.md + AGENTS.md bootstrap injection,
  // but backed by the knowledge graph.

  server.tool(
    "mind_context",
    "Get your persistent context from MIND — identity, preferences, rules, and recent activity. Call this at the start of every session to know who you are, who the user is, and what matters right now.",
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
            client.query({ query: sectionQueries[section], mode: "mix" }).then((r) => ({
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
    "Manage goals, projects, tasks, and calendar events in MIND Life. Use for tracking work, creating action items, updating progress, completing tasks, managing calendar, and viewing stats.",
    {
      action: z
        .enum([
          "list", "create", "update", "complete", "delete", "move", "get",
          "calendar_list", "calendar_create", "calendar_update", "calendar_delete",
          "stats",
        ])
        .describe("What to do: list/create/update/complete/delete/move/get items, calendar_list/calendar_create/calendar_update/calendar_delete events, stats (productivity overview)"),
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
      start_time: z.string().optional().describe("Start time for calendar events (ISO 8601)"),
      end_time: z.string().optional().describe("End time for calendar events (ISO 8601)"),
      event_id: z.string().optional().describe("Event ID for calendar_update/calendar_delete"),
      all_day: z.boolean().optional().describe("Whether the calendar event is all-day"),
    },
    async ({ action, title, description, status, priority, due_date, item_id, start_time, end_time, event_id, all_day }) => {
      try {
        switch (action) {
          case "list": {
            const result = await client.listLifeItems(status);
            const items = result.items ?? [];
            if (items.length === 0) {
              return { content: [{ type: "text" as const, text: "No life items found." }] };
            }
            const lines = items.map(
              (i) =>
                `• [${i.priority ?? "—"}] ${i.title} (status: ${i.status ?? "—"}${i.due_date ? `, due: ${i.due_date}` : ""}) — id: ${i.item_id}`
            );
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✅ Created life item: "${result.title}" (id: ${result.item_id}, priority: ${result.priority}, due: ${result.due_date ?? "none"})`,
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
            if (description) patch.description = description;
            if (status) patch.status = status;
            if (priority) patch.priority = priority;
            if (due_date) patch.due_date = due_date;
            const result = await client.updateLifeItem(item_id, patch);
            return {
              content: [{ type: "text" as const, text: `✅ Updated: "${result.title}" (status: ${result.status})` }],
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
            const lines = [
              `**${result.title}**`,
              `Status: ${result.status ?? "—"} | Priority: ${result.priority ?? "—"} | Due: ${result.due_date ?? "none"}`,
              result.description ? `\n${result.description}` : "",
            ];
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
        }
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error in mind_life: ${err}` }],
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
    "Manage contacts and relationships in MIND CRM. Use for tracking people, companies, leads, interaction history, and activity logging.",
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
    "Get MIND knowledge graph statistics, diagnostics, and label details. Use to check graph health, growth, and entity breakdown.",
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
    "Admin-only tool for managing MIND users and featured minds. Requires an admin API key. Use to create new user accounts, provision featured minds, list users, and manage the featured minds catalog.",
    {
      action: z
        .enum([
          "create_user",
          "create_featured_mind",
          "list_featured_minds",
          "update_featured_mind",
          "list_users",
          "update_user_tier",
          "adjust_user_credits",
        ])
        .describe(
          "Admin action: create_user, create_featured_mind, list_featured_minds, update_featured_mind, list_users, update_user_tier, adjust_user_credits"
        ),
      // create_user fields
      username: z.string().optional().describe("Username for new user (3-30 chars, letters/numbers/underscores)"),
      email: z.string().optional().describe("Email for new user"),
      password: z.string().optional().describe("Password for new user (min 8 chars)"),
      source: z.string().optional().describe("Source app/partner that created this user (e.g. 'myapp')"),
      generate_api_key: z.boolean().optional().describe("If true, also generate a developer API key (mind_...) for the new user"),
      api_key_name: z.string().optional().describe("Name for the generated API key (defaults to '{source} integration')"),
      // featured mind fields
      mind_id: z.string().optional().describe("Featured mind ID for update operations"),
      title: z.string().optional().describe("Display title for the featured mind"),
      description: z.string().optional().describe("Description of the featured mind"),
      tags: z.array(z.string()).optional().describe("Tags for the featured mind"),
      price: z.number().optional().describe("Subscription price (0 = free)"),
      featured: z.boolean().optional().describe("Whether to show in featured section"),
      display_order: z.number().optional().describe("Sort order in featured list"),
      is_public: z.boolean().optional().describe("If true, anyone can query this mind"),
      avatar_url: z.string().optional().describe("Avatar image URL"),
      // user management fields
      tier: z.string().optional().describe("Subscription tier: free, pro, enterprise"),
      credits: z.number().optional().describe("Credits to add (positive) or deduct (negative)"),
      // list fields
      query: z.string().optional().describe("Search query for list_users"),
      page: z.number().optional().describe("Page number for paginated results"),
    },
    async ({ action, username, email, password, source, generate_api_key, api_key_name, mind_id, title, description, tags, price, featured, display_order, is_public, avatar_url, tier, credits, query, page }) => {
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
              description,
              tags,
              price: price ?? 0,
              featured: featured ?? true,
              display_order: display_order ?? 0,
              is_public: is_public ?? false,
              avatar_url,
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
            if (description !== undefined) patch.description = description;
            if (tags !== undefined) patch.tags = tags;
            if (price !== undefined) patch.price = price;
            if (featured !== undefined) patch.featured = featured;
            if (display_order !== undefined) patch.display_order = display_order;
            if (is_public !== undefined) patch.is_public = is_public;
            if (avatar_url !== undefined) patch.avatar_url = avatar_url;
            const result = await client.adminUpdateFeaturedMind(mind_id, patch);
            return {
              content: [{ type: "text" as const, text: `✅ Updated featured mind: "${result.title}"` }],
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
    "Access MINDsense emotional intelligence — the user's living emotional state, signal history, emotional timeline, and KG entity weights. Use this to understand how the user is feeling and what emotionally significant events have occurred.",
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
    "Launch and manage deep research jobs. Research runs autonomously — it gathers information, analyzes it, and stores findings in the knowledge graph. Use for competitive analysis, market research, technical deep-dives.",
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
    "Train MIND's knowledge graph. Start guided training sessions to teach it about yourself, or save existing chat conversations into the knowledge graph for persistent memory.",
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
    "Interact with MIND's social layer — create thoughts (posts), browse the feed, manage communities, and engage with other users' content.",
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
                  text: `✅ Thought posted (id: ${result.thought_id ?? result.id})`,
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
    "Manage your MIND profile, AI prompt settings, and model preferences. Update your bio, set custom system prompts for chat and thought generation, and choose your preferred LLM model.",
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
    "Access insights from MIND's Autonomous Learning Engine — patterns detected in your knowledge graph, weekly summaries, and proactive intelligence. Also trigger on-demand analysis.",
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
    "Create and manage automations in MIND — scheduled workflows, event triggers, and rules that run automatically. Connect CRM events to actions, schedule recurring tasks, and build custom pipelines.",
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
    "Read and manage MIND notifications — alerts, reminders, insight notifications, and system messages.",
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

  return server;
}
