import type { CapturePayload, MessageCitation } from "../shared/types";
import { normalizeText } from "../shared/utils";
import type {
  DeepWikiChunkEvent,
  DeepWikiQuery,
  DeepWikiQuerySession,
  DeepWikiReferenceEvent,
} from "./deepwikiTypes";

const API_BASE_URL = "https://api.devin.ai";
const DEVIN_API_BASE_URL = "https://app.devin.ai";
const DEEPWIKI_HOST = "deepwiki.com";
const DEVIN_HOST = "app.devin.ai";
const RELEVANT_CONTEXT_PATTERN =
  /<relevant_context>[\s\S]*?<\/relevant_context>/gi;

export function extractQueryIdFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);

    // Both DeepWiki and Devin use /search/<queryId>; the same session API
    // (different host/auth) serves both.
    if (parsedUrl.host !== DEEPWIKI_HOST && parsedUrl.host !== DEVIN_HOST) {
      return null;
    }

    const match = parsedUrl.pathname.match(/^\/search\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface DevinSessionAuth {
  token: string;
  orgId?: string;
}

/**
 * Fetch a Devin session. Unlike DeepWiki's public endpoint, this is the
 * authenticated app endpoint and requires the user's bearer token (read from
 * the page's localStorage by the content script).
 */
export async function fetchDevinSession(
  queryId: string,
  auth: DevinSessionAuth,
): Promise<DeepWikiQuerySession> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${auth.token}`,
  };
  if (auth.orgId) {
    headers["x-cog-org-id"] = auth.orgId;
  }

  const response = await fetch(
    `${DEVIN_API_BASE_URL}/api/ada/query/${queryId}`,
    { headers, credentials: "include" },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Devin session: ${response.status}`);
  }

  return (await response.json()) as DeepWikiQuerySession;
}

export function stripRelevantContext(value: string): string {
  return normalizeText(value.replace(RELEVANT_CONTEXT_PATTERN, ""));
}

function isChunkEvent(
  event: DeepWikiQuery["response"][number],
): event is DeepWikiChunkEvent {
  return event.type === "chunk" && typeof event.data === "string";
}

function isReferenceEvent(
  event: DeepWikiQuery["response"][number],
): event is DeepWikiReferenceEvent {
  return (
    event.type === "reference" &&
    typeof event.data === "object" &&
    event.data !== null &&
    "file_path" in event.data &&
    "range_start" in event.data &&
    "range_end" in event.data
  );
}

function normalizeAssistantText(query: DeepWikiQuery): {
  content: string;
  citations: MessageCitation[];
  responseTypes: string[];
  hasDiagram: boolean;
} {
  const visibleParts: string[] = [];
  const allChunks: string[] = [];
  const citations: MessageCitation[] = [];
  const responseTypes = new Set<string>();
  let inThoughts = false;

  for (const event of query.response) {
    responseTypes.add(event.type);

    if (event.type === "thoughts_start") {
      inThoughts = true;
      continue;
    }

    if (event.type === "thoughts_end") {
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
        rangeEnd: event.data.range_end,
      });
    }
  }

  let content = normalizeText(visibleParts.join(""));

  if (!content) {
    const fallback = allChunks.join("");
    const splitBySearchMarker = fallback.split("\n> Searching codebase...\n");
    content = normalizeText(splitBySearchMarker.at(-1) ?? fallback);
  }

  return {
    content,
    citations,
    responseTypes: [...responseTypes],
    hasDiagram: /```mermaid/.test(content),
  };
}

export async function fetchDeepWikiSession(
  queryId: string,
): Promise<DeepWikiQuerySession> {
  const response = await fetch(`${API_BASE_URL}/ada/query/${queryId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch DeepWiki session: ${response.status}`);
  }

  return (await response.json()) as DeepWikiQuerySession;
}

export function buildCapturePayloadFromDeepWikiSession(
  session: DeepWikiQuerySession,
  sourceUrl: string,
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
        role: "user" as const,
        content: userQuery,
        order,
        externalId: `${query.message_id}:user`,
        metadata: {
          engineId: query.engine_id,
          sourceResponseTypes: query.response.map((event) => event.type),
        },
      });
      order += 1;
    }

    const assistant = normalizeAssistantText(query);

    if (assistant.content) {
      messages.push({
        role: "assistant" as const,
        content: assistant.content,
        order,
        externalId: `${query.message_id}:assistant`,
        metadata: {
          engineId: query.engine_id,
          citations: assistant.citations,
          sourceResponseTypes: assistant.responseTypes,
          hasDiagram: assistant.hasDiagram,
        },
      });
      order += 1;
    }

    if (query.state === "pending") {
      pending = true;
    }
  }

  const repoNames = Array.from(
    new Set(
      session.queries
        .flatMap((query) => query.repo_names ?? [])
        .filter(Boolean),
    ),
  );
  const fallbackTitle =
    messages.find((message) => message.role === "user")?.content ??
    "Untitled conversation";
  const title = stripRelevantContext(session.title) || fallbackTitle;

  return {
    snapshot: {
      title,
      sourceUrl,
      sourceHost,
      sourceSessionId,
      metadata: {
        repoNames,
      },
      messages,
      capturedAt: Date.now(),
    },
    pending,
  };
}
