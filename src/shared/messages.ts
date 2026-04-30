import type {
  ActiveTabContext,
  CapturePayload,
  ExistingCaptureLookupResult,
  CaptureResult,
  CaptureStatus,
  ConversationDetail,
  ConversationListItem,
  Settings
} from './types';

export type RuntimeCommand =
  | 'CAPTURE_DEEPWIKI_SESSION'
  | 'CAPTURE_DOM_SNAPSHOT'
  | 'LIST_CONVERSATIONS'
  | 'GET_CONVERSATION_DETAIL'
  | 'DELETE_CONVERSATION'
  | 'CLEAR_ALL_DATA'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'GET_ACTIVE_TAB_CONTEXT'
  | 'OPEN_SIDE_PANEL'
  | 'LOOKUP_CAPTURE_BY_QUERY_ID'
  | 'GET_PAGE_STATUS'
  | 'TRIGGER_RECAPTURE';

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
}

export interface CaptureDomSnapshotPayload {
  snapshot: CapturePayload;
}

export interface LookupConversationByQueryIdPayload {
  queryId: string;
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

export type ListConversationsResult = ConversationListItem[];
export type GetConversationDetailResult = ConversationDetail | null;
export type GetSettingsResult = Settings;
export type UpdateSettingsResult = Settings;
export type GetActiveTabContextResult = ActiveTabContext;
export type CaptureSessionResult = CaptureResult;
export type LookupConversationByQueryIdResult = ExistingCaptureLookupResult;
export type PageStatusResult = CaptureStatus | null;
