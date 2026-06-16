import {
  buildCapturePayloadFromDeepWikiSession,
  fetchDeepWikiSession,
} from "../../api/deepwikiApi";
import type { DeepWikiQuerySession } from "../../api/deepwikiTypes";
import type {
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  ExportConversationMarkdownPayload,
  ExportConversationMarkdownResult,
} from "../../shared/messages";
import type { CaptureResult } from "../../shared/types";
import {
  buildMarkdownFilename,
  formatConversationAsMarkdown,
} from "../../shared/utils";
import {
  deleteConversation,
  getConversationDetail,
  getConversationMessages,
  listConversations,
  lookupConversationBySourceSessionId,
  upsertCapturedSession,
} from "../../storage/conversationRepository";
import {
  cacheTabStatus,
  notifyIfActiveTabChanged,
} from "./tabContext";

function getDurationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export async function captureViaApi(
  payload: CaptureDeepWikiSessionPayload,
): Promise<CaptureResult> {
  const requestStartedAt = performance.now();
  const fetchStartedAt = performance.now();
  const session: DeepWikiQuerySession = await fetchDeepWikiSession(
    payload.queryId,
  );
  const apiFetchMs = getDurationMs(fetchStartedAt);
  const transformStartedAt = performance.now();
  const { snapshot, pending } = buildCapturePayloadFromDeepWikiSession(
    session,
    payload.sourceUrl,
  );
  const apiTransformMs = getDurationMs(transformStartedAt);
  const persistStartedAt = performance.now();
  const result = await upsertCapturedSession(snapshot);
  const apiPersistMs = getDurationMs(persistStartedAt);

  const response: CaptureResult = {
    conversationId: result.conversationId,
    messageCount: result.messageCount,
    pending,
    method: "api",
    savedAt: snapshot.capturedAt,
    repoNames: snapshot.metadata?.repoNames,
    performance: {
      totalMs: getDurationMs(requestStartedAt),
      apiFetchMs,
      apiTransformMs,
      apiPersistMs,
    },
  };

  if (payload.tabId) {
    await cacheTabStatus(payload.tabId, payload.sourceUrl, {
      supported: true,
      active: pending,
      queryId: payload.queryId,
      sourceUrl: payload.sourceUrl,
      method: "api",
      lastCapturedAt: snapshot.capturedAt,
      pending,
      performance: response.performance,
    });
    await notifyIfActiveTabChanged(payload.tabId);
  }

  return response;
}

export async function captureViaDom(
  payload: CaptureDomSnapshotPayload,
): Promise<CaptureResult> {
  const requestStartedAt = performance.now();
  const result = await upsertCapturedSession(payload.snapshot);

  return {
    conversationId: result.conversationId,
    messageCount: result.messageCount,
    pending: false,
    method: "dom",
    savedAt: payload.snapshot.capturedAt,
    repoNames: payload.snapshot.metadata?.repoNames,
    performance: {
      totalMs: getDurationMs(requestStartedAt),
    },
  };
}

export async function list(keyword?: string) {
  return listConversations(keyword);
}

export async function detail(conversationId: string) {
  return getConversationDetail(conversationId);
}

export async function deleteOne(conversationId: string) {
  return deleteConversation(conversationId);
}

export async function lookupByQueryId(queryId: string) {
  return lookupConversationBySourceSessionId(queryId);
}

export async function exportMarkdown(
  payload: ExportConversationMarkdownPayload,
): Promise<ExportConversationMarkdownResult> {
  const detail = await getConversationDetail(payload.conversationId);

  if (!detail) {
    throw new Error("Conversation record not found.");
  }

  const messages = await getConversationMessages(payload.conversationId);
  const markdown = formatConversationAsMarkdown(detail.conversation, messages);
  const filename = buildMarkdownFilename(detail.conversation);

  return { markdown, filename };
}
