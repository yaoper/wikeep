import {
  buildCapturePayloadFromDeepWikiSession,
  extractQueryIdFromUrl,
  fetchDeepWikiSession
} from '../api/deepwikiApi';
import type { DeepWikiQuerySession } from '../api/deepwikiTypes';
import type {
  ActiveTabContextChangedPayload,
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  DeleteConversationPayload,
  GetConversationDetailPayload,
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
  getConversationDetail,
  listConversations,
  lookupConversationBySourceSessionId,
  pruneLegacyConversationData,
  upsertCapturedSession
} from '../storage/conversationRepository';
import { ensureSettings, getSettings, updateSettings } from '../storage/settingsRepository';

const tabStatusCache = new Map<number, CaptureStatus>();

function getDurationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function isStatusPending(status?: CaptureStatus): boolean {
  return Boolean(status?.pending || (status?.active && !status?.method));
}

function isStatusSaved(status?: CaptureStatus): boolean {
  return Boolean(status?.method === 'api' || status?.method === 'dom' || status?.reason === 'already_saved');
}

async function setActionBadgeForTab(tabId: number, url: string | undefined, status?: CaptureStatus): Promise<void> {
  const supported = Boolean(url && extractQueryIdFromUrl(url));
  let color = '#888780';
  let title = 'Wikeep';

  if (!supported) {
    title = 'Wikeep：非 DeepWiki 页面';
  } else if (isStatusPending(status)) {
    color = '#BA7517';
    title = 'Wikeep：Session 保存中';
  } else if (isStatusSaved(status)) {
    color = '#1D9E75';
    title = 'Wikeep：Session 已保存';
  } else {
    title = 'Wikeep：等待识别当前页面';
  }

  await chrome.action.setBadgeText({
    tabId,
    text: '●'
  });
  await chrome.action.setBadgeTextColor({
    tabId,
    color: '#FFFFFF'
  });
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color
  });
  await chrome.action.setTitle({
    tabId,
    title
  });
}

async function cacheTabStatus(tabId: number, url: string | undefined, status?: CaptureStatus | null): Promise<void> {
  if (status) {
    tabStatusCache.set(tabId, status);
  } else {
    tabStatusCache.delete(tabId);
  }

  await setActionBadgeForTab(tabId, url, status ?? undefined);
}

async function syncActiveTabBadge(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    return;
  }

  const status = await getPageStatus(tab.id);
  await cacheTabStatus(tab.id, tab.url, status ?? tabStatusCache.get(tab.id));
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

async function handleActiveTabChange(): Promise<void> {
  await syncActiveTabBadge();
  await notifyActiveTabContextChanged();
}

async function reportPageStatus(
  sender: chrome.runtime.MessageSender,
  payload: ReportPageStatusPayload
): Promise<void> {
  const tabId = sender.tab?.id;

  if (!tabId) {
    return;
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
