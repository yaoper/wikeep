import type {
  ActiveTabContext,
  BackupData,
  CapturePayload,
  CaptureResult,
  CaptureStatus,
  ConversationDetail,
  ConversationListItem,
  ExistingCaptureLookupResult,
  Settings,
  WikiPage,
  WikiPageFingerprint,
  WikiPageSnapshot,
  WikiPageTabState,
} from "./types";

export interface CommandMap {
  CAPTURE_DEEPWIKI_SESSION: {
    payload: CaptureDeepWikiSessionPayload;
    result: CaptureResult;
  };
  CAPTURE_DOM_SNAPSHOT: {
    payload: CaptureDomSnapshotPayload;
    result: CaptureResult;
  };
  LIST_CONVERSATIONS: {
    payload: ListConversationsPayload | undefined;
    result: ConversationListItem[];
  };
  GET_CONVERSATION_DETAIL: {
    payload: GetConversationDetailPayload;
    result: ConversationDetail | null;
  };
  DELETE_CONVERSATION: {
    payload: DeleteConversationPayload;
    result: void;
  };
  CLEAR_ALL_DATA: {
    payload: undefined;
    result: void;
  };
  GET_SETTINGS: {
    payload: undefined;
    result: Settings;
  };
  UPDATE_SETTINGS: {
    payload: UpdateSettingsPayload;
    result: Settings;
  };
  GET_ACTIVE_TAB_CONTEXT: {
    payload: undefined;
    result: ActiveTabContext;
  };
  OPEN_SIDE_PANEL: {
    payload: undefined;
    result: void;
  };
  LOOKUP_CAPTURE_BY_QUERY_ID: {
    payload: LookupConversationByQueryIdPayload;
    result: ExistingCaptureLookupResult;
  };
  REPORT_PAGE_STATUS: {
    payload: ReportPageStatusPayload;
    result: void;
  };
  ACTIVE_TAB_CONTEXT_CHANGED: {
    payload: ActiveTabContextChangedPayload;
    result: null;
  };
  GET_PAGE_STATUS: {
    payload: undefined;
    result: CaptureStatus | null;
  };
  TRIGGER_RECAPTURE: {
    payload: undefined;
    result: CaptureStatus | null;
  };
  EXPORT_DATA: {
    payload: undefined;
    result: ExportDataResult;
  };
  IMPORT_DATA: {
    payload: ImportDataPayload;
    result: ImportDataResult;
  };
  EXPORT_CONVERSATION_MARKDOWN: {
    payload: ExportConversationMarkdownPayload;
    result: ExportConversationMarkdownResult;
  };
  WIKI_PAGE_DETECTED: {
    payload: WikiPageDetectedPayload;
    result: void;
  };
  SAVE_WIKI_PAGE: {
    payload: SaveWikiPagePayload;
    result: SaveWikiPageResult;
  };
  SAVE_FULL_WIKI: {
    payload: SaveFullWikiPayload;
    result: SaveWikiPageResult;
  };
  GET_WIKI_PAGE_SNAPSHOT: {
    payload: undefined;
    result: GetWikiPageSnapshotResult;
  };
  GET_FULL_WIKI_SNAPSHOT: {
    payload: undefined;
    result: GetWikiPageSnapshotResult;
  };
  LIST_WIKI_PAGES: {
    payload: ListWikiPagesPayload | undefined;
    result: WikiPage[];
  };
  GET_WIKI_PAGE: {
    payload: GetWikiPagePayload;
    result: GetWikiPageResult;
  };
  DELETE_WIKI_PAGE: {
    payload: DeleteWikiPagePayload;
    result: void;
  };
  REFRESH_WIKI_PAGE: {
    payload: RefreshWikiPagePayload;
    result: SaveWikiPageResult;
  };
  EXPORT_WIKI_PAGE_MARKDOWN: {
    payload: ExportWikiPageMarkdownPayload;
    result: ExportWikiPageMarkdownResult;
  };
  WIKI_PAGE_STATE_CHANGED: {
    payload: WikiPageStateChangedPayload;
    result: null;
  };
}

export type RuntimeCommand = keyof CommandMap;
export type PayloadOf<C extends RuntimeCommand> = CommandMap[C]["payload"];
export type ResultOf<C extends RuntimeCommand> = CommandMap[C]["result"];

type RuntimeRequestCommand<T> = T extends RuntimeCommand ? T : RuntimeCommand;
type RuntimeRequestPayload<T> = T extends RuntimeCommand ? PayloadOf<T> : T;

export interface RuntimeRequest<TCommandOrPayload = RuntimeCommand> {
  command: RuntimeRequestCommand<TCommandOrPayload>;
  payload?: RuntimeRequestPayload<TCommandOrPayload>;
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
  pageCount?: number;
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
