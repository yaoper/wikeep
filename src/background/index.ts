import {
  buildCapturePayloadFromDeepWikiSession,
  extractQueryIdFromUrl,
  fetchDeepWikiSession
} from '../api/deepwikiApi';
import type { DeepWikiQuerySession } from '../api/deepwikiTypes';
import type {
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  DeleteConversationPayload,
  GetConversationDetailPayload,
  ListConversationsPayload,
  LookupConversationByQueryIdPayload,
  RuntimeCommand,
  RuntimeRequest,
  RuntimeResponse,
  UpdateSettingsPayload
} from '../shared/messages';
import type { ActiveTabContext, CaptureResult, CaptureStatus } from '../shared/types';
import { ensureErrorMessage } from '../shared/utils';
import {
  clearAllData,
  deleteConversation,
  getConversationDetail,
  listConversations,
  lookupConversationBySourceSessionId,
  pruneLegacyConversationData,
  upsertCapturedSession
} from '../storage/conversationRepository';
import { ensureSettings, getSettings, updateSettings } from '../storage/settingsRepository';

function getDurationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function captureViaApi(payload: CaptureDeepWikiSessionPayload): Promise<CaptureResult> {
  const requestStartedAt = performance.now();
  const fetchStartedAt = performance.now();
  const session: DeepWikiQuerySession = await fetchDeepWikiSession(payload.queryId);
  const apiFetchMs = getDurationMs(fetchStartedAt);
  const transformStartedAt = performance.now();
  const { snapshot, pending } = buildCapturePayloadFromDeepWikiSession(session, payload.sourceUrl);
  const apiTransformMs = getDurationMs(transformStartedAt);
  const persistStartedAt = performance.now();
  const result = await upsertCapturedSession(snapshot);
  const apiPersistMs = getDurationMs(persistStartedAt);

  return {
    conversationId: result.conversationId,
    messageCount: result.messageCount,
    pending,
    method: 'api',
    savedAt: snapshot.capturedAt,
    performance: {
      totalMs: getDurationMs(requestStartedAt),
      apiFetchMs,
      apiTransformMs,
      apiPersistMs
    }
  };
}

async function captureViaDom(payload: CaptureDomSnapshotPayload): Promise<CaptureResult> {
  const requestStartedAt = performance.now();
  const result = await upsertCapturedSession(payload.snapshot);

  return {
    conversationId: result.conversationId,
    messageCount: result.messageCount,
    pending: false,
    method: 'dom',
    savedAt: payload.snapshot.capturedAt,
    performance: {
      totalMs: getDurationMs(requestStartedAt)
    }
  };
}

async function getPageStatus(tabId: number): Promise<CaptureStatus | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, {
      command: 'GET_PAGE_STATUS'
    } satisfies RuntimeRequest)) as CaptureStatus | null;
  } catch {
    return null;
  }
}

async function getActiveTabContext(): Promise<ActiveTabContext> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !tab.url) {
    return {
      supported: false
    };
  }

  const queryId = extractQueryIdFromUrl(tab.url) ?? undefined;
  const status = await getPageStatus(tab.id);

  return {
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
    supported: Boolean(queryId),
    queryId,
    status: status ?? undefined
  };
}

async function openSidePanelForActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    return;
  }

  await chrome.sidePanel.open({
    tabId: tab.id
  });
}

async function handleRuntimeCommand(
  command: RuntimeCommand,
  payload: unknown
): Promise<unknown> {
  switch (command) {
    case 'CAPTURE_DEEPWIKI_SESSION':
      return captureViaApi(payload as CaptureDeepWikiSessionPayload);
    case 'CAPTURE_DOM_SNAPSHOT':
      return captureViaDom(payload as CaptureDomSnapshotPayload);
    case 'LIST_CONVERSATIONS':
      return listConversations((payload as ListConversationsPayload | undefined)?.keyword);
    case 'GET_CONVERSATION_DETAIL':
      return getConversationDetail((payload as GetConversationDetailPayload).conversationId);
    case 'DELETE_CONVERSATION':
      return deleteConversation((payload as DeleteConversationPayload).conversationId);
    case 'CLEAR_ALL_DATA':
      return clearAllData();
    case 'GET_SETTINGS':
      return getSettings();
    case 'UPDATE_SETTINGS':
      return updateSettings((payload as UpdateSettingsPayload).patch);
    case 'GET_ACTIVE_TAB_CONTEXT':
      return getActiveTabContext();
    case 'OPEN_SIDE_PANEL':
      return openSidePanelForActiveTab();
    case 'LOOKUP_CAPTURE_BY_QUERY_ID':
      return lookupConversationBySourceSessionId((payload as LookupConversationByQueryIdPayload).queryId);
    default:
      throw new Error(`Unsupported runtime command: ${String(command)}`);
  }
}

async function initializeExtension(): Promise<void> {
  await ensureSettings();
  await pruneLegacyConversationData();
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeExtension();
});

void initializeExtension();

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  handleRuntimeCommand(request.command, request.payload)
    .then((data) => {
      const response: RuntimeResponse = {
        ok: true,
        data
      };
      sendResponse(response);
    })
    .catch((error: unknown) => {
      const response: RuntimeResponse = {
        ok: false,
        error: {
          code: 'RUNTIME_ERROR',
          message: ensureErrorMessage(error)
        }
      };
      sendResponse(response);
    });

  return true;
});
