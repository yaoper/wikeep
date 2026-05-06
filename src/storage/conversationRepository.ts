import { searchConversations } from '../search/searchService';
import type {
  BackupData,
  CapturePayload,
  Conversation,
  ConversationDetail,
  ConversationListItem,
  ExistingCaptureLookupResult,
  Message
} from '../shared/types';
import { buildConversationId, normalizeText } from '../shared/utils';
import { getDb } from './db';

const SCHEMA_VERSION = 3;

interface LegacyConversationRecord {
  id: string;
  source?: 'deepwiki';
  title?: string;
  question?: string;
  summary?: string;
  sourceUrl: string;
  sourceSessionId?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Conversation['metadata'];
  schemaVersion?: number;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
}

export function resolveConversationQuestion(snapshot: CapturePayload): string {
  const normalizedTitle = normalizeText(snapshot.title ?? '');

  if (normalizedTitle) {
    return normalizedTitle;
  }

  return (
    snapshot.messages
      .filter((message) => message.role === 'user')
      .map((message) => normalizeText(message.content))
      .filter(Boolean)
      .at(0) ?? ''
  );
}

function normalizeConversation(record: LegacyConversationRecord): Conversation {
  const repoNames = dedupeStrings(record.metadata?.repoNames ?? []);
  const question = record.question ?? normalizeText(record.title ?? record.summary ?? '') ?? '';

  return {
    id: record.id,
    source: 'deepwiki',
    question: question || '未识别问题',
    sourceUrl: record.sourceUrl,
    sourceSessionId: record.sourceSessionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    metadata: repoNames.length > 0 ? { repoNames } : undefined,
    schemaVersion: record.schemaVersion ?? SCHEMA_VERSION
  };
}

export async function upsertCapturedSession(snapshot: CapturePayload): Promise<{
  conversationId: string;
  messageCount: number;
}> {
  const db = await getDb();
  const transaction = db.transaction(['conversations', 'messages'], 'readwrite');
  const conversationStore = transaction.objectStore('conversations');
  const messageStore = transaction.objectStore('messages');

  let existingConversation: Conversation | undefined;

  if (snapshot.sourceSessionId) {
    const record =
      (await conversationStore.index('by-sourceSessionId').get(snapshot.sourceSessionId)) ?? undefined;
    existingConversation = record ? normalizeConversation(record as LegacyConversationRecord) : undefined;
  }

  if (!existingConversation) {
    const record =
      (await conversationStore.index('by-sourceUrl').get(snapshot.sourceUrl)) ?? undefined;
    existingConversation = record ? normalizeConversation(record as LegacyConversationRecord) : undefined;
  }

  const conversationId =
    existingConversation?.id ??
    buildConversationId(snapshot.sourceSessionId, snapshot.sourceUrl);
  const question = resolveConversationQuestion(snapshot) || existingConversation?.question || '未识别问题';
  const repoNames = dedupeStrings([
    ...(existingConversation?.metadata?.repoNames ?? []),
    ...(snapshot.metadata?.repoNames ?? [])
  ]);
  const conversation: Conversation = {
    id: conversationId,
    source: 'deepwiki',
    question,
    sourceUrl: snapshot.sourceUrl,
    sourceSessionId: snapshot.sourceSessionId,
    createdAt: existingConversation?.createdAt ?? snapshot.capturedAt,
    updatedAt: snapshot.capturedAt,
    metadata: repoNames.length > 0 ? { repoNames } : undefined,
    schemaVersion: SCHEMA_VERSION
  };

  const existingMessageIds = await messageStore.index('by-conversationId').getAllKeys(conversationId);
  for (const messageId of existingMessageIds) {
    await messageStore.delete(messageId as Message['id']);
  }

  await conversationStore.put(conversation);
  await transaction.done;

  return {
    conversationId,
    messageCount: question ? 1 : 0
  };
}

export async function listConversations(keyword?: string): Promise<ConversationListItem[]> {
  const db = await getDb();
  const records = await db.getAllFromIndex('conversations', 'by-updatedAt');
  const orderedConversations = records
    .map((record) => normalizeConversation(record as LegacyConversationRecord))
    .sort((left, right) => right.updatedAt - left.updatedAt);

  if (!keyword?.trim()) {
    return orderedConversations;
  }

  return searchConversations(keyword, orderedConversations);
}

export async function lookupConversationBySourceSessionId(
  sourceSessionId: string
): Promise<ExistingCaptureLookupResult> {
  const db = await getDb();
  const record = await db.getFromIndex('conversations', 'by-sourceSessionId', sourceSessionId);

  if (!record) {
    return {
      exists: false
    };
  }

  const conversation = normalizeConversation(record as LegacyConversationRecord);

  if (conversation.schemaVersion < SCHEMA_VERSION) {
    return {
      exists: false
    };
  }

  return {
    exists: true,
    conversationId: conversation.id,
    updatedAt: conversation.updatedAt,
    repoNames: conversation.metadata?.repoNames
  };
}

export async function getConversationDetail(conversationId: string): Promise<ConversationDetail | null> {
  const db = await getDb();
  const record = await db.get('conversations', conversationId);

  if (!record) {
    return null;
  }

  return {
    conversation: normalizeConversation(record as LegacyConversationRecord)
  };
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(['conversations', 'messages'], 'readwrite');
  const messageStore = transaction.objectStore('messages');
  const messages = await messageStore.index('by-conversationId').getAll(conversationId);

  for (const message of messages) {
    await messageStore.delete(message.id);
  }

  await transaction.objectStore('conversations').delete(conversationId);
  await transaction.done;
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(['conversations', 'messages'], 'readwrite');
  await transaction.objectStore('messages').clear();
  await transaction.objectStore('conversations').clear();
  await transaction.done;
}

export async function pruneLegacyConversationData(): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction(['conversations', 'messages'], 'readwrite');
  const conversationStore = transaction.objectStore('conversations');
  const records = await conversationStore.getAll();

  for (const record of records) {
    await conversationStore.put(normalizeConversation(record as LegacyConversationRecord));
  }

  await transaction.objectStore('messages').clear();
  await transaction.done;
}

export async function exportAllData(): Promise<BackupData> {
  const db = await getDb();
  const conversations = (await db.getAll('conversations')) as Conversation[];
  const messages = (await db.getAll('messages')) as Message[];

  return {
    version: 1,
    exportedAt: Date.now(),
    conversations,
    messages
  };
}

export async function importAllData(
  backup: BackupData
): Promise<{ conversationCount: number; messageCount: number }> {
  const db = await getDb();
  const transaction = db.transaction(['conversations', 'messages'], 'readwrite');
  const conversationStore = transaction.objectStore('conversations');
  const messageStore = transaction.objectStore('messages');

  for (const conversation of backup.conversations) {
    await conversationStore.put(conversation);
  }

  for (const message of backup.messages) {
    await messageStore.put(message);
  }

  await transaction.done;

  return {
    conversationCount: backup.conversations.length,
    messageCount: backup.messages.length
  };
}
