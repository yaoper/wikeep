import { searchConversations } from '../search/searchService';
import type {
  CapturePayload,
  Conversation,
  ConversationDetail,
  ConversationListItem,
  Message
} from '../shared/types';
import {
  buildConversationId,
  buildMessageId,
  stableHash,
  summarizeMessages
} from '../shared/utils';
import { getDb } from './db';

const SCHEMA_VERSION = 1;

function getExternalMessageKey(message: Pick<Message, 'externalId' | 'role'>): string | null {
  if (!message.externalId) {
    return null;
  }

  return `${message.externalId}:${message.role}`;
}

function getOrderMessageKey(message: Pick<Message, 'order' | 'role'>): string {
  return `${message.order}:${message.role}`;
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
    existingConversation =
      (await conversationStore.index('by-sourceSessionId').get(snapshot.sourceSessionId)) ?? undefined;
  }

  if (!existingConversation) {
    existingConversation =
      (await conversationStore.index('by-sourceUrl').get(snapshot.sourceUrl)) ?? undefined;
  }

  const conversationId =
    existingConversation?.id ??
    buildConversationId(snapshot.sourceSessionId, snapshot.sourceUrl);
  const existingMessages = await messageStore.index('by-conversationId').getAll(conversationId);
  const existingByExternalId = new Map<string, Message>();
  const existingByOrder = new Map<string, Message>();

  for (const message of existingMessages) {
    const externalKey = getExternalMessageKey(message);
    if (externalKey) {
      existingByExternalId.set(externalKey, message);
    }

    existingByOrder.set(getOrderMessageKey(message), message);
  }

  const nextMessages: Message[] = [];

  for (const parsedMessage of snapshot.messages) {
    const contentHash = stableHash(`${parsedMessage.role}:${parsedMessage.content}`);
    const externalLookupKey = parsedMessage.externalId
      ? `${parsedMessage.externalId}:${parsedMessage.role}`
      : null;
    const currentMessage =
      (externalLookupKey ? existingByExternalId.get(externalLookupKey) : undefined) ??
      existingByOrder.get(`${parsedMessage.order}:${parsedMessage.role}`);

    const id =
      currentMessage?.id ??
      buildMessageId(
        conversationId,
        parsedMessage.order,
        parsedMessage.externalId,
        contentHash,
        parsedMessage.role
      );

    const message: Message = {
      id,
      conversationId,
      role: parsedMessage.role,
      content: parsedMessage.content,
      contentHash,
      order: parsedMessage.order,
      externalId: parsedMessage.externalId,
      sourceNodeKey: parsedMessage.sourceNodeKey,
      metadata: parsedMessage.metadata,
      createdAt: currentMessage?.createdAt ?? snapshot.capturedAt,
      updatedAt: snapshot.capturedAt,
      schemaVersion: SCHEMA_VERSION
    };

    await messageStore.put(message);
    nextMessages.push(message);
  }

  const allMessageIds = new Set([...existingMessages.map((message) => message.id), ...nextMessages.map((message) => message.id)]);
  const conversation: Conversation = {
    id: conversationId,
    title: snapshot.title || existingConversation?.title || '未命名会话',
    source: 'deepwiki',
    sourceUrl: snapshot.sourceUrl,
    sourceHost: snapshot.sourceHost,
    sourceSessionId: snapshot.sourceSessionId,
    createdAt: existingConversation?.createdAt ?? snapshot.capturedAt,
    updatedAt: snapshot.capturedAt,
    messageCount: allMessageIds.size,
    summary: summarizeMessages(snapshot.messages),
    tags: existingConversation?.tags ?? [],
    isFavorite: existingConversation?.isFavorite ?? false,
    metadata: snapshot.metadata ?? existingConversation?.metadata,
    schemaVersion: SCHEMA_VERSION
  };

  await conversationStore.put(conversation);
  await transaction.done;

  return {
    conversationId,
    messageCount: conversation.messageCount
  };
}

export async function listConversations(keyword?: string): Promise<ConversationListItem[]> {
  const db = await getDb();
  const conversations = await db.getAllFromIndex('conversations', 'by-updatedAt');
  const orderedConversations = [...conversations].sort((left, right) => right.updatedAt - left.updatedAt);

  if (!keyword?.trim()) {
    return orderedConversations;
  }

  const messages = await db.getAll('messages');
  return searchConversations(keyword, orderedConversations, messages);
}

export async function getConversationDetail(conversationId: string): Promise<ConversationDetail | null> {
  const db = await getDb();
  const conversation = await db.get('conversations', conversationId);

  if (!conversation) {
    return null;
  }

  const messages = await db.getAllFromIndex('messages', 'by-conversationId', conversationId);
  messages.sort((left, right) => left.order - right.order);

  return {
    conversation,
    messages
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
