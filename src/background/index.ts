import {
  buildCapturePayloadFromDeepWikiSession,
  extractQueryIdFromUrl,
  fetchDeepWikiSession,
} from "../api/deepwikiApi";
import type { DeepWikiQuerySession } from "../api/deepwikiTypes";
import type {
  ActiveTabContextChangedPayload,
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  DeleteConversationPayload,
  DeleteWikiPagePayload,
  ExportConversationMarkdownPayload,
  ExportConversationMarkdownResult,
  ExportWikiPageMarkdownPayload,
  ExportWikiPageMarkdownResult,
  GetConversationDetailPayload,
  GetWikiPagePayload,
  GetWikiPageSnapshotResult,
  ImportDataPayload,
  ListConversationsPayload,
  ListWikiPagesPayload,
  LookupConversationByQueryIdPayload,
  RefreshWikiPagePayload,
  ReportPageStatusPayload,
  RuntimeCommand,
  RuntimeRequest,
  RuntimeResponse,
  SaveFullWikiPayload,
  SaveWikiPagePayload,
  SaveWikiPageResult,
  UpdateSettingsPayload,
  WikiPageDetectedPayload,
  WikiPageStateChangedPayload,
} from "../shared/messages";
import type {
  ActiveTabContext,
  CaptureResult,
  CaptureStatus,
  WikiPageState,
  WikiPageTabState,
} from "../shared/types";
import {
  buildMarkdownFilename,
  buildWikiPageMarkdownFilename,
  ensureErrorMessage,
  formatConversationAsMarkdown,
  formatWikiPageAsMarkdown,
} from "../shared/utils";
import {
  clearAllData,
  deleteConversation,
  exportAllData,
  getConversationDetail,
  getConversationMessages,
  importAllData,
  listConversations,
  lookupConversationBySourceSessionId,
  pruneLegacyConversationData,
  upsertCapturedSession,
} from "../storage/conversationRepository";
import {
  ensureSettings,
  getSettings,
  updateSettings,
} from "../storage/settingsRepository";
import {
  deleteWikiPage,
  getWikiPage,
  getWikiPageByUrl,
  listWikiPages,
  lookupWikiPageByUrl,
  markWikiPageStale,
  touchWikiPage,
  upsertWikiPage,
} from "../storage/pageRepository";
import { isWikiPageUrl } from "../shared/wikiUrl";

const tabStatusCache = new Map<number, CaptureStatus>();
const wikiPageStateCache = new Map<number, WikiPageTabState>();

function getDurationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function notifyActiveTabContextChanged(): Promise<void> {
  const context = await getActiveTabContext();

  try {
    await chrome.runtime.sendMessage({
      command: "ACTIVE_TAB_CONTEXT_CHANGED",
      payload: {
        context,
      } satisfies ActiveTabContextChangedPayload,
    } satisfies RuntimeRequest<ActiveTabContextChangedPayload>);
  } catch {
    // No side panel listener is attached.
  }
}

async function notifyIfActiveTabChanged(
  tabId: number | undefined,
): Promise<void> {
  if (!tabId) return;

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (tab?.id === tabId) {
    await notifyActiveTabContextChanged();
  }
}

async function cacheTabStatus(
  tabId: number,
  _url: string | undefined,
  status?: CaptureStatus | null,
): Promise<void> {
  if (status) {
    tabStatusCache.set(tabId, status);
  } else {
    tabStatusCache.delete(tabId);
  }
}

async function clearActiveTabBadge(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) return;

  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.action.setTitle({ tabId: tab.id, title: "Wikeep" });
}

async function handleActiveTabChange(): Promise<void> {
  await clearActiveTabBadge();
  await notifyActiveTabContextChanged();
}

async function reportPageStatus(
  sender: chrome.runtime.MessageSender,
  payload: ReportPageStatusPayload,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  await cacheTabStatus(tabId, sender.tab?.url, payload.status);
  await notifyIfActiveTabChanged(tabId);
}

async function captureViaApi(
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

async function captureViaDom(
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

function getWikiPageStateForUrl(
  url: string,
  pageId?: string,
  title?: string,
  state: WikiPageState = "not_saved",
): WikiPageTabState {
  return { url, pageId, title, state };
}

async function cacheWikiPageState(
  tabId: number,
  state?: WikiPageTabState | null,
): Promise<void> {
  if (state) {
    wikiPageStateCache.set(tabId, state);
  } else {
    wikiPageStateCache.delete(tabId);
  }
}

async function emitWikiPageStateChanged(
  tabId: number,
  state: WikiPageTabState,
): Promise<void> {
  await cacheWikiPageState(tabId, state);
  try {
    await chrome.runtime.sendMessage({
      command: "WIKI_PAGE_STATE_CHANGED",
      payload: state satisfies WikiPageStateChangedPayload,
    } satisfies RuntimeRequest<WikiPageStateChangedPayload>);
  } catch {
    // No panel listener.
  }
  await notifyIfActiveTabChanged(tabId);
}

async function requestWikiSnapshot(
  tabId: number,
  command: "GET_WIKI_PAGE_SNAPSHOT" | "GET_FULL_WIKI_SNAPSHOT",
): Promise<GetWikiPageSnapshotResult["snapshot"]> {
  const response = (await chrome.tabs.sendMessage(tabId, {
    command,
  } satisfies RuntimeRequest)) as RuntimeResponse<GetWikiPageSnapshotResult>;

  if (!response.ok) {
    throw new Error(
      response.error?.message ?? "Failed to get wiki page snapshot.",
    );
  }

  return response.data?.snapshot ?? null;
}

async function saveWikiPage(
  payload: SaveWikiPagePayload,
  options: { stateAfterSave?: WikiPageState } = {},
): Promise<SaveWikiPageResult> {
  const tabId = payload.tabId;
  const snapshot =
    payload.snapshot ??
    (tabId ? await requestWikiSnapshot(tabId, "GET_WIKI_PAGE_SNAPSHOT") : null);

  if (!snapshot) {
    throw new Error("Wiki page is not ready to save yet.");
  }

  const result = await upsertWikiPage(snapshot);

  if (tabId) {
    await emitWikiPageStateChanged(
      tabId,
      getWikiPageStateForUrl(
        snapshot.url,
        result.pageId,
        snapshot.title,
        options.stateAfterSave ?? "saved_fresh",
      ),
    );
  }

  return {
    pageId: result.pageId,
    changed: result.changed,
    created: result.created,
    title: snapshot.title,
  };
}

async function saveFullWiki(
  payload: SaveFullWikiPayload,
): Promise<SaveWikiPageResult> {
  const tabId = payload.tabId;
  const snapshot =
    payload.snapshot ??
    (tabId ? await requestWikiSnapshot(tabId, "GET_FULL_WIKI_SNAPSHOT") : null);

  if (!snapshot) {
    throw new Error(
      "Full wiki source is not ready. Reload the DeepWiki page and try again.",
    );
  }

  const result = await upsertWikiPage(snapshot);

  return {
    pageId: result.pageId,
    changed: result.changed,
    created: result.created,
    title: snapshot.title,
  };
}

async function resolveWikiRefreshTab(pageId: string): Promise<number> {
  const page = await getWikiPage(pageId);
  if (!page) {
    throw new Error("Saved wiki page not found.");
  }

  const tabs = await chrome.tabs.query({ url: page.url });
  const tabId = tabs.find((tab) => typeof tab.id === "number")?.id;
  if (!tabId) {
    throw new Error(
      "Open the wiki page in a browser tab first, then try again.",
    );
  }

  return tabId;
}

async function handleRefreshWikiPage(
  payload: RefreshWikiPagePayload,
  sender: chrome.runtime.MessageSender,
): Promise<SaveWikiPageResult> {
  const tabId =
    payload.tabId ??
    (payload.pageId
      ? await resolveWikiRefreshTab(payload.pageId)
      : sender.tab?.id);
  if (!tabId) {
    throw new Error("No tab available to refresh this wiki page.");
  }

  return saveWikiPage({ tabId }, { stateAfterSave: "updated" });
}

async function handleWikiPageDetected(
  sender: chrome.runtime.MessageSender,
  payload: WikiPageDetectedPayload,
): Promise<void> {
  const tabId = payload.tabId ?? sender.tab?.id;
  const url = payload.fingerprint.url;

  if (!tabId || !isWikiPageUrl(url)) {
    return;
  }

  const existing = await lookupWikiPageByUrl(url);

  if (!existing.exists) {
    await emitWikiPageStateChanged(
      tabId,
      getWikiPageStateForUrl(url, undefined, sender.tab?.title, "not_saved"),
    );
    return;
  }

  const state: WikiPageState =
    existing.contentHash === payload.fingerprint.contentHash &&
    existing.indexedCommit === payload.fingerprint.indexedCommit
      ? "saved_fresh"
      : "saved_stale";

  if (state === "saved_fresh") {
    await touchWikiPage(url);
    const page = await getWikiPage(existing.pageId!);
    await emitWikiPageStateChanged(
      tabId,
      getWikiPageStateForUrl(
        url,
        existing.pageId,
        page?.title ?? sender.tab?.title,
        state,
      ),
    );
    return;
  }

  const settings = await getSettings();
  if (settings.autoRefreshWikiPages) {
    try {
      await saveWikiPage({ tabId }, { stateAfterSave: "updated" });
      return;
    } catch {
      // fall through to stale marker if refresh fails
    }
  }

  await markWikiPageStale(url);
  const page = await getWikiPage(existing.pageId!);
  await emitWikiPageStateChanged(
    tabId,
    getWikiPageStateForUrl(
      url,
      existing.pageId,
      page?.title ?? sender.tab?.title,
      "saved_stale",
    ),
  );
}

async function exportWikiPageMarkdown(
  payload: ExportWikiPageMarkdownPayload,
): Promise<ExportWikiPageMarkdownResult> {
  const page = await getWikiPage(payload.pageId);
  if (!page) {
    throw new Error("Wiki page record not found.");
  }

  return {
    markdown: formatWikiPageAsMarkdown(page),
    filename: buildWikiPageMarkdownFilename(page),
  };
}

async function getPageStatus(tabId: number): Promise<CaptureStatus | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, {
      command: "GET_PAGE_STATUS",
    } satisfies RuntimeRequest)) as CaptureStatus | null;
  } catch {
    return tabStatusCache.get(tabId) ?? null;
  }
}

async function getActiveTabContext(): Promise<ActiveTabContext> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id || !tab.url) {
    return {
      supported: false,
    };
  }

  const queryId = extractQueryIdFromUrl(tab.url) ?? undefined;
  const isWiki = isWikiPageUrl(tab.url);
  const status = queryId ? await getPageStatus(tab.id) : null;
  const cachedWikiState = wikiPageStateCache.get(tab.id);
  const savedWikiPage = isWiki ? await getWikiPageByUrl(tab.url) : null;
  const wikiState = isWiki
    ? (cachedWikiState ??
      (savedWikiPage
        ? getWikiPageStateForUrl(
            tab.url,
            savedWikiPage.id,
            savedWikiPage.title,
            savedWikiPage.isStale ? "saved_stale" : "saved_fresh",
          )
        : getWikiPageStateForUrl(tab.url, undefined, tab.title, "not_saved")))
    : undefined;
  const derivedStatus =
    queryId && !status
      ? {
          supported: true,
          active: true,
          queryId,
          sourceUrl: tab.url,
          pending: true,
          reason: "idle" as const,
        }
      : (status ?? undefined);

  return {
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
    supported: Boolean(queryId || isWiki),
    routeKind: queryId ? "session" : isWiki ? "wiki" : "other",
    queryId,
    status: derivedStatus,
    wikiState,
  };
}

async function openSidePanelForActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    return;
  }

  await chrome.sidePanel.open({
    tabId: tab.id,
  });
}

async function exportConversationMarkdown(
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

async function handleRuntimeCommand(
  command: RuntimeCommand,
  payload: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (command) {
    case "CAPTURE_DEEPWIKI_SESSION":
      return captureViaApi({
        ...(payload as CaptureDeepWikiSessionPayload),
        tabId:
          (payload as CaptureDeepWikiSessionPayload).tabId ?? sender.tab?.id,
      });
    case "CAPTURE_DOM_SNAPSHOT":
      return captureViaDom(payload as CaptureDomSnapshotPayload);
    case "LIST_CONVERSATIONS":
      return listConversations(
        (payload as ListConversationsPayload | undefined)?.keyword,
      );
    case "GET_CONVERSATION_DETAIL":
      return getConversationDetail(
        (payload as GetConversationDetailPayload).conversationId,
      );
    case "DELETE_CONVERSATION":
      return deleteConversation(
        (payload as DeleteConversationPayload).conversationId,
      );
    case "CLEAR_ALL_DATA":
      return clearAllData();
    case "GET_SETTINGS":
      return getSettings();
    case "UPDATE_SETTINGS":
      return updateSettings((payload as UpdateSettingsPayload).patch);
    case "GET_ACTIVE_TAB_CONTEXT":
      return getActiveTabContext();
    case "OPEN_SIDE_PANEL":
      return openSidePanelForActiveTab();
    case "LOOKUP_CAPTURE_BY_QUERY_ID":
      return lookupConversationBySourceSessionId(
        (payload as LookupConversationByQueryIdPayload).queryId,
      );
    case "REPORT_PAGE_STATUS":
      return reportPageStatus(sender, payload as ReportPageStatusPayload);
    case "WIKI_PAGE_DETECTED":
      return handleWikiPageDetected(sender, payload as WikiPageDetectedPayload);
    case "SAVE_WIKI_PAGE":
      return saveWikiPage({
        ...(payload as SaveWikiPagePayload),
        tabId:
          (payload as SaveWikiPagePayload | undefined)?.tabId ?? sender.tab?.id,
      });
    case "SAVE_FULL_WIKI":
      return saveFullWiki({
        ...(payload as SaveFullWikiPayload),
        tabId:
          (payload as SaveFullWikiPayload | undefined)?.tabId ?? sender.tab?.id,
      });
    case "LIST_WIKI_PAGES":
      return listWikiPages(
        (payload as ListWikiPagesPayload | undefined)?.keyword,
      );
    case "GET_WIKI_PAGE":
      return getWikiPage((payload as GetWikiPagePayload).pageId);
    case "DELETE_WIKI_PAGE":
      return deleteWikiPage((payload as DeleteWikiPagePayload).pageId);
    case "REFRESH_WIKI_PAGE":
      return handleRefreshWikiPage(payload as RefreshWikiPagePayload, sender);
    case "EXPORT_WIKI_PAGE_MARKDOWN":
      return exportWikiPageMarkdown(payload as ExportWikiPageMarkdownPayload);
    case "ACTIVE_TAB_CONTEXT_CHANGED":
      return null;
    case "WIKI_PAGE_STATE_CHANGED":
      return null;
    case "EXPORT_DATA":
      return exportAllData();
    case "IMPORT_DATA":
      return importAllData((payload as ImportDataPayload).backup);
    case "EXPORT_CONVERSATION_MARKDOWN":
      return exportConversationMarkdown(
        payload as ExportConversationMarkdownPayload,
      );
    default:
      throw new Error(`Unsupported runtime command: ${String(command)}`);
  }
}

async function initializeExtension(): Promise<void> {
  await ensureSettings();
  await pruneLegacyConversationData();
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
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
  if (changeInfo.status === "loading" || changeInfo.url) {
    tabStatusCache.delete(tabId);
    wikiPageStateCache.delete(tabId);
  }

  if (tab.active && (changeInfo.status || changeInfo.url)) {
    void handleActiveTabChange();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatusCache.delete(tabId);
  wikiPageStateCache.delete(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    void handleActiveTabChange();
  }
});

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, sender, sendResponse) => {
    handleRuntimeCommand(request.command, request.payload, sender)
      .then((data) => {
        const response: RuntimeResponse = {
          ok: true,
          data,
        };
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const response: RuntimeResponse = {
          ok: false,
          error: {
            code: "RUNTIME_ERROR",
            message: ensureErrorMessage(error),
          },
        };
        sendResponse(response);
      });

    return true;
  },
);
