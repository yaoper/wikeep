import type {
  ExportWikiPageMarkdownPayload,
  ExportWikiPageMarkdownResult,
  GetWikiPageSnapshotResult,
  RefreshWikiPagePayload,
  RuntimeRequest,
  RuntimeResponse,
  SaveFullWikiPayload,
  SaveWikiPagePayload,
  SaveWikiPageResult,
  WikiPageDetectedPayload,
} from "../../shared/messages";
import type { WikiPageState } from "../../shared/types";
import {
  buildWikiPageMarkdownFilename,
  formatWikiPageAsMarkdown,
} from "../../shared/utils";
import { isWikiPageUrl } from "../../shared/wikiUrl";
import {
  deleteWikiPage,
  getWikiPage,
  listWikiPages,
  lookupWikiPageByUrl,
  markWikiPageStale,
  touchWikiPage,
  upsertWikiPage,
} from "../../storage/pageRepository";
import { getSettings } from "../../storage/settingsRepository";
import {
  emitWikiPageStateChanged,
  getWikiPageStateForUrl,
} from "./tabContext";

async function requestWikiSnapshot(
  tabId: number,
  command: "GET_WIKI_PAGE_SNAPSHOT" | "GET_FULL_WIKI_SNAPSHOT",
): Promise<GetWikiPageSnapshotResult["snapshot"]> {
  const response = (await chrome.tabs.sendMessage(tabId, {
    command,
  } satisfies RuntimeRequest)) as RuntimeResponse<GetWikiPageSnapshotResult>;

  // Keep the guard: a missing response means the content script never replied.
  if (!response) {
    throw new Error(
      chrome.runtime.lastError?.message ?? "No response from content script.",
    );
  }

  if (!response.ok) {
    throw new Error(
      response.error?.message ?? "Failed to get wiki page snapshot.",
    );
  }

  return response.data?.snapshot ?? null;
}

export async function save(
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

export async function saveFull(
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

export async function refresh(
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

  return save({ tabId }, { stateAfterSave: "updated" });
}

export async function detected(
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
      await save({ tabId }, { stateAfterSave: "updated" });
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

export async function exportMarkdown(
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

export async function list(keyword?: string) {
  return listWikiPages(keyword);
}

export async function get(pageId: string) {
  return getWikiPage(pageId);
}

export async function deleteOne(pageId: string) {
  return deleteWikiPage(pageId);
}
