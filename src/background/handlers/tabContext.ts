import { extractQueryIdFromUrl } from "../../api/deepwikiApi";
import type {
  ActiveTabContextChangedPayload,
  ReportPageStatusPayload,
  RuntimeRequest,
  WikiPageStateChangedPayload,
} from "../../shared/messages";
import type {
  ActiveTabContext,
  CaptureStatus,
  WikiPageState,
  WikiPageTabState,
} from "../../shared/types";
import { isWikiPageUrl } from "../../shared/wikiUrl";
import { getWikiPageByUrl } from "../../storage/pageRepository";

const tabStatusCache = new Map<number, CaptureStatus>();
const wikiPageStateCache = new Map<number, WikiPageTabState>();

export function getWikiPageStateForUrl(
  url: string,
  pageId?: string,
  title?: string,
  state: WikiPageState = "not_saved",
): WikiPageTabState {
  return { url, pageId, title, state };
}

export async function cacheTabStatus(
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

export async function cacheWikiPageState(
  tabId: number,
  state?: WikiPageTabState | null,
): Promise<void> {
  if (state) {
    wikiPageStateCache.set(tabId, state);
  } else {
    wikiPageStateCache.delete(tabId);
  }
}

export function clearTabCaches(tabId: number): void {
  tabStatusCache.delete(tabId);
  wikiPageStateCache.delete(tabId);
}

export async function notifyActiveTabContextChanged(): Promise<void> {
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

export async function notifyIfActiveTabChanged(
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

export async function clearActiveTabBadge(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) return;

  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.action.setTitle({ tabId: tab.id, title: "Wikeep" });
}

export async function handleActiveTabChange(): Promise<void> {
  await clearActiveTabBadge();
  await notifyActiveTabContextChanged();
}

export async function reportPageStatus(
  sender: chrome.runtime.MessageSender,
  payload: ReportPageStatusPayload,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  await cacheTabStatus(tabId, sender.tab?.url, payload.status);
  await notifyIfActiveTabChanged(tabId);
}

export async function emitWikiPageStateChanged(
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

async function getPageStatus(tabId: number): Promise<CaptureStatus | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, {
      command: "GET_PAGE_STATUS",
    } satisfies RuntimeRequest)) as CaptureStatus | null;
  } catch {
    return tabStatusCache.get(tabId) ?? null;
  }
}

export async function getActiveTabContext(): Promise<ActiveTabContext> {
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

export async function openSidePanelForActiveTab(): Promise<void> {
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
