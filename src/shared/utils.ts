import type { ParsedMessage } from './types';
import type { RuntimeCommand, RuntimeResponse } from './messages';

export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

export function stableHash(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return Math.abs(hash >>> 0).toString(16);
}

export function buildConversationId(sourceSessionId: string | undefined, sourceUrl: string): string {
  return sourceSessionId ? `deepwiki:${sourceSessionId}` : `deepwiki:${stableHash(sourceUrl)}`;
}

export function buildMessageId(
  conversationId: string,
  order: number,
  externalId: string | undefined,
  contentHash: string,
  role: string
): string {
  const seed = externalId ?? `${order}:${role}:${contentHash}`;
  return `${conversationId}:${stableHash(seed)}`;
}

export function summarizeMessages(messages: ParsedMessage[]): string {
  const assistantMessage = messages.find((message) => message.role === 'assistant' && message.content);
  const fallbackMessage = messages.find((message) => message.content);
  const summarySource = assistantMessage?.content ?? fallbackMessage?.content ?? '';

  return clipText(summarySource.replace(/\s+/g, ' '), 160);
}

export function buildSnippet(text: string, keyword: string): string {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedText || !normalizedKeyword) {
    return clipText(normalizedText, 120);
  }

  const lower = normalizedText.toLowerCase();
  const matchIndex = lower.indexOf(normalizedKeyword);

  if (matchIndex === -1) {
    return clipText(normalizedText, 120);
  }

  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(normalizedText.length, matchIndex + normalizedKeyword.length + 60);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalizedText.length ? '…' : '';

  return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
}

export function ensureErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function sendRuntimeMessage<TResponse, TPayload = unknown>(
  command: RuntimeCommand,
  payload?: TPayload
): Promise<TResponse> {
  const response = (await chrome.runtime.sendMessage({
    command,
    payload
  })) as RuntimeResponse<TResponse>;

  if (!response.ok) {
    throw new Error(response.error?.message ?? `Runtime command failed: ${command}`);
  }

  return response.data as TResponse;
}

export function assertUnreachable(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
