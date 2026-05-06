import {
  buildCapturePayloadFromDeepWikiSession,
  extractQueryIdFromUrl,
  fetchDeepWikiSession
} from '../api/deepwikiApi';
import type { DeepWikiQuerySession } from '../api/deepwikiTypes';
import { MAX_POLL_ATTEMPTS, PENDING_POLL_MS } from '../shared/constants';
import type {
  ActiveTabContextChangedPayload,
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  DeleteConversationPayload,
  GetConversationDetailPayload,
  ImportDataPayload,
  ListConversationsPayload,
  LookupConversationByQueryIdPayload,
  ReportPageStatusPayload,
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
  exportAllData,
  getConversationDetail,
  importAllData,
  listConversations,
  lookupConversationBySourceSessionId,
  pruneLegacyConversationData,
  upsertCapturedSession
} from '../storage/conversationRepository';
import { ensureSettings, getSettings, updateSettings } from '../storage/settingsRepository';

const tabStatusCache = new Map<number, CaptureStatus>();
const backgroundCaptureTimers = new Map<number, ReturnType<typeof setInterval>>();
const backgroundCaptureAttempts = new Map<number, number>();
const backgroundCaptureInFlight = new Set<number>();

function getDurationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function clearActionBadgeForTab(tabId: number): Promise<void> {
  await chrome.action.setBadgeText({
    tabId,
    text: ''
  });
  await chrome.action.setTitle({
    tabId,
    title: 'Wikeep'
  });
}

async function cacheTabStatus(tabId: number, url: string | undefined, status?: CaptureStatus | null): Promise<void> {
  if (status) {
    tabStatusCache.set(tabId, status);
  } else {
    tabStatusCache.delete(tabId);
  }
}

function stopBackgroundCapturePolling(tabId: number): void {
  const timer = backgroundCaptureTimers.get(tabId);

  if (timer) {
    clearInterval(timer);
    backgroundCaptureTimers.delete(tabId);
  }

  backgroundCaptureAttempts.delete(tabId);
}

async function clearActiveTabBadge(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    return;
  }

  await clearActionBadgeForTab(tab.id);
}

async function notifyActiveTabContextChanged(): Promise<void> {
  const context = await getActiveTabContext();

  try {
    await chrome.runtime.sendMessage({
      command: 'ACTIVE_TAB_CONTEXT_CHANGED',
      payload: {
        context
      } satisfies ActiveTabContextChangedPayload
    } satisfies RuntimeRequest<ActiveTabContextChangedPayload>);
  } catch {
    // No side panel listener is attached.
  }
}

async function notifyIfActiveTabChanged(tabId: number | undefined): Promise<void> {
  if (!tabId) {
    return;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (tab?.id === tabId) {
    await notifyActiveTabContextChanged();
  }
}

async function runBackgroundFallbackCapture(tabId: number, sourceUrl: string, queryId: string): Promise<void> {
  if (backgroundCaptureInFlight.has(tabId)) {
    return;
  }

  backgroundCaptureInFlight.add(tabId);

  try {
    const settings = await getSettings();

    if (!settings.autoCaptureEnabled) {
      stopBackgroundCapturePolling(tabId);
      await cacheTabStatus(tabId, sourceUrl, {
        supported: true,
        active: false,
        queryId,
        sourceUrl,
        pending: false,
        reason: 'auto_capture_disabled'
      });
      await notifyIfActiveTabChanged(tabId);
      return;
    }

    const existingCapture = await lookupConversationBySourceSessionId(queryId);

    if (existingCapture.exists) {
      stopBackgroundCapturePolling(tabId);
      await cacheTabStatus(tabId, sourceUrl, {
        supported: true,
        active: false,
        queryId,
        sourceUrl,
        pending: false,
        reason: 'already_saved',
        existingConversationId: existingCapture.conversationId,
        lastCapturedAt: existingCapture.updatedAt,
        repoNames: existingCapture.repoNames
      });
      await notifyIfActiveTabChanged(tabId);
      return;
    }

    const result = await captureViaApi({
      queryId,
      sourceUrl,
      tabId
    });

    if (!result.pending) {
      stopBackgroundCapturePolling(tabId);
    }
  } catch (error) {
    stopBackgroundCapturePolling(tabId);
    await cacheTabStatus(tabId, sourceUrl, {
      supported: true,
      active: false,
      queryId,
      sourceUrl,
      pending: false,
      reason: 'api_fetch_failed',
      errorMessage: ensureErrorMessage(error)
    });
    await notifyIfActiveTabChanged(tabId);
  } finally {
    backgroundCaptureInFlight.delete(tabId);
  }
}

function startBackgroundCapturePolling(tabId: number, sourceUrl: string, queryId: string): void {
  if (backgroundCaptureTimers.has(tabId)) {
    return;
  }

  backgroundCaptureAttempts.set(tabId, 0);

  const timer = setInterval(() => {
    const attempts = (backgroundCaptureAttempts.get(tabId) ?? 0) + 1;
    backgroundCaptureAttempts.set(tabId, attempts);

    if (attempts > MAX_POLL_ATTEMPTS) {
      stopBackgroundCapturePolling(tabId);
      return;
    }

    void runBackgroundFallbackCapture(tabId, sourceUrl, queryId);
  }, PENDING_POLL_MS);

  backgroundCaptureTimers.set(tabId, timer);
}

async function ensureActiveTabCaptureProgress(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !tab.url) {
    return;
  }

  const queryId = extractQueryIdFromUrl(tab.url);

  if (!queryId) {
    stopBackgroundCapturePolling(tab.id);
    return;
  }

  const status = await getPageStatus(tab.id);

  if (status) {
    return;
  }

  await cacheTabStatus(tab.id, tab.url, {
    supported: true,
    active: true,
    queryId,
    sourceUrl: tab.url,
    pending: true,
    reason: 'idle'
  });
  await notifyIfActiveTabChanged(tab.id);
  await runBackgroundFallbackCapture(tab.id, tab.url, queryId);
}

async function handleActiveTabChange(): Promise<void> {
  await clearActiveTabBadge();
  await notifyActiveTabContextChanged();
  await ensureActiveTabCaptureProgress();
}

async function reportPageStatus(
  sender: chrome.runtime.MessageSender,
  payload: ReportPageStatusPayload
): Promise<void> {
  const tabId = sender.tab?.id;

  if (!tabId) {
    return;
  }

  if (payload.status.reason !== 'idle') {
    stopBackgroundCapturePolling(tabId);
  }

  await cacheTabStatus(tabId, sender.tab?.url, payload.status);
  await notifyIfActiveTabChanged(tabId);
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

  const response: CaptureResult = {
    conversationId: result.conversationId,
    messageCount: result.messageCount,
    pending,
    method: 'api',
    savedAt: snapshot.capturedAt,
    repoNames: snapshot.metadata?.repoNames,
    performance: {
      totalMs: getDurationMs(requestStartedAt),
      apiFetchMs,
      apiTransformMs,
      apiPersistMs
    }
  };

  if (payload.tabId) {
    await cacheTabStatus(payload.tabId, payload.sourceUrl, {
      supported: true,
      active: pending,
      queryId: payload.queryId,
      sourceUrl: payload.sourceUrl,
      method: 'api',
      lastCapturedAt: snapshot.capturedAt,
      pending,
      performance: response.performance
    });
    await notifyIfActiveTabChanged(payload.tabId);

    if (pending) {
      startBackgroundCapturePolling(payload.tabId, payload.sourceUrl, payload.queryId);
    } else {
      stopBackgroundCapturePolling(payload.tabId);
    }
  }

  return response;
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
    repoNames: payload.snapshot.metadata?.repoNames,
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
    return tabStatusCache.get(tabId) ?? null;
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
  const derivedStatus = queryId && !status
    ? {
        supported: true,
        active: true,
        queryId,
        sourceUrl: tab.url,
        pending: true,
        reason: 'idle' as const
      }
    : status ?? undefined;

  return {
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
    supported: Boolean(queryId),
    queryId,
    status: derivedStatus
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
  payload: unknown,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (command) {
    case 'CAPTURE_DEEPWIKI_SESSION':
      return captureViaApi({
        ...(payload as CaptureDeepWikiSessionPayload),
        tabId: (payload as CaptureDeepWikiSessionPayload).tabId ?? sender.tab?.id
      });
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
    case 'REPORT_PAGE_STATUS':
      return reportPageStatus(sender, payload as ReportPageStatusPayload);
    case 'ACTIVE_TAB_CONTEXT_CHANGED':
      return null;
    case 'EXPORT_DATA':
      return exportAllData();
    case 'IMPORT_DATA':
      return importAllData((payload as ImportDataPayload).backup);
    default:
      throw new Error(`Unsupported runtime command: ${String(command)}`);
  }
}

async function initializeExtension(): Promise<void> {
  await ensureSettings();
  await pruneLegacyConversationData();
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
  await handleActiveTabChange();
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeExtension();
});

void initializeExtension();

chrome.tabs.onActivated.addListener(() => {
  void handleActiveTabChange();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    tabStatusCache.delete(tabId);
  }

  if (tab.active && (changeInfo.status || changeInfo.url)) {
    void handleActiveTabChange();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatusCache.delete(tabId);
  stopBackgroundCapturePolling(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    void handleActiveTabChange();
  }
});

chrome.runtime.onMessage.addListener((request: RuntimeRequest, sender, sendResponse) => {
  handleRuntimeCommand(request.command, request.payload, sender)
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
