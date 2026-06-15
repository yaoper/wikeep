import type {
  ActiveTabContext,
  BackupData,
  CapturePayload,
  CaptureStatus,
  Settings,
  WikiPage,
  WikiPageFingerprint,
  WikiPageSnapshot,
  WikiPageTabState,
} from "./types";

export type RuntimeCommand =
  | "CAPTURE_DEEPWIKI_SESSION"
  | "CAPTURE_DOM_SNAPSHOT"
  | "LIST_CONVERSATIONS"
  | "GET_CONVERSATION_DETAIL"
  | "DELETE_CONVERSATION"
  | "CLEAR_ALL_DATA"
  | "GET_SETTINGS"
  | "UPDATE_SETTINGS"
  | "GET_ACTIVE_TAB_CONTEXT"
  | "OPEN_SIDE_PANEL"
  | "LOOKUP_CAPTURE_BY_QUERY_ID"
  | "REPORT_PAGE_STATUS"
  | "ACTIVE_TAB_CONTEXT_CHANGED"
  | "GET_PAGE_STATUS"
  | "TRIGGER_RECAPTURE"
  | "EXPORT_DATA"
  | "IMPORT_DATA"
  | "EXPORT_CONVERSATION_MARKDOWN"
  | "WIKI_PAGE_DETECTED"
  | "SAVE_WIKI_PAGE"
  | "SAVE_FULL_WIKI"
  | "GET_WIKI_PAGE_SNAPSHOT"
  | "GET_FULL_WIKI_SNAPSHOT"
  | "LIST_WIKI_PAGES"
  | "GET_WIKI_PAGE"
  | "DELETE_WIKI_PAGE"
  | "REFRESH_WIKI_PAGE"
  | "EXPORT_WIKI_PAGE_MARKDOWN"
  | "WIKI_PAGE_STATE_CHANGED";

export interface RuntimeRequest<TPayload = unknown> {
  command: RuntimeCommand;
  payload?: TPayload;
}

export interface RuntimeErrorPayload {
  code: string;
  message: string;
}

export interface RuntimeResponse<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: RuntimeErrorPayload;
}

export interface CaptureDeepWikiSessionPayload {
  queryId: string;
  sourceUrl: string;
  tabId?: number;
}

export interface CaptureDomSnapshotPayload {
  snapshot: CapturePayload;
}

export interface LookupConversationByQueryIdPayload {
  queryId: string;
}

export interface ReportPageStatusPayload {
  status: CaptureStatus;
}

export interface ActiveTabContextChangedPayload {
  context: ActiveTabContext;
}

export interface ListConversationsPayload {
  keyword?: string;
}

export interface GetConversationDetailPayload {
  conversationId: string;
}

export interface DeleteConversationPayload {
  conversationId: string;
}

export interface UpdateSettingsPayload {
  patch: Partial<Settings>;
}

export type ExportDataResult = BackupData;

export interface ImportDataPayload {
  backup: BackupData;
}

export interface ImportDataResult {
  conversationCount: number;
  messageCount: number;
}

export interface ExportConversationMarkdownPayload {
  conversationId: string;
}

export interface ExportConversationMarkdownResult {
  markdown: string;
  filename: string;
}

export interface WikiPageDetectedPayload {
  fingerprint: WikiPageFingerprint;
  tabId?: number;
}

export interface SaveWikiPagePayload {
  tabId?: number;
  snapshot?: WikiPageSnapshot;
}

export interface SaveFullWikiPayload {
  tabId?: number;
  snapshot?: WikiPageSnapshot;
}

export interface SaveWikiPageResult {
  pageId: string;
  changed: boolean;
  created: boolean;
  title: string;
}

export interface GetWikiPageSnapshotResult {
  snapshot: WikiPageSnapshot | null;
}

export interface ListWikiPagesPayload {
  keyword?: string;
}

export interface GetWikiPagePayload {
  pageId: string;
}

export interface DeleteWikiPagePayload {
  pageId: string;
}

export interface RefreshWikiPagePayload {
  pageId?: string;
  tabId?: number;
}

export interface ExportWikiPageMarkdownPayload {
  pageId: string;
}

export interface ExportWikiPageMarkdownResult {
  markdown: string;
  filename: string;
}

export interface WikiPageStateChangedPayload extends WikiPageTabState {}

export type ListWikiPagesResult = WikiPage[];
export type GetWikiPageResult = WikiPage | null;
