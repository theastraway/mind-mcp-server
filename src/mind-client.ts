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
}

export interface LifeItemResponse {
  item_id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  created_at?: string;
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
}

export interface MoveLifeItemRequest {
  new_status: string;
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

class MindApiError extends Error {
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

  constructor(config: MindClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
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

  // ─── Query ──────────────────────────────────────────────

  async query(req: QueryRequest): Promise<QueryResponse> {
    return this.request<QueryResponse>("POST", "/developer/v1/query", req);
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
    status?: string,
    limit = 30
  ): Promise<{ items: LifeItemResponse[] }> {
    const params: Record<string, string> = { limit: String(limit) };
    if (status) params.status = status;
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
    description?: string;
    tags?: string[];
    price?: number;
    featured?: boolean;
    display_order?: number;
    is_public?: boolean;
    avatar_url?: string;
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
}
