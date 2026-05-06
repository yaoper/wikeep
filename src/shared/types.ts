export type MessageRole = 'user' | 'assistant' | 'system' | 'unknown';
export type CaptureMethod = 'api' | 'dom';

export interface ConversationMetadata {
  repoNames?: string[];
}

export interface MessageCitation {
  filePath: string;
  rangeStart: number;
  rangeEnd: number;
}

export interface MessageMetadata {
  engineId?: string;
  citations?: MessageCitation[];
  sourceResponseTypes?: string[];
}

export interface Conversation {
  id: string;
  source: 'deepwiki';
  question: string;
  sourceUrl: string;
  sourceSessionId?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: ConversationMetadata;
  schemaVersion: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  contentHash: string;
  order: number;
  externalId?: string;
  sourceNodeKey?: string;
  metadata?: MessageMetadata;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export interface Settings {
  autoCaptureEnabled: boolean;
  preferredPanel: 'sidePanel' | 'popup';
  hasSeenPrivacyNotice: boolean;
  schemaVersion: number;
}

export interface ParsedMessage {
  role: MessageRole;
  content: string;
  order: number;
  externalId?: string;
  sourceNodeKey?: string;
  metadata?: MessageMetadata;
}

export interface CapturePayload {
  title?: string;
  sourceUrl: string;
  sourceHost: string;
  sourceSessionId?: string;
  metadata?: ConversationMetadata;
  messages: ParsedMessage[];
  capturedAt: number;
}

export interface CapturePerformance {
  totalMs?: number;
  localLookupMs?: number;
  domParseMs?: number;
  domPersistMs?: number;
  apiFetchMs?: number;
  apiTransformMs?: number;
  apiPersistMs?: number;
}

export interface ConversationListItem extends Conversation {
  matchedSnippet?: string;
}

export interface ConversationDetail {
  conversation: Conversation;
}

export interface CaptureResult {
  conversationId: string;
  messageCount: number;
  pending: boolean;
  method: CaptureMethod;
  savedAt: number;
  repoNames?: string[];
  performance?: CapturePerformance;
}

export interface ExistingCaptureLookupResult {
  exists: boolean;
  conversationId?: string;
  updatedAt?: number;
  repoNames?: string[];
}

export type CaptureStatusReason =
  | 'idle'
  | 'not_deepwiki_page'
  | 'auto_capture_disabled'
  | 'already_saved'
  | 'api_fetch_failed'
  | 'dom_not_ready'
  | 'unsupported_dom_structure'
  | 'storage_error';

export interface CaptureStatus {
  supported: boolean;
  active: boolean;
  queryId?: string;
  sourceUrl?: string;
  method?: CaptureMethod;
  lastCapturedAt?: number;
  pending?: boolean;
  reason?: CaptureStatusReason;
  errorMessage?: string;
  performance?: CapturePerformance;
  existingConversationId?: string;
  repoNames?: string[];
}

export interface ActiveTabContext {
  tabId?: number;
  title?: string;
  url?: string;
  supported: boolean;
  queryId?: string;
  status?: CaptureStatus;
}

export interface BackupData {
  version: number;
  exportedAt: number;
  conversations: Conversation[];
  messages: Message[];
}
