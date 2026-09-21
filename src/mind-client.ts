/**
 * MIND API Client
 *
 * Thin wrapper around the MIND Developer API.
 * All methods return typed responses or throw on HTTP errors.
 */

export interface MindClientConfig {
  baseUrl: string;
  apiKey: string;
}

export interface QueryRequest {
  query: string;
  mode?: "mix" | "hybrid" | "global" | "local" | "naive";
  top_k?: number;
  model?: string;
  history_turns?: number;
  /**
   * Return raw knowledge-graph context instead of a MIND-written answer.
   * The connecting model synthesizes. Skips MIND's generation LLM and costs
   * 0 credits. The MCP surface sends true by default.
   */
  retrieve_only?: boolean;
}

export interface QueryResponse {
  response: string;
  sources: string[] | null;
  model_used: string;
  credits_used: number;
  credits_remaining: number;
}

export interface DocumentCreateRequest {
  title: string;
  content: string;
  source?: string;
}

export interface DocumentResponse {
  id: string;
  title: string;
  source: string;
  status: string;
  created_at: string;
  content_preview?: string;
}

export interface FolderResponse {
  id: string;
  name: string;
  parent_id: string | null;
  created_at?: string;
  updated_at?: string;
  document_count?: number;
  /** Free-text instruction read by the LLM folder router (POST /v1/folders/suggest). */
  routing_hint?: string;
  /** True when this folder itself is password-gated (Secure Folders). */
  secure?: boolean;
  /** True when this folder (or an ancestor) is currently gated for this key. */
  locked?: boolean;
}

export interface FolderRouteCategory {
  source_type: string;
  label: string;
  description: string;
}

export interface FolderRoutesResponse {
  categories: FolderRouteCategory[];
  /** Map of source_type → folder_id for routes the user has configured. */
  routes: Record<string, string>;
}

export interface FolderSuggestionResponse {
  folder_id: string | null;
  folder_name: string | null;
  confidence: number;
  reason: string;
}

export interface FolderApplyRecommendedResponse {
  created: string[];
  reused: string[];
  hint_updated: string[];
  routes_set: Array<{
    source_type: string;
    folder_id: string;
    folder_name: string;
  }>;
}

export interface EntryCreateRequest {
  title?: string;
  content: string;
  tags?: string[];
}

export interface EntryResponse {
  id?: string;
  entry_id?: string;
  title?: string;
  content?: string;
  entry_type?: string;
  tags?: string[];
  created_at?: string;
}

export interface ThoughtCreateRequest {
  content: string;
}

export interface ThoughtResponse {
  id?: string;
  thought_id?: string;
  content: string;
  created_at?: string;
}

export interface LifeItemCreateRequest {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  tags?: string[];
  color?: string;          // default | red | orange | yellow | green | blue | purple | pink
  target_date?: string;    // ISO date — when the project should be done
  // Focus → Project → Outcome hierarchy
  item_type?: string;      // "project" or "outcome"; defaults to "outcome"
  parent_id?: string;      // outcomes set this to their project's item_id
  focus_id?: string;       // projects set this to a focus_id; "" detaches
  agent_ids?: string[];
  workflow_ids?: string[];
}

export interface LifeItemResponse {
  item_id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  tags?: string[];
  color?: string;
  target_date?: string;
  created_at?: string;
  // Focus → Project → Outcome hierarchy
  item_type?: string;
  parent_id?: string | null;
  focus_id?: string | null;
  agent_ids?: string[];
  workflow_ids?: string[];
  subtask_count?: number;
  subtasks_completed?: number;
  is_completed?: boolean;
  completed_at?: string | null;
}

export interface CrmContactCreateRequest {
  name: string;
  email?: string;
  company?: string;
  type?: string;
  stage?: string;
  source?: string;
  value?: number;
  notes?: string;
}

export interface CrmContactResponse {
  contact_id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  type?: string;
  stage?: string;
  source?: string;
  value?: number;
  tags?: string[];
  notes?: string;
  next_follow_up?: string;
  activity_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GraphInfoResponse {
  total_entities: number;
  total_relationships: number;
  popular_labels?: Array<{ label: string | null; count: number }>;
  storage_status?: { workspace_id: string; status: string };
}

export interface ProfileResponse {
  username: string;
  bio?: string;
  thoughts_count?: number;
  followers_count?: number;
  following_count?: number;
  preferred_llm_model?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface InsightsResponse {
  insights: Array<{
    id?: string;
    type?: string;
    content?: string;
    created_at?: string;
  }>;
}

// ─── Extended Entry Response (with content + analysis) ────────

export interface EntryDetailResponse {
  entry_id: string;
  title?: string;
  content?: string;
  tags?: string[];
  entry_type?: string;
  analysis?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EntrySearchResponse {
  entries: EntryDetailResponse[];
  total: number;
}

// ─── Extended Thought Response ────────────────────────────────

export interface ThoughtDetailResponse {
  thought_id: string;
  content: string;
  like_count?: number;
  comment_count?: number;
  repost_count?: number;
  is_rag_generated?: boolean;
  created_at?: string;
}

export interface ThoughtSearchResponse {
  thoughts: ThoughtDetailResponse[];
  total: number;
}

// ─── CRM Activity ────────────────────────────────────────────

export interface CrmActivityRequest {
  type: string;
  title: string;
  description?: string;
}

export interface CrmActivityResponse {
  activity_id: string;
  type: string;
  title?: string;
  description?: string;
  created_at?: string;
}

// ─── Life: Move / Complete / Stats / Calendar ────────────────

export interface LifeItemDetailResponse {
  item_id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  category?: string;
  due_date?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  created_at?: string;
  updated_at?: string;
  // Focus → Project → Outcome hierarchy (passes through from /developer/v1)
  item_type?: string;
  parent_id?: string | null;
  focus_id?: string | null;
  agent_ids?: string[];
  workflow_ids?: string[];
  subtask_count?: number;
  subtasks_completed?: number;
  is_completed?: boolean;
  completed_at?: string | null;
  tags?: string[];
  color?: string;
  target_date?: string;
}

// ─── Focus (Focus → Project → Outcome hierarchy root) ─────────

export interface FocusCreateRequest {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  position?: number;
  agent_ids?: string[];
  workflow_ids?: string[];
}

export interface FocusResponse {
  focus_id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  position?: number;
  agent_ids?: string[];
  workflow_ids?: string[];
  project_count?: number;
  project_count_active?: number;
  project_count_completed?: number;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FocusListResponse {
  focuses: FocusResponse[];
  unfiled_project_count?: number;
}

// ─── Life project sharing (gated on LIFE_SHARING_ENABLED) ─────

export interface LifeShareResponse {
  id: string;
  project_id: string;
  project_title?: string;
  grantee_username: string;
  grantee_label?: string;
  role: string;          // "owner" | "viewer"
  granted_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface LifeShareListResponse {
  shares: LifeShareResponse[];
}

export interface MoveLifeItemRequest {
  new_status: string;
}

export interface BulkDeleteLifeItemsResponse {
  status: string;
  deleted_count: number;
  deleted_ids: string[];
  not_found: string[];
}

export interface LifeStatsResponse {
  total_items: number;
  status_counts: Record<string, number>;
  completion_rate: number;
}

export interface CalendarEventResponse {
  event_id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day?: boolean;
  created_at?: string;
}

export interface CalendarEventListResponse {
  events: CalendarEventResponse[];
  scheduled_items?: Array<{
    item_id: string;
    title: string;
    scheduled_start?: string;
    scheduled_end?: string;
    status?: string;
  }>;
}

export interface CreateCalendarEventRequest {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day?: boolean;
}

// ─── Insights: Weekly Summary ────────────────────────────────

export interface WeeklySummaryResponse {
  period?: Record<string, unknown>;
  entries_count?: number;
  documents_count?: number;
  highlights?: string[];
  summary_text?: string;
  top_topics?: string[];
  created_at?: string;
}

export interface InsightsListResponse {
  insights: Array<{
    insight_id?: string;
    insight_type?: string;
    title?: string;
    message?: string;
    priority?: string;
    category?: string;
    actionable?: boolean;
    action_suggestion?: string;
    viewed?: boolean;
    generated_at?: string;
  }>;
  total: number;
  unread: number;
}

// ─── Research ────────────────────────────────────────────────

export interface ResearchJobResponse {
  job_id: string;
  topic?: string;
  title?: string;
  status: string;
  depth?: string;
  papers_count?: number;
  credits_used?: number;
  research_summary?: string;
  paper_citations?: Array<Record<string, unknown>>;
  created_at?: string;
}

export interface ResearchJobListResponse {
  jobs: ResearchJobResponse[];
  total: number;
}

// ─── Chat ────────────────────────────────────────────────────

export interface ChatSessionResponse {
  session_id: string;
  title: string;
  message_count: number;
  updated_at?: string;
}

export interface ChatSessionListResponse {
  sessions: ChatSessionResponse[];
  total: number;
}

export interface ChatSearchResult {
  session_title: string;
  session_id: string;
  role: string;
  content_preview: string;
  timestamp?: string;
}

export interface ChatSearchResponse {
  results: ChatSearchResult[];
  total: number;
}

// ─── Notifications ───────────────────────────────────────────

export interface NotificationResponse {
  notification_id: string;
  type?: string;
  title?: string;
  message?: string;
  read: boolean;
  created_at?: string;
}

export interface NotificationsListResponse {
  notifications: NotificationResponse[];
  total: number;
  unread: number;
}

// ─── Automations ─────────────────────────────────────────────

export interface AutomationResponse {
  id: string;
  task: string;
  interval: string;
  schedule?: Record<string, unknown> | null;
  enabled: boolean;
  created_at: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  total_runs: number;
  total_credits_used: number;
  last_result?: string | null;
  last_status?: string | null;
}

export interface AutomationListResponse {
  automations: AutomationResponse[];
  total: number;
}

export interface CreateAutomationRequest {
  task: string;
  interval: string;
  schedule?: Record<string, unknown>;
}

export interface UpdateAutomationRequest {
  task?: string;
  interval?: string;
  enabled?: boolean;
}

// ─── CRM Event Triggers ─────────────────────────────────────

export interface CrmEventTriggerResponse {
  trigger_id: string;
  event: string;
  task: string;
  enabled: boolean;
  total_fires: number;
  last_triggered_at?: string | null;
  created_at: string;
}

export interface CreateCrmEventTriggerRequest {
  event: string;
  task: string;
}

export class MindApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string
  ) {
    super(`MIND API error ${status}: ${statusText} — ${body}`);
    this.name = "MindApiError";
  }
}

export class MindClient {
  private baseUrl: string;
  private apiKey: string;
  // Secure Folders: unlock tokens (one per folder_id) live in memory for the
  // life of this MCP server process only -- never persisted to disk, never
  // remembered across a restart. Every request rides along whatever is
  // still live; an expired-on-the-server token is simply ignored there.
  private secureUnlockTokens: Map<string, string> = new Map();

  constructor(config: MindClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  /** Record a folder's unlock token so subsequent calls this session can
   * see inside it. Call after a successful `unlockFolder`. */
  setSecureFolderUnlockToken(folderId: string, token: string): void {
    this.secureUnlockTokens.set(folderId, token);
  }

  /** Forget a folder's unlock token (explicit relock, or the folder was
   * unsecured/reset). */
  clearSecureFolderUnlockToken(folderId: string): void {
    this.secureUnlockTokens.delete(folderId);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
    unlockTokenOverride?: string
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
    // An explicit unlock_token argument (carried in from the hosted-MCP-style
    // tool call) always wins over whatever this session has remembered in
    // secureUnlockTokens, so the stdio and hosted servers accept identical
    // input instead of diverging on which token applies.
    if (unlockTokenOverride) {
      headers["X-Unlock-Token"] = unlockTokenOverride;
    } else if (this.secureUnlockTokens.size > 0) {
      headers["X-Unlock-Token"] = Array.from(this.secureUnlockTokens.values()).join(",");
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new MindApiError(res.status, res.statusText, text);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  /**
   * Generic action-dispatch call for the full-coverage app tools (mind_mindmap,
   * mind_moneymind, mind_budget, mind_sheets, mind_email, mind_checklists,
   * mind_sign, mind_invoices, mind_books, mind_timer, mind_forms, mind_library).
   *
   * `pathTemplate` may contain `{param}` placeholders filled from `args` and
   * removed from the query/body. `queryParams` are read from `args` and sent
   * as a query string (arrays are comma-joined). `bodyParams` are read from
   * `args` and sent as the JSON body for any method other than GET — omitted
   * keys (value `undefined`) are dropped so partial updates only patch what
   * the caller actually set.
   */
  async call<T = unknown>(
    method: string,
    pathTemplate: string,
    args: Record<string, unknown>,
    pathParams: string[] = [],
    queryParams: string[] = [],
    bodyParams: string[] = []
  ): Promise<T> {
    let path = pathTemplate;
    for (const p of pathParams) {
      path = path.replace(`{${p}}`, encodeURIComponent(String(args[p] ?? "")));
    }

    let query: Record<string, string> | undefined;
    for (const q of queryParams) {
      const v = args[q];
      if (v === undefined || v === null || v === "") continue;
      query ??= {};
      query[q] = Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : String(v);
    }

    let body: Record<string, unknown> | undefined;
    if (method !== "GET") {
      for (const b of bodyParams) {
        const v = args[b];
        if (v === undefined) continue;
        body ??= {};
        body[b] = v;
      }
    }

    return this.request<T>(method, path, body, query);
  }

  // ─── Query ──────────────────────────────────────────────

  async query(req: QueryRequest): Promise<QueryResponse> {
    return this.request<QueryResponse>("POST", "/developer/v1/query", req);
  }

  // Operate Ozzie (the Osiris OSINT analyst) through MIND.
  async osint(req: { action: string; target?: string; text?: string; id?: string }): Promise<unknown> {
    return this.request<unknown>("POST", "/developer/v1/osint", req);
  }

  // ─── Documents ──────────────────────────────────────────

  async createDocument(req: DocumentCreateRequest): Promise<DocumentResponse> {
    return this.request<DocumentResponse>("POST", "/developer/v1/documents", req);
  }

  async listDocuments(page = 1, pageSize = 20): Promise<{ documents: DocumentResponse[] }> {
    return this.request("GET", "/developer/v1/documents", undefined, {
      page: String(page),
      page_size: String(pageSize),
    });
  }

  async deleteDocument(docId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/documents/${docId}`);
  }

  // ─── Folders ────────────────────────────────────────────
  // Folders organize the document tray. Presentation only — the knowledge
  // graph still indexes every document regardless of folder.

  async listFolders(): Promise<{
    folders: FolderResponse[];
    unfiled_count: number;
    total_count: number;
  }> {
    return this.request("GET", "/developer/v1/folders");
  }

  async createFolder(
    name: string,
    parentId?: string | null,
    routingHint?: string,
  ): Promise<{ folder: FolderResponse }> {
    const body: Record<string, unknown> = { name, parent_id: parentId ?? null };
    if (routingHint !== undefined) body.routing_hint = routingHint;
    return this.request("POST", "/developer/v1/folders", body);
  }

  /** Rename, move, or update routing_hint on a folder. Only the keys present
   *  in ``body`` change — pass ``parent_id`` (id or null) to move; pass
   *  ``routing_hint`` to set/clear the agent-routing prompt; omit fields to
   *  leave them unchanged. */
  async updateFolder(
    folderId: string,
    body: { name?: string; parent_id?: string | null; routing_hint?: string },
  ): Promise<{ folder: FolderResponse }> {
    return this.request("PATCH", `/developer/v1/folders/${folderId}`, body);
  }

  async deleteFolder(folderId: string): Promise<{
    status: string;
    reparented_to: string | null;
    documents_reparented: number;
  }> {
    return this.request("DELETE", `/developer/v1/folders/${folderId}`);
  }

  // ─── Secure Folders ───────────────────────────────────────
  // Password-gate a folder. The API key needs the `secure:read` scope to
  // ever see inside one, even with a valid unlock token.

  /** `unlockToken`, when passed, overrides whatever this session has
   * remembered for the folder — lets a caller carry an explicit
   * `unlock_token` argument (matching the hosted MCP's stateless-per-call
   * shape) instead of relying on the in-memory map. */
  async secureFolder(
    folderId: string,
    passphrase: string,
    unlockToken?: string,
  ): Promise<{ status: string; folder_id: string }> {
    return this.request("POST", `/developer/v1/folders/${folderId}/secure`, { passphrase }, undefined, unlockToken);
  }

  async unsecureFolder(folderId: string, unlockToken?: string): Promise<{ status: string; folder_id: string }> {
    return this.request("DELETE", `/developer/v1/folders/${folderId}/secure`, undefined, undefined, unlockToken);
  }

  /** Verify the passphrase and mint a 15-minute unlock token. On success,
   * call `setSecureFolderUnlockToken` so subsequent calls this session see
   * inside the folder automatically. */
  async unlockFolder(
    folderId: string,
    passphrase: string,
  ): Promise<{ unlock_token: string; expires_at: string; folder_id: string }> {
    return this.request("POST", `/developer/v1/folders/${folderId}/unlock`, { passphrase });
  }

  async requestFolderReset(folderId: string): Promise<{ status: string; expires_at?: string }> {
    return this.request("POST", `/developer/v1/folders/${folderId}/secure/reset-request`, {});
  }

  async resetFolder(
    folderId: string,
    token: string,
    newPassphrase: string,
  ): Promise<{ status: string; folder_id: string }> {
    return this.request("POST", `/developer/v1/folders/${folderId}/secure/reset`, {
      token,
      new_passphrase: newPassphrase,
    });
  }

  /** Move documents into a folder, or to the top level (`folderId` = null). */
  async moveDocuments(
    docIds: string[],
    folderId: string | null,
  ): Promise<{ status: string; moved: number; folder_id: string | null }> {
    return this.request("POST", "/developer/v1/documents/move", {
      doc_ids: docIds,
      folder_id: folderId,
    });
  }

  // ─── Folder routing + auto-organize ──────────────────────
  // Deterministic per-source_type folder mapping (system writes) and the
  // LLM-driven content-aware picker (for uploaded content) live side by
  // side. Both are governed by the per-user folder set above.

  /** List the user's system-folder route table plus the canonical
   *  category taxonomy (label + description per source_type). */
  async listFolderRoutes(): Promise<FolderRoutesResponse> {
    return this.request("GET", "/developer/v1/folders/routes");
  }

  /** Set the system folder for a given ``source_type``. Pass ``null`` to
   *  clear the route. */
  async setFolderRoute(
    sourceType: string,
    folderId: string | null,
  ): Promise<{ status: string; source_type: string; folder_id?: string }> {
    return this.request(
      "PUT",
      `/developer/v1/folders/routes/${encodeURIComponent(sourceType)}`,
      { folder_id: folderId },
    );
  }

  async clearFolderRoute(
    sourceType: string,
  ): Promise<{ status: string; source_type: string }> {
    return this.request(
      "DELETE",
      `/developer/v1/folders/routes/${encodeURIComponent(sourceType)}`,
    );
  }

  /** Ask MIND which folder a piece of content belongs in. Consults each
   *  folder's ``routing_hint``; returns ``folder_id=null`` when nothing
   *  is a clear match. */
  async suggestFolder(
    content: string,
    title?: string,
  ): Promise<FolderSuggestionResponse> {
    return this.request("POST", "/developer/v1/folders/suggest", {
      content,
      title,
    });
  }

  /** One-tap setup: create the curated starter folder set (Life / CRM /
   *  Chats / Reasoning / Trader) and wire every system source_type to its
   *  recommended destination. Idempotent. */
  async applyRecommendedFolders(): Promise<FolderApplyRecommendedResponse> {
    return this.request("POST", "/developer/v1/folders/auto-organize/apply");
  }

  // ─── Front Layer Templates (MIND Sense) ─────────────────
  // 16 typed-document templates that any agent fills out as it learns.
  // The list/get endpoints are read-only specs. Filled documents go back
  // through createDocument with `source = "front-layer-<type>"`.

  async listFrontLayerTemplates(): Promise<{
    version: string;
    count: number;
    templates: Array<{
      type: string;
      description: string;
      filename: string;
      fetch_url: string;
      source_tag: string;
    }>;
    doc: string;
  }> {
    return this.request("GET", "/developer/v1/templates");
  }

  async getFrontLayerTemplate(typeName: string): Promise<{
    type: string;
    description: string;
    source_tag: string;
    default_tags: string[];
    filename: string;
    body: string;
    store_via: string;
  }> {
    return this.request(
      "GET",
      `/developer/v1/templates/${encodeURIComponent(typeName)}`
    );
  }

  async bootstrapFrontLayerTemplates(): Promise<{
    bootstrapped: number;
    total: number;
    results: Array<{ type: string; status: string; doc_id?: string; title?: string; source?: string; error?: string }>;
    doc: string;
  }> {
    return this.request("POST", "/developer/v1/templates/bootstrap");
  }

  /**
   * Save a typed Front Layer document — wraps createDocument with the
   * right `source` value so retrieval can later filter by type.
   */
  async saveTypedDocument(
    typeName: string,
    title: string,
    content: string
  ): Promise<DocumentResponse> {
    const source = `front-layer-${typeName.toLowerCase()}`;
    return this.createDocument({ title, content, source });
  }

  // ─── Entries ────────────────────────────────────────────

  async createEntry(req: EntryCreateRequest): Promise<EntryResponse> {
    return this.request<EntryResponse>("POST", "/developer/v1/entries", req);
  }

  async listEntries(limit = 20): Promise<{ entries: EntryResponse[] }> {
    return this.request("GET", "/developer/v1/entries", undefined, {
      limit: String(limit),
    });
  }

  async deleteEntry(entryId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/entries/${entryId}`);
  }

  // ─── Thoughts ───────────────────────────────────────────

  async createThought(req: ThoughtCreateRequest): Promise<ThoughtResponse> {
    return this.request<ThoughtResponse>("POST", "/developer/v1/thoughts", req);
  }

  async listThoughts(): Promise<{ thoughts: ThoughtResponse[] }> {
    return this.request("GET", "/developer/v1/thoughts");
  }

  async deleteThought(thoughtId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/thoughts/${thoughtId}`);
  }

  // ─── Life ───────────────────────────────────────────────

  async createLifeItem(req: LifeItemCreateRequest): Promise<LifeItemResponse> {
    return this.request<LifeItemResponse>("POST", "/developer/v1/life/items", req);
  }

  async listLifeItems(
    opts: {
      status?: string;
      item_type?: string;
      parent_id?: string;        // pass "none" / "null" for items with no parent
      focus_id?: string;         // pass "none" for unfiled projects
      top_level_only?: boolean;
      include_completed?: boolean;
      limit?: number;
    } = {}
  ): Promise<{ items: LifeItemResponse[]; total?: number }> {
    const params: Record<string, string> = {
      limit: String(opts.limit ?? 30),
    };
    if (opts.status) params.status = opts.status;
    if (opts.item_type) params.item_type = opts.item_type;
    if (opts.parent_id !== undefined) params.parent_id = opts.parent_id;
    if (opts.focus_id !== undefined) params.focus_id = opts.focus_id;
    if (opts.top_level_only) params.top_level_only = "true";
    if (opts.include_completed === false) params.include_completed = "false";
    return this.request("GET", "/developer/v1/life/items", undefined, params);
  }

  async updateLifeItem(
    itemId: string,
    patch: Partial<LifeItemCreateRequest & { status: string }>
  ): Promise<LifeItemResponse> {
    return this.request<LifeItemResponse>(
      "PATCH",
      `/developer/v1/life/items/${itemId}`,
      patch
    );
  }

  async deleteLifeItem(itemId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/life/items/${itemId}`);
  }

  async bulkDeleteLifeItems(itemIds: string[]): Promise<BulkDeleteLifeItemsResponse> {
    return this.request<BulkDeleteLifeItemsResponse>(
      "POST",
      "/developer/v1/life/items/bulk-delete",
      { item_ids: itemIds }
    );
  }

  // ─── Focuses (top of the Life hierarchy) ────────────────

  async listFocuses(includeArchived = false): Promise<FocusListResponse> {
    const params: Record<string, string> = {};
    if (includeArchived) params.include_archived = "true";
    return this.request<FocusListResponse>("GET", "/developer/v1/focuses", undefined, params);
  }

  async getFocus(focusId: string): Promise<FocusResponse> {
    return this.request<FocusResponse>("GET", `/developer/v1/focuses/${focusId}`);
  }

  async createFocus(req: FocusCreateRequest): Promise<FocusResponse> {
    return this.request<FocusResponse>("POST", "/developer/v1/focuses", req);
  }

  async updateFocus(
    focusId: string,
    patch: Partial<FocusCreateRequest>
  ): Promise<FocusResponse> {
    return this.request<FocusResponse>("PATCH", `/developer/v1/focuses/${focusId}`, patch);
  }

  async deleteFocus(focusId: string, hard = false): Promise<{ focus_id: string; deleted?: boolean; archived?: boolean }> {
    const params: Record<string, string> = {};
    if (hard) params.hard = "true";
    return this.request("DELETE", `/developer/v1/focuses/${focusId}`, undefined, params);
  }

  // ─── Life project sharing ────────────────────────────────
  // Requires LIFE_SHARING_ENABLED=true on the backend. While the flag is
  // off, all three endpoints return 404 — surface the error verbatim to
  // the caller so they know to ask the workspace admin to flip it.

  async listLifeShares(projectId: string): Promise<LifeShareListResponse> {
    return this.request<LifeShareListResponse>(
      "GET",
      `/developer/v1/life/items/${projectId}/shares`,
    );
  }

  async addLifeShare(
    projectId: string,
    granteeUsername: string,
    role: "owner" | "viewer" = "viewer",
  ): Promise<LifeShareResponse> {
    return this.request<LifeShareResponse>(
      "POST",
      `/developer/v1/life/items/${projectId}/shares`,
      { grantee_username: granteeUsername, role },
    );
  }

  async revokeLifeShare(projectId: string, shareId: string): Promise<{ status: string; share_id: string }> {
    return this.request(
      "DELETE",
      `/developer/v1/life/items/${projectId}/shares/${shareId}`,
    );
  }

  // ─── CRM ────────────────────────────────────────────────

  async createContact(req: CrmContactCreateRequest): Promise<CrmContactResponse> {
    return this.request<CrmContactResponse>("POST", "/developer/v1/crm/contacts", req);
  }

  async listContacts(): Promise<{ contacts: CrmContactResponse[] }> {
    return this.request("GET", "/developer/v1/crm/contacts");
  }

  async updateContact(
    contactId: string,
    patch: Partial<CrmContactCreateRequest>
  ): Promise<CrmContactResponse> {
    return this.request<CrmContactResponse>(
      "PATCH",
      `/developer/v1/crm/contacts/${contactId}`,
      patch
    );
  }

  // ─── Graph ──────────────────────────────────────────────

  async graphInfo(): Promise<GraphInfoResponse> {
    return this.request<GraphInfoResponse>("GET", "/developer/v1/graph");
  }

  // ─── Profile / Credits ─────────────────────────────────

  async profile(): Promise<ProfileResponse> {
    return this.request<ProfileResponse>("GET", "/developer/v1/profile");
  }

  async credits(): Promise<{
    credits_balance: number;
    credits_limit: number;
    tier: string;
    documents_count: number;
    storage_limit_mb: number;
    storage_used_mb: number;
  }> {
    return this.request("GET", "/developer/v1/credits");
  }

  // ─── Accounts (multi-MIND) ──────────────────────────────
  // Owner grants + invitations across the MINDs this key's owner can access.
  // Requires MULTI_MIND_ACCOUNTS_ENABLED on the server.

  async listMinds(): Promise<{
    enabled: boolean;
    actor?: string;
    active_username?: string;
    accounts: Array<{
      username: string;
      workspace_id: string;
      label: string;
      role: "owner" | "viewer";
      is_self: boolean;
      is_active: boolean;
      grant_id: string | null;
    }>;
  }> {
    return this.request("GET", "/developer/v1/accounts");
  }

  async createMind(label: string): Promise<{
    username: string;
    workspace_id: string;
    label: string;
    role: string;
  }> {
    return this.request("POST", "/developer/v1/accounts", { label });
  }

  /** Mint a delegated JWT to operate as target MIND (POST /developer/v1/accounts/switch). */
  async switchMind(username: string): Promise<{
    access_token: string;
    token_type: string;
    account: {
      username: string;
      workspace_id: string;
      label: string;
      avatar_url?: string | null;
      role: string;
      is_self: boolean;
    };
  }> {
    return this.request("POST", "/developer/v1/accounts/switch", { username });
  }

  async deleteMind(username: string): Promise<{ status: string; username: string }> {
    return this.request(
      "DELETE",
      `/developer/v1/accounts/${encodeURIComponent(username)}`
    );
  }

  async listMindMembers(username: string): Promise<{
    mind_username: string;
    members: Array<{ username: string; role: string; is_primary: boolean; grant_id: string | null }>;
    pending_invites: Array<{ invite_id: string; email: string; role: string }>;
  }> {
    return this.request(
      "GET",
      `/developer/v1/accounts/${encodeURIComponent(username)}/members`
    );
  }

  async grantMindMember(
    username: string,
    granteeUsername: string,
    role: "owner" | "viewer"
  ): Promise<{ grant_id: string; username: string; role: string }> {
    return this.request(
      "POST",
      `/developer/v1/accounts/${encodeURIComponent(username)}/members`,
      { grantee_username: granteeUsername, role }
    );
  }

  async createMindInvite(
    username: string,
    email: string,
    role: "owner" | "viewer"
  ): Promise<{ invite_id: string; email: string; role: string; invite_link: string }> {
    return this.request(
      "POST",
      `/developer/v1/accounts/${encodeURIComponent(username)}/invites`,
      { email, role }
    );
  }

  // ─── Insights ───────────────────────────────────────────

  async insights(
    includeViewed = false,
    limit = 10
  ): Promise<InsightsListResponse> {
    return this.request<InsightsListResponse>("GET", "/developer/v1/insights", undefined, {
      include_viewed: String(includeViewed),
      limit: String(limit),
    });
  }

  async weeklyInsights(): Promise<WeeklySummaryResponse> {
    return this.request<WeeklySummaryResponse>("GET", "/developer/v1/insights/weekly");
  }

  // ─── Entries (extended) ─────────────────────────────────

  async getEntry(entryId: string): Promise<EntryDetailResponse> {
    return this.request<EntryDetailResponse>("GET", `/developer/v1/entries/${entryId}`);
  }

  async searchEntries(query: string, limit = 15): Promise<EntrySearchResponse> {
    return this.request<EntrySearchResponse>("GET", "/developer/v1/entries/search", undefined, {
      query,
      limit: String(limit),
    });
  }

  // ─── Thoughts (extended) ────────────────────────────────

  async searchThoughts(query: string, limit = 15): Promise<ThoughtSearchResponse> {
    return this.request<ThoughtSearchResponse>("GET", "/developer/v1/thoughts/search", undefined, {
      query,
      limit: String(limit),
    });
  }

  // ─── CRM (extended) ────────────────────────────────────

  async getContact(contactId: string): Promise<CrmContactResponse> {
    return this.request<CrmContactResponse>("GET", `/developer/v1/crm/contacts/${contactId}`);
  }

  async deleteContact(contactId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/crm/contacts/${contactId}`);
  }

  async logActivity(
    contactId: string,
    activity: CrmActivityRequest
  ): Promise<{ activity_id: string; status: string }> {
    return this.request("POST", `/developer/v1/crm/contacts/${contactId}/activities`, activity);
  }

  async listContactActivities(
    contactId: string
  ): Promise<{ activities: CrmActivityResponse[] }> {
    return this.request("GET", `/developer/v1/crm/contacts/${contactId}/activities`);
  }

  // ─── Life (extended) ───────────────────────────────────

  async getLifeItem(itemId: string): Promise<LifeItemDetailResponse> {
    return this.request<LifeItemDetailResponse>("GET", `/developer/v1/life/items/${itemId}`);
  }

  async moveLifeItem(itemId: string, newStatus: string): Promise<LifeItemDetailResponse> {
    return this.request<LifeItemDetailResponse>(
      "POST",
      `/developer/v1/life/items/${itemId}/move`,
      { new_status: newStatus }
    );
  }

  async completeLifeItem(itemId: string): Promise<{ status: string; item_id: string }> {
    return this.request("POST", `/developer/v1/life/items/${itemId}/complete`);
  }

  async lifeStats(): Promise<LifeStatsResponse> {
    return this.request<LifeStatsResponse>("GET", "/developer/v1/life/stats");
  }

  async listCalendarEvents(
    startDate?: string,
    endDate?: string
  ): Promise<CalendarEventListResponse> {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.request<CalendarEventListResponse>(
      "GET",
      "/developer/v1/life/calendar",
      undefined,
      Object.keys(params).length ? params : undefined
    );
  }

  async createCalendarEvent(req: CreateCalendarEventRequest): Promise<CalendarEventResponse> {
    return this.request<CalendarEventResponse>("POST", "/developer/v1/life/calendar", req);
  }

  async deleteCalendarEvent(eventId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/life/calendar/${eventId}`);
  }

  async updateCalendarEvent(
    eventId: string,
    patch: Partial<CreateCalendarEventRequest>
  ): Promise<CalendarEventResponse> {
    return this.request<CalendarEventResponse>(
      "PATCH",
      `/developer/v1/life/calendar/${eventId}`,
      patch
    );
  }

  // ─── Graph (extended) ──────────────────────────────────

  async graphDiagnostics(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/developer/v1/graph/diagnostics");
  }

  // ─── Research ──────────────────────────────────────────

  async startResearch(topic: string): Promise<ResearchJobResponse> {
    return this.request<ResearchJobResponse>("POST", "/developer/v1/research", { topic });
  }

  async listResearch(limit = 20): Promise<ResearchJobListResponse> {
    return this.request<ResearchJobListResponse>("GET", "/developer/v1/research", undefined, {
      limit: String(limit),
    });
  }

  async getResearch(jobId: string): Promise<ResearchJobResponse> {
    return this.request<ResearchJobResponse>("GET", `/developer/v1/research/${jobId}`);
  }

  // ─── Chat ──────────────────────────────────────────────

  async listChatSessions(limit = 20): Promise<ChatSessionListResponse> {
    return this.request<ChatSessionListResponse>("GET", "/developer/v1/chat/sessions", undefined, {
      limit: String(limit),
    });
  }

  async searchChats(query: string, limit = 15): Promise<ChatSearchResponse> {
    return this.request<ChatSearchResponse>("GET", "/developer/v1/chat/search", undefined, {
      query,
      limit: String(limit),
    });
  }

  // ─── Notifications ─────────────────────────────────────

  async listNotifications(
    unreadOnly = true,
    limit = 20
  ): Promise<NotificationsListResponse> {
    return this.request<NotificationsListResponse>("GET", "/developer/v1/notifications", undefined, {
      unread_only: String(unreadOnly),
      limit: String(limit),
    });
  }

  // ─── Automations ───────────────────────────────────────

  async listAutomations(): Promise<AutomationListResponse> {
    return this.request<AutomationListResponse>("GET", "/developer/v1/automations");
  }

  async createAutomation(req: CreateAutomationRequest | Record<string, unknown>): Promise<AutomationResponse & Record<string, unknown>> {
    return this.request<AutomationResponse & Record<string, unknown>>("POST", "/developer/v1/automations", req);
  }

  async updateAutomation(
    automationId: string,
    patch: UpdateAutomationRequest | Record<string, unknown>
  ): Promise<AutomationResponse & Record<string, unknown>> {
    return this.request<AutomationResponse & Record<string, unknown>>(
      "PATCH",
      `/developer/v1/automations/${automationId}`,
      patch
    );
  }

  async deleteAutomation(automationId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/automations/${automationId}`);
  }

  // ─── CRM Triggers ─────────────────────────────────────

  async listCrmTriggers(): Promise<CrmEventTriggerResponse[]> {
    return this.request<CrmEventTriggerResponse[]>("GET", "/developer/v1/crm/triggers");
  }

  async createCrmTrigger(req: CreateCrmEventTriggerRequest): Promise<CrmEventTriggerResponse> {
    return this.request<CrmEventTriggerResponse>("POST", "/developer/v1/crm/triggers", req);
  }

  async deleteCrmTrigger(triggerId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/crm/triggers/${triggerId}`);
  }

  // ─── MINDsense ─────────────────────────────────────────

  async mindsenseState(): Promise<Record<string, unknown>> {
    return this.request("GET", "/developer/v1/mindsense/state");
  }

  async mindsenseSignals(days = 7, limit = 20): Promise<{ signals: Array<Record<string, unknown>> }> {
    return this.request("GET", "/developer/v1/mindsense/signals", undefined, {
      days: String(days),
      limit: String(limit),
    });
  }

  async mindsenseTimeline(days = 7): Promise<{ timeline: Array<Record<string, unknown>> }> {
    return this.request("GET", "/developer/v1/mindsense/timeline", undefined, {
      days: String(days),
    });
  }

  async mindsenseKgWeights(limit = 20): Promise<{ entities: Array<Record<string, unknown>> }> {
    return this.request("GET", "/developer/v1/mindsense/kg-weights", undefined, {
      limit: String(limit),
    });
  }

  async mindsenseSpikes(days = 7, limit = 20): Promise<{ spikes: Array<Record<string, unknown>> }> {
    return this.request("GET", "/developer/v1/mindsense/spikes", undefined, {
      days: String(days),
      limit: String(limit),
    });
  }

  async mindsenseAcknowledge(signalId: string): Promise<void> {
    await this.request("POST", `/developer/v1/mindsense/acknowledge/${signalId}`);
  }

  async mindsenseSummary(days = 7): Promise<{ summary: string }> {
    return this.request("GET", "/developer/v1/mindsense/summary", undefined, {
      days: String(days),
    });
  }

  // ─── Training ─────────────────────────────────────────

  async trainingStart(sessionType?: string): Promise<Record<string, unknown>> {
    return this.request("POST", "/developer/v1/training/start", sessionType ? { session_type: sessionType } : undefined);
  }

  async trainingChat(message: string): Promise<Record<string, unknown>> {
    return this.request("POST", "/developer/v1/training/chat", { message });
  }

  async trainingStatus(): Promise<Record<string, unknown>> {
    return this.request("GET", "/developer/v1/training/status");
  }

  async trainingSessions(): Promise<{ sessions: Array<Record<string, unknown>> }> {
    return this.request("GET", "/developer/v1/training/sessions");
  }

  async trainingPause(): Promise<void> {
    await this.request("POST", "/developer/v1/training/pause");
  }

  async trainingResume(): Promise<Record<string, unknown>> {
    return this.request("POST", "/developer/v1/training/resume");
  }

  async saveChatToMind(sessionId: string): Promise<Record<string, unknown>> {
    return this.request("POST", "/developer/v1/chat/sessions/save-to-mind", { session_id: sessionId });
  }

  // ─── Social ───────────────────────────────────────────

  async socialCreateThought(content: string): Promise<Record<string, unknown>> {
    return this.request("POST", "/developer/v1/social/thoughts", { content });
  }

  async socialGetThought(thoughtId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/developer/v1/social/thoughts/${thoughtId}`);
  }

  async socialDeleteThought(thoughtId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/social/thoughts/${thoughtId}`);
  }

  async socialLikeThought(thoughtId: string): Promise<void> {
    await this.request("POST", `/developer/v1/social/thoughts/${thoughtId}/like`);
  }

  async socialFeed(page?: number, limit?: number): Promise<{ thoughts: Array<Record<string, unknown>> }> {
    const params: Record<string, string> = {};
    if (page) params.page = String(page);
    if (limit) params.limit = String(limit);
    return this.request("GET", "/developer/v1/social/feed", undefined, Object.keys(params).length ? params : undefined);
  }

  async socialUserFeed(username: string, page?: number, limit?: number): Promise<{ thoughts: Array<Record<string, unknown>> }> {
    const params: Record<string, string> = {};
    if (page) params.page = String(page);
    if (limit) params.limit = String(limit);
    return this.request("GET", `/developer/v1/social/users/${username}/thoughts`, undefined, Object.keys(params).length ? params : undefined);
  }

  async socialSearchFeed(query: string, page?: number, limit?: number): Promise<{ thoughts: Array<Record<string, unknown>> }> {
    const params: Record<string, string> = { query };
    if (page) params.page = String(page);
    if (limit) params.limit = String(limit);
    return this.request("GET", "/developer/v1/social/feed/search", undefined, params);
  }

  async socialCreateCommunity(name: string, description?: string): Promise<Record<string, unknown>> {
    return this.request("POST", "/developer/v1/social/communities", { name, description });
  }

  async socialListCommunities(page?: number, limit?: number): Promise<{ communities: Array<Record<string, unknown>> }> {
    const params: Record<string, string> = {};
    if (page) params.page = String(page);
    if (limit) params.limit = String(limit);
    return this.request("GET", "/developer/v1/social/communities", undefined, Object.keys(params).length ? params : undefined);
  }

  async socialGetCommunity(communityId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/developer/v1/social/communities/${communityId}`);
  }

  async socialJoinCommunity(communityId: string): Promise<void> {
    await this.request("POST", `/developer/v1/social/communities/${communityId}/join`);
  }

  async socialLeaveCommunity(communityId: string): Promise<void> {
    await this.request("POST", `/developer/v1/social/communities/${communityId}/leave`);
  }

  async socialCreatePost(communityId: string, content: string): Promise<Record<string, unknown>> {
    return this.request("POST", `/developer/v1/social/communities/${communityId}/posts`, { content });
  }

  async socialListPosts(communityId: string, page?: number, limit?: number): Promise<{ posts: Array<Record<string, unknown>> }> {
    const params: Record<string, string> = {};
    if (page) params.page = String(page);
    if (limit) params.limit = String(limit);
    return this.request("GET", `/developer/v1/social/communities/${communityId}/posts`, undefined, Object.keys(params).length ? params : undefined);
  }

  // ─── Profile / Prompts / Models ───────────────────────

  async profileGet(username?: string): Promise<Record<string, unknown>> {
    const path = username ? `/developer/v1/profile/${username}` : "/developer/v1/profile";
    return this.request("GET", path);
  }

  async profileUpdate(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request("PUT", "/developer/v1/profile", patch);
  }

  async getChatPrompt(): Promise<{ prompt: string }> {
    return this.request("GET", "/developer/v1/profile/chat-prompt");
  }

  async setChatPrompt(prompt: string): Promise<void> {
    await this.request("PUT", "/developer/v1/profile/chat-prompt", { prompt });
  }

  async getThoughtPrompt(): Promise<{ prompt: string }> {
    return this.request("GET", "/developer/v1/profile/thought-prompt");
  }

  async setThoughtPrompt(prompt: string): Promise<void> {
    await this.request("PUT", "/developer/v1/profile/thought-prompt", { prompt });
  }

  async getModel(): Promise<Record<string, unknown>> {
    return this.request("GET", "/developer/v1/profile/llm-model/current");
  }

  async setModel(modelId: string): Promise<Record<string, unknown>> {
    return this.request("PUT", "/developer/v1/profile/llm-model", { model_id: modelId });
  }

  async listModels(): Promise<{ models: Array<Record<string, unknown>> }> {
    return this.request("GET", "/developer/v1/profile/llm-models/available");
  }

  // ─── Insights (extended) ──────────────────────────────

  async insightsList(limit = 10): Promise<InsightsListResponse> {
    return this.request<InsightsListResponse>("GET", "/developer/v1/insights", undefined, {
      limit: String(limit),
    });
  }

  async insightsUnreadCount(): Promise<{ count: number }> {
    return this.request("GET", "/developer/v1/insights/unread-count");
  }

  async insightsView(insightId: string): Promise<Record<string, unknown>> {
    return this.request("POST", `/developer/v1/insights/${insightId}/view`);
  }

  async insightsFeedback(insightId: string, rating: string): Promise<void> {
    await this.request("POST", `/developer/v1/insights/${insightId}/feedback`, { rating });
  }

  async insightsAnalyze(): Promise<Record<string, unknown>> {
    return this.request("POST", "/developer/v1/insights/analyze");
  }

  async insightsWeeklySummary(): Promise<{ summary: string }> {
    return this.request("GET", "/developer/v1/insights/weekly");
  }

  async insightsContext(): Promise<Record<string, unknown>> {
    return this.request("GET", "/developer/v1/insights/context");
  }

  // ─── Automations (extended) ───────────────────────────

  async automationsRunNow(automationId: string): Promise<Record<string, unknown>> {
    return this.request("POST", `/developer/v1/automations/${automationId}/run`);
  }

  async automationsHistory(automationId: string): Promise<{ executions: Array<Record<string, unknown>> }> {
    return this.request("GET", `/developer/v1/automations/${automationId}/history`);
  }

  // ─── Notifications (extended) ─────────────────────────

  async notificationsList(limit = 20): Promise<NotificationsListResponse> {
    return this.request<NotificationsListResponse>("GET", "/developer/v1/notifications", undefined, {
      limit: String(limit),
    });
  }

  async notificationsMarkRead(notificationId: string): Promise<void> {
    await this.request("POST", `/developer/v1/notifications/${notificationId}/read`);
  }

  async notificationsMarkAllRead(): Promise<{ count: number }> {
    return this.request("POST", "/developer/v1/notifications/read-all");
  }

  async notificationsStats(): Promise<Record<string, unknown>> {
    return this.request("GET", "/developer/v1/notifications/stats");
  }

  // ─── Admin ──────────────────────────────────────────────

  async adminCreateUser(req: {
    username: string;
    email: string;
    password: string;
    source?: string;
    tier?: string;
    generate_api_key?: boolean;
    api_key_name?: string;
  }): Promise<{
    status: string;
    access_token: string;
    token_type: string;
    user: { username: string; email: string; workspace_id: string; tier: string; source?: string };
    api_key?: { id: string; name: string; key: string; prefix: string; scopes: string[] };
  }> {
    return this.request("POST", "/admin/users/create", req);
  }

  async adminCreateFeaturedMind(req: {
    username: string;
    title: string;
    subtitle?: string | null;
    description?: string;
    tags?: string[];
    price?: number;
    featured?: boolean;
    display_order?: number;
    is_public?: boolean;
    avatar_url?: string | null;
    banner_url?: string | null;
    // Influencer Factory extensions
    archetype_id?: string | null;
    voice_id?: string | null;
    seed_image_url?: string | null;
    niche_tags?: string[];
    kg_scope_template_id?: string | null;
    agent_posting_enabled?: boolean;
  }): Promise<{ mind_id: string; username: string; title: string; [key: string]: unknown }> {
    return this.request("POST", "/admin/featured-minds", req);
  }

  async adminListFeaturedMinds(): Promise<
    Array<{ mind_id: string; username: string; title: string; featured: boolean; display_order: number; [key: string]: unknown }>
  > {
    return this.request("GET", "/admin/featured-minds");
  }

  async adminUpdateFeaturedMind(
    mindId: string,
    patch: Record<string, unknown>
  ): Promise<{ mind_id: string; title: string; [key: string]: unknown }> {
    return this.request("PUT", `/admin/featured-minds/${mindId}`, patch);
  }

  async adminDeleteFeaturedMind(mindId: string): Promise<{ status: string }> {
    return this.request("DELETE", `/admin/featured-minds/${mindId}`);
  }

  // Featured Minds Portal — bundled mind + linked owner profile + available models.
  // One round-trip for everything the admin portal side sheet needs.
  async adminGetFeaturedMindFull(
    mindId: string
  ): Promise<{
    featured_mind: { mind_id: string; username: string; title: string; [key: string]: unknown };
    owner_profile: {
      username: string;
      preferred_llm_model?: string | null;
      public_mind_enabled: boolean;
      public_mind_prompt?: string | null;
      public_mind_tagline?: string | null;
      public_mind_greeting?: string | null;
      public_mind_persona?: string | null;
      chat_temperature?: number | null;
      chat_reasoning_effort?: "minimal" | "low" | "medium" | "high" | null;
      avatar_url?: string | null;
      banner_url?: string | null;
      bio?: string | null;
      display_name?: string | null;
    };
    available_models: Array<{ id: string; name: string; provider: string; [key: string]: unknown }>;
  }> {
    return this.request("GET", `/admin/featured-minds/${mindId}/full`);
  }

  // Admin write-through to the user_profiles doc linked to the featured mind.
  // Edits to LLM model / public chat prompt / temperature / reasoning_effort /
  // tagline / greeting / persona / bio / avatar / banner take effect on
  // /m/{username} immediately. Pass null on preferred_llm_model to clear and
  // fall back to the platform default.
  async adminUpdateFeaturedMindOwnerProfile(
    mindId: string,
    patch: {
      preferred_llm_model?: string | null;
      public_mind_enabled?: boolean;
      public_mind_prompt?: string;
      public_mind_tagline?: string;
      public_mind_greeting?: string;
      public_mind_persona?: string;
      chat_temperature?: number | null;
      chat_reasoning_effort?: "minimal" | "low" | "medium" | "high" | null;
      bio?: string;
      avatar_url?: string;
      banner_url?: string;
    }
  ): Promise<{ username: string; [key: string]: unknown }> {
    return this.request(
      "PUT",
      `/admin/featured-minds/${mindId}/owner-profile`,
      patch
    );
  }

  // Bulk display_order assignment. Index in the array becomes the order.
  async adminReorderFeaturedMinds(
    orderedMindIds: string[]
  ): Promise<{ status: string; updated: number; total: number }> {
    return this.request("PUT", "/admin/featured-minds/reorder", {
      ordered_mind_ids: orderedMindIds,
    });
  }

  async adminListUsers(params?: { q?: string; page?: number }): Promise<{
    users: Array<{ username: string; email?: string; tier?: string; doc_count?: number }>;
    total?: number;
  }> {
    const qp: Record<string, string> = {};
    if (params?.q) qp.q = params.q;
    if (params?.page) qp.page = String(params.page);
    return this.request("GET", "/admin/users", undefined, qp);
  }

  async adminUpdateUserTier(username: string, tier: string): Promise<{ tier: string }> {
    return this.request("PUT", `/admin/users/${username}/tier`, { tier });
  }

  async adminAdjustCredits(username: string, amount: number): Promise<{ new_balance: number }> {
    return this.request("POST", `/admin/users/${username}/credits`, { amount });
  }

  // ─── Agent Command Center ───────────────────────────────
  // Admin-only registry of every agent across MINDapp + the VPS fleet.
  // Backed by /admin/agents on the MIND backend; canonical surface at
  // https://m-i-n-d.ai/agents.

  async listAgents(params?: {
    status?: string;
    host?: string;
    tag?: string;
    /** "agent" | "workflow" | undefined (returns both) */
    kind?: string;
    q?: string;
    include_archived?: boolean;
  }): Promise<{ agents: AgentRecord[]; stats: AgentStats }> {
    const qp: Record<string, string> = {};
    if (params?.status) qp.status = params.status;
    if (params?.host) qp.host = params.host;
    if (params?.tag) qp.tag = params.tag;
    if (params?.kind) qp.kind = params.kind;
    if (params?.q) qp.q = params.q;
    if (params?.include_archived) qp.include_archived = "true";
    return this.request("GET", "/admin/agents", undefined, qp);
  }

  async getAgent(slug: string): Promise<AgentRecord & { recent_activities: AgentActivity[] }> {
    return this.request("GET", `/admin/agents/${encodeURIComponent(slug)}`);
  }

  async createAgent(payload: AgentCreatePayload): Promise<AgentRecord> {
    return this.request("POST", "/admin/agents", payload);
  }

  async updateAgent(slug: string, payload: Partial<AgentUpdatePayload>): Promise<AgentRecord> {
    return this.request("PATCH", `/admin/agents/${encodeURIComponent(slug)}`, payload);
  }

  async deleteAgent(slug: string, hard = false): Promise<{ deleted: string; hard: boolean }> {
    const qp: Record<string, string> = hard ? { hard: "true" } : {};
    return this.request("DELETE", `/admin/agents/${encodeURIComponent(slug)}`, undefined, qp);
  }

  async agentHeartbeat(
    slug: string,
    body: { current_job?: string; metrics?: Record<string, unknown>; source?: string; note?: string } = {}
  ): Promise<AgentRecord> {
    return this.request("POST", `/admin/agents/${encodeURIComponent(slug)}/heartbeat`, body);
  }

  async agentProbe(slug: string): Promise<{
    slug: string;
    probe: {
      ok: boolean;
      probe_kind?: string;
      status_code?: number;
      latency_ms?: number;
      error?: string;
      endpoint?: string;
    };
  }> {
    return this.request("GET", `/admin/agents/${encodeURIComponent(slug)}/probe`);
  }

  async listAgentActivities(slug: string, limit = 50): Promise<{ slug: string; activities: AgentActivity[] }> {
    return this.request("GET", `/admin/agents/${encodeURIComponent(slug)}/activities`, undefined, {
      limit: String(limit),
    });
  }

  async logAgentActivity(
    slug: string,
    body: { type?: string; payload?: Record<string, unknown>; source?: string } = {}
  ): Promise<AgentActivity> {
    return this.request("POST", `/admin/agents/${encodeURIComponent(slug)}/activities`, body);
  }

  async seedKnownAgents(overwrite = false): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
    total_known: number;
  }> {
    const qp: Record<string, string> = overwrite ? { overwrite: "true" } : {};
    return this.request("POST", "/admin/agents/seed-known", undefined, qp);
  }

  async importAgentsFromMind(): Promise<{
    enriched: number;
    skipped: number;
    matched_slugs: string[];
    error?: string;
  }> {
    return this.request("POST", "/admin/agents/import-from-mind");
  }

  // ─── Agent ownership & sharing ────────────────────────────
  // Every agent has an `owner_username` — the MIND account whose board it
  // lives on. Ownership can be transferred, and an agent can be shared with
  // other accounts as `owner` (full control) or `viewer` (read-only).

  async transferAgentOwner(slug: string, ownerUsername: string): Promise<AgentRecord> {
    return this.request(
      "POST",
      `/admin/agents/${encodeURIComponent(slug)}/transfer-owner`,
      { owner_username: ownerUsername }
    );
  }

  async listAgentShares(
    slug: string
  ): Promise<{ slug: string; owner_username: string; shares: AgentShare[] }> {
    return this.request("GET", `/admin/agents/${encodeURIComponent(slug)}/shares`);
  }

  async shareAgent(
    slug: string,
    granteeUsername: string,
    role: "owner" | "viewer"
  ): Promise<AgentShare> {
    return this.request(
      "POST",
      `/admin/agents/${encodeURIComponent(slug)}/shares`,
      { grantee_username: granteeUsername, role }
    );
  }

  async revokeAgentShare(
    slug: string,
    shareId: string
  ): Promise<{ revoked: string; slug: string }> {
    return this.request(
      "DELETE",
      `/admin/agents/${encodeURIComponent(slug)}/shares/${encodeURIComponent(shareId)}`
    );
  }

  // ─── Agent ↔ Invoice linking ──────────────────────────────
  // Connects a board agent to invoices in the Invoice Agent book.

  async listAgentInvoices(slug: string): Promise<{ slug: string; invoices: LinkedInvoice[] }> {
    return this.request("GET", `/admin/agents/${encodeURIComponent(slug)}/invoices`);
  }

  async linkAgentInvoice(
    slug: string,
    invoiceId: string
  ): Promise<AgentRecord & { linked_invoices: LinkedInvoice[] }> {
    return this.request(
      "POST",
      `/admin/agents/${encodeURIComponent(slug)}/invoices/${encodeURIComponent(invoiceId)}`
    );
  }

  async unlinkAgentInvoice(
    slug: string,
    invoiceId: string
  ): Promise<AgentRecord & { linked_invoices: LinkedInvoice[] }> {
    return this.request(
      "DELETE",
      `/admin/agents/${encodeURIComponent(slug)}/invoices/${encodeURIComponent(invoiceId)}`
    );
  }

  async createAgentInvoice(
    slug: string,
    payload: Record<string, unknown>
  ): Promise<{ invoice: LinkedInvoice; agent: AgentRecord & { linked_invoices: LinkedInvoice[] } }> {
    return this.request("POST", `/admin/agents/${encodeURIComponent(slug)}/invoices`, payload);
  }

  // ─── Agent ↔ Workflow linking ────────────────────────────
  // The registry holds both kinds (agent + workflow) in the same `agents`
  // collection. An agent's `linked_workflow_slugs` is the many-to-many tie;
  // these helpers wrap the matching backend endpoints under /admin/agents.

  async listAgentWorkflows(
    slug: string
  ): Promise<{ slug: string; workflows: LinkedWorkflow[] }> {
    return this.request("GET", `/admin/agents/${encodeURIComponent(slug)}/workflows`);
  }

  async linkAgentWorkflow(
    slug: string,
    workflowSlug: string
  ): Promise<AgentRecord & { linked_workflows: LinkedWorkflow[] }> {
    return this.request(
      "POST",
      `/admin/agents/${encodeURIComponent(slug)}/workflows`,
      { workflow_slug: workflowSlug }
    );
  }

  async unlinkAgentWorkflow(
    slug: string,
    workflowSlug: string
  ): Promise<AgentRecord & { linked_workflows: LinkedWorkflow[] }> {
    return this.request(
      "DELETE",
      `/admin/agents/${encodeURIComponent(slug)}/workflows/${encodeURIComponent(workflowSlug)}`
    );
  }

  async workflowUsedBy(
    workflowSlug: string
  ): Promise<{ slug: string; name: string; kind: string; agents: WorkflowUsedByAgent[] }> {
    return this.request(
      "GET",
      `/admin/agents/${encodeURIComponent(workflowSlug)}/used-by`
    );
  }

  // ─── Agent tickets (client feedback + dev tasks) ──────────
  // Every agent carries a ticket queue — feedback, critique, ideas, feature
  // requests, bugs. Backed by /admin/agents/{slug}/tickets on the MIND backend.

  async listAgentTickets(
    slug: string,
    status?: string
  ): Promise<{ slug: string; tickets: AgentTicket[]; stats: TicketStats }> {
    const qp: Record<string, string> = {};
    if (status) qp.status = status;
    return this.request(
      "GET",
      `/admin/agents/${encodeURIComponent(slug)}/tickets`,
      undefined,
      qp
    );
  }

  async getAgentTicket(slug: string, ticketId: string): Promise<AgentTicket> {
    return this.request(
      "GET",
      `/admin/agents/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}`
    );
  }

  async createAgentTicket(
    slug: string,
    payload: { kind?: TicketKind; title: string; body?: string; priority?: TicketPriority }
  ): Promise<AgentTicket> {
    return this.request(
      "POST",
      `/admin/agents/${encodeURIComponent(slug)}/tickets`,
      payload
    );
  }

  async updateAgentTicket(
    slug: string,
    ticketId: string,
    patch: { status?: TicketStatus; priority?: TicketPriority; kind?: TicketKind; assignee?: string }
  ): Promise<AgentTicket> {
    return this.request(
      "PATCH",
      `/admin/agents/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}`,
      patch
    );
  }

  async commentAgentTicket(
    slug: string,
    ticketId: string,
    body: string
  ): Promise<AgentTicketComment> {
    return this.request(
      "POST",
      `/admin/agents/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}/comments`,
      { body }
    );
  }

  async deleteAgentTicket(
    slug: string,
    ticketId: string
  ): Promise<{ deleted: string; slug: string }> {
    return this.request(
      "DELETE",
      `/admin/agents/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}`
    );
  }

  // ─── Tasks ──────────────────────────────────────────────

  async listTasks(params: Record<string, string> = {}): Promise<TaskListResult> {
    return this.request<TaskListResult>("GET", "/developer/v1/tasks", undefined, params);
  }

  async getTask(taskId: string): Promise<TaskRecord> {
    return this.request<TaskRecord>("GET", `/developer/v1/tasks/${encodeURIComponent(taskId)}`);
  }

  async createTask(payload: CreateTaskPayload): Promise<TaskRecord> {
    return this.request<TaskRecord>("POST", "/developer/v1/tasks", payload);
  }

  async updateTask(taskId: string, patch: Record<string, unknown>): Promise<TaskRecord> {
    return this.request<TaskRecord>(
      "PATCH", `/developer/v1/tasks/${encodeURIComponent(taskId)}`, patch
    );
  }

  async deleteTask(taskId: string): Promise<{ deleted: boolean; task_id: string }> {
    return this.request("DELETE", `/developer/v1/tasks/${encodeURIComponent(taskId)}`);
  }

  async completeTask(taskId: string, done = true, note?: string): Promise<TaskRecord> {
    return this.request<TaskRecord>(
      "POST", `/developer/v1/tasks/${encodeURIComponent(taskId)}/complete`, { done, note }
    );
  }

  async assignTask(taskId: string, body: Record<string, unknown>): Promise<TaskRecord> {
    return this.request<TaskRecord>(
      "POST", `/developer/v1/tasks/${encodeURIComponent(taskId)}/assign`, body
    );
  }

  async taskReports(params: Record<string, string> = {}): Promise<TaskReport> {
    return this.request<TaskReport>("GET", "/developer/v1/tasks/reports", undefined, params);
  }

  // ─── Checklists ─────────────────────────────────────────
  // The granular level beneath a Task. Shape: Template → Sections[phase] → Items.

  async listChecklistTemplates(): Promise<ChecklistTemplatesListResult> {
    return this.request<ChecklistTemplatesListResult>(
      "GET", "/developer/v1/checklists/templates"
    );
  }

  async getChecklistTemplate(templateId: string): Promise<ChecklistTemplate> {
    return this.request<ChecklistTemplate>(
      "GET", `/developer/v1/checklists/templates/${encodeURIComponent(templateId)}`
    );
  }

  async createChecklistTemplate(
    payload: CreateChecklistTemplatePayload
  ): Promise<ChecklistTemplate> {
    return this.request<ChecklistTemplate>(
      "POST", "/developer/v1/checklists/templates", payload
    );
  }

  async listChecklists(
    parentType?: string,
    parentId?: string
  ): Promise<ChecklistsListResult> {
    const params: Record<string, string> = {};
    if (parentType) params.parent_type = parentType;
    if (parentId) params.parent_id = parentId;
    return this.request<ChecklistsListResult>(
      "GET", "/developer/v1/checklists", undefined, params
    );
  }

  async getChecklist(checklistId: string): Promise<ChecklistRecord> {
    return this.request<ChecklistRecord>(
      "GET", `/developer/v1/checklists/${encodeURIComponent(checklistId)}`
    );
  }

  async createChecklist(req: CreateChecklistPayload): Promise<ChecklistRecord> {
    return this.request<ChecklistRecord>("POST", "/developer/v1/checklists", req);
  }

  async toggleChecklistItem(
    checklistId: string,
    itemId: string
  ): Promise<ChecklistRecord> {
    return this.request<ChecklistRecord>(
      "POST",
      `/developer/v1/checklists/${encodeURIComponent(checklistId)}/items/${encodeURIComponent(itemId)}/toggle`
    );
  }

  async completeChecklist(checklistId: string): Promise<ChecklistRecord> {
    return this.request<ChecklistRecord>(
      "POST", `/developer/v1/checklists/${encodeURIComponent(checklistId)}/complete`
    );
  }

  async deleteChecklist(
    checklistId: string
  ): Promise<{ deleted: boolean; checklist_id: string }> {
    return this.request(
      "DELETE", `/developer/v1/checklists/${encodeURIComponent(checklistId)}`
    );
  }

  // ─── Social Media Dashboard ────────────────────────────────
  // Read-only access via X-API-Key. Routes accept both JWT (UI) and X-API-Key
  // (MCP/agents) via the get_authed_user dependency on the backend.

  async socialStatus(): Promise<Record<string, unknown>> {
    return this.request("GET", "/social/status");
  }

  async socialSummary(): Promise<Record<string, unknown>> {
    return this.request("GET", "/social/summary");
  }

  async socialYouTubeChannel(): Promise<Record<string, unknown>> {
    return this.request("GET", "/social/youtube/channel");
  }

  async socialYouTubeVideos(limit = 25): Promise<Record<string, unknown>> {
    return this.request("GET", "/social/youtube/videos", undefined, { limit: String(limit) });
  }

  async socialYouTubeVideoDetail(videoId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/social/youtube/video/${encodeURIComponent(videoId)}`);
  }

  async socialGoals(): Promise<Record<string, unknown>> {
    return this.request("GET", "/social/goals");
  }

  // ─── Influencer Factory ───────────────────────────────────
  // Admin-gated Phase 1 surface (persona CRUD + face/voice/bios/Blotato).
  // Whole router is dark unless IF_FEATURE_FLAG_ENABLED=true on the server.

  async ifHealth(): Promise<Record<string, unknown>> {
    return this.request("GET", "/api/influencerfactory/health");
  }

  async ifCreatePersona(req: {
    username: string;
    display_name: string;
    niche?: string;
    pillars?: string[];
    tone?: string;
    archetype_id?: string;
    kg_scope_template_id?: string;
    niche_tags?: string[];
    daily_credit_ceiling_usd?: number;
    rate_limits_per_day?: Record<string, number>;
  }): Promise<Record<string, unknown>> {
    return this.request("POST", "/api/influencerfactory/personas", req);
  }

  async ifListPersonas(params?: {
    status?: "draft" | "active" | "paused";
    search?: string;
    include_deleted?: boolean;
  }): Promise<Array<Record<string, unknown>>> {
    const qp: Record<string, string> = {};
    if (params?.status) qp.status = params.status;
    if (params?.search) qp.search = params.search;
    if (params?.include_deleted) qp.include_deleted = "true";
    return this.request("GET", "/api/influencerfactory/personas", undefined, qp);
  }

  async ifGetPersonaFull(personaMindId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/api/influencerfactory/personas/${personaMindId}/full`);
  }

  async ifUpdatePersona(
    personaMindId: string,
    patch: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request("PUT", `/api/influencerfactory/personas/${personaMindId}`, patch);
  }

  async ifDeletePersona(personaMindId: string): Promise<Record<string, unknown>> {
    return this.request("DELETE", `/api/influencerfactory/personas/${personaMindId}`);
  }

  async ifAnchorAIGenerate(
    personaMindId: string,
    body: { prompt: string; model?: "nano_banana_pro" | "flux" }
  ): Promise<Record<string, unknown>> {
    return this.request(
      "POST",
      `/api/influencerfactory/personas/${personaMindId}/face/anchor/ai-generate`,
      body
    );
  }

  async ifRequestVariants(
    personaMindId: string,
    body: { count: number; prompt_modifier?: string; sync_fallback?: boolean }
  ): Promise<Record<string, unknown>> {
    return this.request(
      "POST",
      `/api/influencerfactory/personas/${personaMindId}/face/variants`,
      body
    );
  }

  async ifListVariants(personaMindId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/api/influencerfactory/personas/${personaMindId}/face/variants`);
  }

  async ifSearchVoiceLibrary(params?: {
    q?: string;
    gender?: string;
    accent?: string;
    age?: string;
    use_case?: string;
    page_size?: number;
  }): Promise<Record<string, unknown>> {
    const qp: Record<string, string> = {};
    if (params?.q) qp.q = params.q;
    if (params?.gender) qp.gender = params.gender;
    if (params?.accent) qp.accent = params.accent;
    if (params?.age) qp.age = params.age;
    if (params?.use_case) qp.use_case = params.use_case;
    if (params?.page_size) qp.page_size = String(params.page_size);
    return this.request("GET", "/api/influencerfactory/voice-library", undefined, qp);
  }

  async ifSetVoiceLibrary(
    personaMindId: string,
    body: { voice_id: string; name?: string }
  ): Promise<Record<string, unknown>> {
    return this.request(
      "POST",
      `/api/influencerfactory/personas/${personaMindId}/voice/library`,
      { source: "library", ...body }
    );
  }

  async ifVoiceSample(
    personaMindId: string,
    text: string
  ): Promise<Record<string, unknown>> {
    return this.request(
      "POST",
      `/api/influencerfactory/personas/${personaMindId}/voice/sample`,
      { text }
    );
  }

  async ifUpdateBios(
    personaMindId: string,
    body: { bios: Record<string, string>; generate_with_llm?: boolean }
  ): Promise<Record<string, unknown>> {
    return this.request(
      "PUT",
      `/api/influencerfactory/personas/${personaMindId}/bios`,
      body
    );
  }

  async ifBlotatoWhoami(): Promise<Record<string, unknown>> {
    return this.request("GET", "/api/influencerfactory/blotato/whoami");
  }

  async ifBlotatoAccounts(): Promise<Record<string, unknown>> {
    return this.request("GET", "/api/influencerfactory/blotato/accounts");
  }

  async ifRegisterBlotato(
    personaMindId: string,
    platform: string,
    body: {
      account_id: string;
      page_id?: string;
      board_id?: string;
      handle?: string;
      media_type?: "story" | "reel";
    }
  ): Promise<Record<string, unknown>> {
    return this.request(
      "POST",
      `/api/influencerfactory/personas/${personaMindId}/blotato/${platform}`,
      body
    );
  }

  async ifUnregisterBlotato(
    personaMindId: string,
    platform: string
  ): Promise<Record<string, unknown>> {
    return this.request(
      "DELETE",
      `/api/influencerfactory/personas/${personaMindId}/blotato/${platform}`
    );
  }

  // ─── TraderMIND (agentic trader — /api/trader + /api/mindtrades) ──────────
  // Read the engine's outputs (feed, forecasts + history, per-bar scores,
  // candles, cycles, calibration, health, its own narrated journal) and act on
  // them as the key's owner (save/star/like + undo, notes + structured
  // feedback, full personal-journal CRUD, personalized insights).
  // Symbols are normalized (trim + uppercase) client-side because the engine
  // endpoints match case-sensitively — "es" would silently return nothing.

  private traderSymbol(symbol: string): string {
    return symbol.trim().toUpperCase();
  }

  async traderFeed(params?: { limit?: number; kind?: string }): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (params?.limit !== undefined) qp.limit = String(params.limit);
    if (params?.kind) qp.kind = params.kind;
    return this.request("GET", "/api/mindtrades/feed", undefined, qp);
  }

  async traderForecastLatest(symbol: string): Promise<unknown> {
    return this.request("GET", "/api/trader/forecasts/latest", undefined, {
      symbol: this.traderSymbol(symbol),
    });
  }

  async traderForecasts(symbol?: string, limit?: number): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (symbol) qp.symbol = this.traderSymbol(symbol);
    if (limit !== undefined) qp.limit = String(limit);
    return this.request("GET", "/api/trader/forecasts", undefined, qp);
  }

  async traderBarScores(forecastId: number): Promise<unknown> {
    return this.request("GET", `/api/trader/forecasts/${forecastId}/bar-scores`);
  }

  async traderCandles(symbol: string, tf?: string, limit?: number): Promise<unknown> {
    const qp: Record<string, string> = { symbol: this.traderSymbol(symbol) };
    if (tf) qp.tf = tf;
    if (limit !== undefined) qp.limit = String(limit);
    return this.request("GET", "/api/trader/candles", undefined, qp);
  }

  async traderCycles(limit?: number): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (limit !== undefined) qp.limit = String(limit);
    return this.request("GET", "/api/trader/cycles", undefined, qp);
  }

  async traderHealth(): Promise<unknown> {
    return this.request("GET", "/api/trader/health");
  }

  async traderCalibration(days?: number): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (days !== undefined) qp.days = String(days);
    return this.request("GET", "/api/trader/calibration", undefined, qp);
  }

  async traderAiJournal(symbol?: string, limit?: number): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (symbol) qp.symbol = this.traderSymbol(symbol);
    if (limit !== undefined) qp.limit = String(limit);
    return this.request("GET", "/api/trader/ai-journal", undefined, qp);
  }

  async traderInteract(body: {
    object_type: string;
    object_id: string;
    action: "save" | "like" | "star";
    symbol?: string;
  }): Promise<unknown> {
    return this.request("POST", "/api/trader/interact", body);
  }

  async traderUninteract(params: {
    object_type: string;
    object_id: string;
    action: "save" | "like" | "star";
  }): Promise<unknown> {
    return this.request("DELETE", "/api/trader/interact", undefined, {
      object_type: params.object_type,
      object_id: params.object_id,
      action: params.action,
    });
  }

  async traderInteractions(objectIds: string[]): Promise<unknown> {
    return this.request("GET", "/api/trader/interactions", undefined, {
      object_ids: objectIds.join(","),
    });
  }

  async traderCounts(objectIds: string[]): Promise<unknown> {
    return this.request("GET", "/api/trader/counts", undefined, {
      object_ids: objectIds.join(","),
    });
  }

  async traderNote(body: {
    object_type: string;
    object_id: string;
    kind: "note" | "feedback";
    text: string;
    tag?: "agree" | "disagree" | "context";
    symbol?: string;
  }): Promise<unknown> {
    return this.request("POST", "/api/trader/note", body);
  }

  async traderNotes(params?: {
    object_id?: string;
    kind?: "note" | "feedback";
    limit?: number;
    page?: number;
  }): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (params?.object_id) qp.object_id = params.object_id;
    if (params?.kind) qp.kind = params.kind;
    if (params?.limit !== undefined) qp.limit = String(params.limit);
    if (params?.page !== undefined) qp.page = String(params.page);
    return this.request("GET", "/api/trader/notes", undefined, qp);
  }

  async traderJournalList(limit?: number, page?: number): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (limit !== undefined) qp.limit = String(limit);
    if (page !== undefined) qp.page = String(page);
    return this.request("GET", "/api/trader/journal", undefined, qp);
  }

  async traderJournalCreate(body: {
    title: string;
    body?: string;
    symbols?: string[];
    linked_ids?: string[];
    tags?: string[];
  }): Promise<unknown> {
    return this.request("POST", "/api/trader/journal", body);
  }

  async traderJournalGet(entryId: string): Promise<unknown> {
    return this.request("GET", `/api/trader/journal/${encodeURIComponent(entryId)}`);
  }

  async traderJournalUpdate(
    entryId: string,
    body: {
      title?: string;
      body?: string;
      symbols?: string[];
      linked_ids?: string[];
      tags?: string[];
    }
  ): Promise<unknown> {
    return this.request("PUT", `/api/trader/journal/${encodeURIComponent(entryId)}`, body);
  }

  async traderJournalDelete(entryId: string): Promise<unknown> {
    return this.request("DELETE", `/api/trader/journal/${encodeURIComponent(entryId)}`);
  }

  async traderSaved(params?: {
    action?: string;
    symbol?: string;
    object_type?: string;
    limit?: number;
    page?: number;
  }): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (params?.action) qp.action = params.action;
    if (params?.symbol) qp.symbol = this.traderSymbol(params.symbol);
    if (params?.object_type) qp.object_type = params.object_type;
    if (params?.limit !== undefined) qp.limit = String(params.limit);
    if (params?.page !== undefined) qp.page = String(params.page);
    return this.request("GET", "/api/trader/saved", undefined, qp);
  }

  async traderInsights(refresh?: boolean): Promise<unknown> {
    const qp: Record<string, string> = {};
    if (refresh) qp.refresh = "true";
    return this.request("GET", "/api/trader/insights", undefined, qp);
  }

  // ─── Agent Sessions ─────────────────────────────────────
  // Every external agent (Claude Code, Codex, Cursor, Grokbot, OpenClaw...)
  // logs its live session into MIND Chat as a tagged Agent Session — see the
  // AGENT SESSION PROTOCOL in integration-guide.ts. Backed by
  // backend/routes/agent_session_routes.py, prefix
  // /developer/v1/agent-sessions.

  async openAgentSession(req: OpenAgentSessionRequest): Promise<OpenAgentSessionResponse> {
    return this.request("POST", "/developer/v1/agent-sessions/open", req);
  }

  async appendAgentSession(
    sessionId: string,
    messages: AgentSessionMessageInput[],
    title?: string
  ): Promise<AppendAgentSessionResponse> {
    const body: Record<string, unknown> = { messages };
    if (title !== undefined) body.title = title;
    return this.request(
      "POST",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}/append`,
      body
    );
  }

  async closeAgentSession(
    sessionId: string,
    params?: { summary?: string; status?: "ended" }
  ): Promise<CloseAgentSessionResponse> {
    return this.request(
      "POST",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}/close`,
      params ?? {}
    );
  }

  async listAgentSessions(params?: {
    source_key?: string;
    status?: string;
    q?: string;
    limit?: number;
    before?: string;
  }): Promise<ListAgentSessionsResponse> {
    const qp: Record<string, string> = {};
    if (params?.source_key) qp.source_key = params.source_key;
    if (params?.status) qp.status = params.status;
    if (params?.q) qp.q = params.q;
    if (params?.limit !== undefined) qp.limit = String(params.limit);
    if (params?.before) qp.before = params.before;
    return this.request("GET", "/developer/v1/agent-sessions", undefined, qp);
  }

  async getAgentSession(
    sessionId: string,
    params?: { limit?: number; before_seq?: number }
  ): Promise<GetAgentSessionResponse> {
    const qp: Record<string, string> = {};
    if (params?.limit !== undefined) qp.limit = String(params.limit);
    if (params?.before_seq !== undefined) qp.before_seq = String(params.before_seq);
    return this.request(
      "GET",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}`,
      undefined,
      qp
    );
  }

  /** Human-in-MIND reply → appends {role:"user", origin:"mind"}. Used by the
   * MIND Chat UI's own client, not by the connecting agent's "reply" tool
   * action (which is sugar over appendAgentSession — see mind_sessions in
   * server.ts). Kept here so every §2 REST endpoint has a 1:1 client method. */
  async replyAgentSession(sessionId: string, content: string): Promise<AgentSessionMessage> {
    return this.request(
      "POST",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}/reply`,
      { content }
    );
  }

  async agentSessionInbox(sessionId: string): Promise<AgentSessionInboxResponse> {
    return this.request(
      "GET",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}/inbox`
    );
  }

  async handoffAgentSession(
    sessionId: string,
    toSourceKey: string
  ): Promise<AgentSessionRecord> {
    return this.request(
      "POST",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}/handoff`,
      { to_source_key: toSourceKey }
    );
  }

  async deleteAgentSession(sessionId: string): Promise<void> {
    await this.request("DELETE", `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}`);
  }

  async listAgentSessionSources(): Promise<{ sources: AgentSessionSource[] }> {
    return this.request("GET", "/developer/v1/agent-sessions/sources");
  }

  async createAgentSessionSource(req: {
    key: string;
    label: string;
    runtime: string;
    color?: string;
    wake_url?: string;
  }): Promise<AgentSessionSource> {
    return this.request("POST", "/developer/v1/agent-sessions/sources", req);
  }

  async updateAgentSessionSource(
    sourceId: string,
    patch: { label?: string; runtime?: string; color?: string; wake_url?: string }
  ): Promise<AgentSessionSource> {
    return this.request(
      "PATCH",
      `/developer/v1/agent-sessions/sources/${encodeURIComponent(sourceId)}`,
      patch
    );
  }

  async deleteAgentSessionSource(sourceId: string, force?: boolean): Promise<void> {
    const qp: Record<string, string> = {};
    if (force) qp.force = "true";
    await this.request(
      "DELETE",
      `/developer/v1/agent-sessions/sources/${encodeURIComponent(sourceId)}`,
      undefined,
      qp
    );
  }

  // ─── Agent Session sharing ──────────────────────────────
  // Share a live session with another MIND account as "viewer" (read-only)
  // or "replier" (viewer + may reply, which reaches the agent's next turn).
  // Live mirror, never a snapshot — see backend/services/agent_session_access.py.

  async createAgentSessionShare(
    sessionId: string,
    req: { grantee_username: string; role?: AgentSessionShareRole }
  ): Promise<AgentSessionShare> {
    return this.request(
      "POST",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}/shares`,
      req
    );
  }

  async listAgentSessionShares(sessionId: string): Promise<ListAgentSessionSharesResponse> {
    return this.request(
      "GET",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}/shares`
    );
  }

  async revokeAgentSessionShare(sessionId: string, shareId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/developer/v1/agent-sessions/${encodeURIComponent(sessionId)}/shares/${encodeURIComponent(shareId)}`
    );
  }
}

// ─── Task types ───────────────────────────────────────────

export interface TaskRecord {
  task_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_date?: string | null;
  tags: string[];
  parent_type: string;
  parent_id?: string | null;
  parent_label?: string | null;
  assignee_type: string;
  assignee_id?: string | null;
  assignee_label?: string | null;
  agent_run_status?: string | null;
  agent_run_note?: string | null;
  position: number;
  is_overdue: boolean;
  created_by?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  completion_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskListResult {
  tasks: TaskRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  tags?: string[];
  parent_type?: string;
  parent_id?: string;
  assignee_type?: string;
  assignee_id?: string;
  dispatch_agent?: boolean;
}

export interface TaskReport {
  generated_at: string;
  total: number;
  open: number;
  in_progress: number;
  blocked: number;
  done: number;
  overdue: number;
  unassigned: number;
  completion_rate: number;
  by_priority: Record<string, number>;
  by_assignee: Array<Record<string, unknown>>;
  by_parent: Array<Record<string, unknown>>;
  weekly_completions: number[];
  weekly_labels: string[];
  avg_completion_days: number;
  due_soon: number;
}

// ─── Checklist types ──────────────────────────────────────
// Kanon shape kept exactly: Template → Sections[phase] → Items.

export interface ChecklistItem {
  item_id: string;
  label: string;
  note?: string | null;
  checked: boolean;
}

export interface ChecklistSection {
  section_id: string;
  title: string;
  phase: string; // "pre" | "run" | "post"
  items: ChecklistItem[];
}

export interface ChecklistProgress {
  done: number;
  total: number;
  pct: number;
}

export interface ChecklistTemplate {
  template_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  sections: ChecklistSection[];
  origin: string; // "user" | "flagship"
  schedule?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplatesListResult {
  templates: ChecklistTemplate[];
  total: number;
}

export interface ChecklistRecord {
  checklist_id: string;
  user_id: string;
  parent_type: string; // "life_item" | "task"
  parent_id: string;
  parent_label?: string | null;
  template_id?: string | null;
  title: string;
  sections: ChecklistSection[];
  progress: ChecklistProgress;
  schedule?: Record<string, unknown> | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistsListResult {
  checklists: ChecklistRecord[];
  total: number;
}

export interface ChecklistSectionInput {
  section_id?: string;
  title: string;
  phase?: string;
  items?: Array<{ item_id?: string; label: string; note?: string | null; checked?: boolean }>;
}

export interface CreateChecklistTemplatePayload {
  title: string;
  description?: string;
  sections?: ChecklistSectionInput[];
  schedule?: Record<string, unknown>;
}

export interface CreateChecklistPayload {
  parent_type: string; // "life_item" | "task"
  parent_id: string;
  parent_label?: string;
  template_id?: string;
  title?: string;
  sections?: ChecklistSectionInput[];
  schedule?: Record<string, unknown>;
}

// ─── Agent ↔ Invoice link types ───────────────────────────

export interface LinkedInvoice {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  total: number;
  currency: string;
  bill_to_name: string | null;
  bill_to_company: string | null;
  last_sent_at: string | null;
}

// ─── Workflow linking ─────────────────────────────────────
//
// An agent (kind="agent") can invoke one or more workflows (kind="workflow")
// as tools. Both kinds live in the same `agents` collection — the `kind`
// discriminator drives UI grouping (Agents tab vs Workflows tab), the colored
// card stripe, and which detail panel renders. A workflow card is a plain-
// language runbook: an ordered list of WorkflowStep items that any AI can
// read and rebuild from.

export type AgentKind = "agent" | "workflow";

export type WorkflowStepKind =
  | "trigger"
  | "action"
  | "ai"
  | "branch"
  | "loop"
  | "wait"
  | "notify"
  | "output";

export interface WorkflowStep {
  order: number;
  name: string;
  description: string;
  kind: WorkflowStepKind;
  credentials: string[];
  inputs: string[];
  outputs: string[];
  notes: string;
}

/** Compact view of a workflow record as it appears on an agent's chip list. */
export interface LinkedWorkflow {
  slug: string;
  name: string;
  description: string;
  status: AgentStatus;
  trigger_summary: string | null;
  step_count: number;
  credentials_required: string[];
  tags: string[];
}

/** Compact view of an agent record as it appears on a workflow's "Used by" list. */
export interface WorkflowUsedByAgent {
  slug: string;
  name: string;
  description: string;
  status: AgentStatus;
  host: string | null;
  owner_username: string | null;
  tags: string[];
}

// ─── Agent Command Center types ───────────────────────────

export type AgentStatus = "running" | "paused" | "planned" | "archived" | "error";
export type AgentCadence = "continuous" | "scheduled" | "on-demand";
export type LiveStatus = "online" | "stale" | "offline" | "unknown";

export interface AgentAuthority {
  can_autonomous: string[];
  requires_approval: string[];
}

export interface AgentRecord {
  slug: string;
  name: string;
  description: string;
  status: AgentStatus;
  cadence: AgentCadence;
  host: string | null;
  host_address: string | null;
  port: number | null;
  health_url: string | null;
  source_path: string | null;
  source_repo: string | null;
  mind_identity_doc_id: string | null;
  responsibilities: string[];
  authority: AgentAuthority;
  triggers: string[];
  tags: string[];
  owner_email: string;
  /** The MIND account (username) whose board this agent lives on. */
  owner_username: string;
  /** The caller's role on this agent — "owner" (full control) or "viewer". */
  your_role?: "owner" | "viewer";
  open_ticket_count?: number;
  expected_interval_seconds: number;
  invoice_ids: string[];
  /** "agent" = AI employee; "workflow" = deterministic automation. */
  kind: AgentKind;
  /** Workflow slugs this agent invokes as tools (kind="agent" only). */
  linked_workflow_slugs: string[];
  /** Ordered plain-language runbook (kind="workflow" only). */
  steps: WorkflowStep[];
  trigger_summary: string | null;
  inputs_summary: string | null;
  outputs_summary: string | null;
  credentials_required: string[];
  last_heartbeat: string | null;
  last_run: string | null;
  current_job: string | null;
  config: Record<string, unknown>;
  live_status: LiveStatus;
  created_at?: string;
  updated_at?: string;
  updated_by?: string;
}

/** A grant that shares an agent with another MIND account. */
export interface AgentShare {
  id: string;
  agent_slug: string;
  grantee_username: string;
  grantee_label?: string;
  role: "owner" | "viewer";
  granted_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AgentActivity {
  activity_id: string;
  agent_slug: string;
  ts: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
}

export interface AgentStats {
  total: number;
  running: number;
  planned: number;
  paused: number;
  archived: number;
  error: number;
  online: number;
  stale: number;
  offline: number;
}

export interface AgentCreatePayload {
  slug: string;
  name: string;
  description?: string;
  status?: AgentStatus;
  cadence?: AgentCadence;
  host?: string | null;
  host_address?: string | null;
  port?: number | null;
  health_url?: string | null;
  source_path?: string | null;
  source_repo?: string | null;
  mind_identity_doc_id?: string | null;
  responsibilities?: string[];
  authority?: AgentAuthority;
  triggers?: string[];
  tags?: string[];
  owner_email?: string;
  expected_interval_seconds?: number;
  // Kind discriminator + workflow fields. Omit kind to default to "agent".
  kind?: AgentKind;
  linked_workflow_slugs?: string[];
  steps?: WorkflowStep[];
  trigger_summary?: string | null;
  inputs_summary?: string | null;
  outputs_summary?: string | null;
  credentials_required?: string[];
  config?: Record<string, unknown>;
}

export type AgentUpdatePayload = Omit<AgentCreatePayload, "slug"> & {
  current_job?: string | null;
};

// ─── Agent ticket types ───────────────────────────────────

export type TicketKind = "feedback" | "critique" | "idea" | "feature" | "bug";
export type TicketStatus = "open" | "triaged" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface AgentTicketComment {
  comment_id: string;
  ticket_id: string;
  author: string;
  author_label?: string;
  body: string;
  created_at: string;
}

export interface AgentTicket {
  ticket_id: string;
  agent_slug: string;
  agent_name?: string;
  kind: TicketKind;
  title: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: string | null;
  created_by?: string;
  created_by_label?: string;
  created_by_role?: string | null;
  comment_count: number;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  comments?: AgentTicketComment[];
}

export interface TicketStats {
  total: number;
  open: number;
}

// ─── Agent Session types ───────────────────────────────────
// See "Agent Sessions in MIND Chat" (backend/routes/agent_session_routes.py,
// prefix /developer/v1/agent-sessions) and the AGENT SESSION PROTOCOL in
// integration-guide.ts.

export type AgentSessionRuntime =
  | "claude-code"
  | "codex"
  | "cursor"
  | "openclaw"
  | "grok"
  | "n8n"
  | "custom"
  | string;

export type AgentSessionStatus = "active" | "idle" | "ended";
export type AgentSessionMessageRole = "user" | "assistant" | "system" | "tool";
export type AgentSessionMessageOrigin = "agent" | "mind";

export interface AgentSessionMessage {
  message_id: string;
  session_id: string;
  user_id?: string;
  seq: number;
  role: AgentSessionMessageRole;
  content: string;
  origin: AgentSessionMessageOrigin;
  delivered_at?: string | null;
  meta?: Record<string, unknown>;
  created_at: string;
}

/** Input shape for POST /{session_id}/append — origin defaults server-side
 * to "agent" when omitted. */
export interface AgentSessionMessageInput {
  role: AgentSessionMessageRole;
  content: string;
  origin?: "agent";
  meta?: Record<string, unknown>;
  created_at?: string;
}

export interface AgentSessionSource {
  source_id: string;
  user_id?: string;
  key: string;
  label: string;
  runtime: AgentSessionRuntime;
  color?: string | null;
  wake_url?: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at?: string | null;
  session_count: number;
}

export interface AgentSessionRecord {
  session_id: string;
  user_id?: string;
  workspace_id?: string;
  source_id: string;
  source_key: string;
  runtime: AgentSessionRuntime;
  external_session_id: string;
  title: string;
  status: AgentSessionStatus;
  started_at: string;
  last_activity_at: string;
  ended_at?: string | null;
  machine?: string | null;
  cwd?: string | null;
  repo?: string | null;
  branch?: string | null;
  model?: string | null;
  tags?: string[];
  message_count: number;
  last_message_preview?: string | null;
  summary?: string | null;
  mirror_doc_id?: string | null;
  unread_for_user: number;
  pending_reply_count: number;
  created_at: string;
  updated_at: string;
  meta?: Record<string, unknown>;
  /** Present on list/get responses once sharing is live — see
   * AgentSessionSharedMeta. */
  shared?: AgentSessionSharedMeta;
}

export interface OpenAgentSessionRequest {
  source_key: string;
  external_session_id: string;
  runtime?: AgentSessionRuntime;
  source_label?: string;
  title?: string;
  machine?: string;
  cwd?: string;
  repo?: string;
  branch?: string;
  model?: string;
  tags?: string[];
}

export interface OpenAgentSessionResponse {
  session_id: string;
  resumed: boolean;
  status: AgentSessionStatus;
  title: string;
  pending_replies: AgentSessionMessage[];
  tail: AgentSessionMessage[];
}

export interface AppendAgentSessionResponse {
  ok: boolean;
  seq_last: number;
  pending_replies: AgentSessionMessage[];
}

export interface CloseAgentSessionResponse {
  ok: boolean;
  mirror_doc_id?: string | null;
}

export interface ListAgentSessionsResponse {
  sessions: AgentSessionRecord[];
  sources: AgentSessionSource[];
}

export interface GetAgentSessionResponse extends AgentSessionRecord {
  messages: AgentSessionMessage[];
  /** "owner" | "viewer" | "replier" — the caller's resolved role on this
   * session (always "owner" before sharing existed; additive field). */
  viewer_role?: "owner" | AgentSessionShareRole;
}

export interface AgentSessionInboxResponse {
  pending_replies: AgentSessionMessage[];
}

// ─── Agent Session sharing types ────────────────────────────
// See backend/services/agent_session_access.py. "owner" is never a grantable
// role — it is derived solely from the session's own user_id.

export type AgentSessionShareRole = "viewer" | "replier";

export interface AgentSessionShare {
  id: string;
  session_id: string;
  owner_user_id: string;
  grantee_username: string;
  grantee_label?: string;
  role: AgentSessionShareRole;
  granted_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListAgentSessionSharesResponse {
  session_id: string;
  shares: AgentSessionShare[];
}

/** Present on a session row/detail that is shared TO the caller — absent
 * (or `shared_with_me: false`) for a session the caller owns. */
export interface AgentSessionSharedMeta {
  shared_with_me: boolean;
  shared_by?: string;
  role?: AgentSessionShareRole;
}
