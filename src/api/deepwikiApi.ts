import type { CapturePayload, MessageCitation } from '../shared/types';
import { normalizeText } from '../shared/utils';
import type {
  DeepWikiChunkEvent,
  DeepWikiQuery,
  DeepWikiQuerySession,
  DeepWikiReferenceEvent
} from './deepwikiTypes';

const API_BASE_URL = 'https://api.devin.ai';
const DEEPWIKI_HOST = 'deepwiki.com';
const RELEVANT_CONTEXT_PATTERN = /<relevant_context>[\s\S]*?<\/relevant_context>/gi;

export function extractQueryIdFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.host !== DEEPWIKI_HOST) {
      return null;
    }

    const match = parsedUrl.pathname.match(/^\/search\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function stripRelevantContext(value: string): string {
  return normalizeText(value.replace(RELEVANT_CONTEXT_PATTERN, ''));
}

function isChunkEvent(event: DeepWikiQuery['response'][number]): event is DeepWikiChunkEvent {
  return event.type === 'chunk' && typeof event.data === 'string';
}

function isReferenceEvent(event: DeepWikiQuery['response'][number]): event is DeepWikiReferenceEvent {
  return (
    event.type === 'reference' &&
    typeof event.data === 'object' &&
    event.data !== null &&
    'file_path' in event.data &&
    'range_start' in event.data &&
    'range_end' in event.data
  );
}

function normalizeAssistantText(query: DeepWikiQuery): {
  content: string;
  citations: MessageCitation[];
  responseTypes: string[];
} {
  const visibleParts: string[] = [];
  const allChunks: string[] = [];
  const citations: MessageCitation[] = [];
  const responseTypes = new Set<string>();
  let inThoughts = false;

  for (const event of query.response) {
    responseTypes.add(event.type);

    if (event.type === 'thoughts_start') {
      inThoughts = true;
      continue;
    }

    if (event.type === 'thoughts_end') {
      inThoughts = false;
      continue;
    }

    if (isChunkEvent(event)) {
      allChunks.push(event.data);

      if (!inThoughts) {
        visibleParts.push(event.data);
      }
    }

    if (isReferenceEvent(event)) {
      citations.push({
        filePath: event.data.file_path,
        rangeStart: event.data.range_start,
        rangeEnd: event.data.range_end
      });
    }
  }

  let content = normalizeText(visibleParts.join(''));

  if (!content) {
    const fallback = allChunks.join('');
    const splitBySearchMarker = fallback.split('\n> Searching codebase...\n');
    content = normalizeText(splitBySearchMarker.at(-1) ?? fallback);
  }

  return {
    content,
    citations,
    responseTypes: [...responseTypes]
  };
}

export async function fetchDeepWikiSession(queryId: string): Promise<DeepWikiQuerySession> {
  const response = await fetch(`${API_BASE_URL}/ada/query/${queryId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch DeepWiki session: ${response.status}`);
  }

  return (await response.json()) as DeepWikiQuerySession;
}

export function buildCapturePayloadFromDeepWikiSession(
  session: DeepWikiQuerySession,
  sourceUrl: string
): { snapshot: CapturePayload; pending: boolean } {
  const sourceSessionId = extractQueryIdFromUrl(sourceUrl) ?? undefined;
  const sourceHost = new URL(sourceUrl).host;
  const messages = [];
  let order = 0;
  let pending = false;

  for (const query of session.queries) {
    const userQuery = stripRelevantContext(query.user_query);

    if (userQuery) {
      messages.push({
        role: 'user' as const,
        content: userQuery,
        order,
        externalId: `${query.message_id}:user`,
        metadata: {
          engineId: query.engine_id,
          sourceResponseTypes: query.response.map((event) => event.type)
        }
      });
      order += 1;
    }

    const assistant = normalizeAssistantText(query);

    if (assistant.content) {
      messages.push({
        role: 'assistant' as const,
        content: assistant.content,
        order,
        externalId: `${query.message_id}:assistant`,
        metadata: {
          engineId: query.engine_id,
          citations: assistant.citations,
          sourceResponseTypes: assistant.responseTypes
        }
      });
      order += 1;
    }

    if (query.state === 'pending') {
      pending = true;
    }
  }

  const repoNames = Array.from(
    new Set(session.queries.flatMap((query) => query.repo_names ?? []).filter(Boolean))
  );
  const fallbackTitle = messages.find((message) => message.role === 'user')?.content ?? '未命名会话';
  const title = stripRelevantContext(session.title) || fallbackTitle;

  return {
    snapshot: {
      title,
      sourceUrl,
      sourceHost,
      sourceSessionId,
      metadata: {
        repoNames
      },
      messages,
      capturedAt: Date.now()
    },
    pending
  };
}
