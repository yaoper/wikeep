import { extractQueryIdFromUrl } from "../api/deepwikiApi";
import {
  fingerprintWikiPage,
  parseFullWiki,
  parseWikiPage,
} from "../parser/deepwikiWikiParser";
import { SETTINGS_KEY } from "../shared/constants";
import type {
  CaptureDeepWikiSessionPayload,
  GetWikiPageSnapshotResult,
  ReportPageStatusPayload,
  RuntimeRequest,
  RuntimeResponse,
  WikiPageDetectedPayload,
} from "../shared/messages";
import type { CaptureResult, CaptureStatus, Settings } from "../shared/types";
import { debounce, ensureErrorMessage, sendRuntimeMessage } from "../shared/utils";
import { isWikiPageUrl } from "../shared/wikiUrl";

let currentStatus: CaptureStatus = {
  supported: false,
  active: false,
  reason: "idle",
};

let wikiObserver: MutationObserver | null = null;
let latestRscRaw: { url: string; raw: string } | null = null;
let messageListenerRegistered = false;
let isCapturing = false;

function setStatus(partial: Partial<CaptureStatus>): void {
  currentStatus = {
    ...currentStatus,
    ...partial,
  };

  void chrome.runtime
    .sendMessage({
      command: "REPORT_PAGE_STATUS",
      payload: {
        status: currentStatus,
      } satisfies ReportPageStatusPayload,
    } satisfies RuntimeRequest<ReportPageStatusPayload>)
    .catch(() => undefined);
}

async function loadSettings(): Promise<Settings> {
  try {
    return await sendRuntimeMessage<Settings>("GET_SETTINGS");
  } catch {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    return stored[SETTINGS_KEY] as Settings;
  }
}

async function captureSession(queryId: string, force = false): Promise<CaptureStatus> {
  if (isCapturing) return currentStatus;
  isCapturing = true;

  setStatus({
    supported: true,
    active: true,
    queryId,
    sourceUrl: window.location.href,
    method: undefined,
    pending: true,
    reason: "idle",
    errorMessage: undefined,
    performance: undefined,
    existingConversationId: undefined,
    repoNames: undefined,
  });

  try {
    const settings = await loadSettings();
    if (!force && !settings.autoCaptureEnabled) {
      setStatus({
        active: false,
        pending: false,
        reason: "auto_capture_disabled",
      });
      return currentStatus;
    }

    const result = await sendRuntimeMessage<
      CaptureResult,
      CaptureDeepWikiSessionPayload
    >("CAPTURE_DEEPWIKI_SESSION", {
      queryId,
      sourceUrl: window.location.href,
    });

    setStatus({
      active: result.pending,
      method: result.method,
      lastCapturedAt: result.savedAt,
      pending: result.pending,
      reason: undefined,
      errorMessage: undefined,
      repoNames: result.repoNames,
      performance: result.performance,
    });
  } catch (error) {
    setStatus({
      active: false,
      pending: false,
      reason: "api_fetch_failed",
      errorMessage: ensureErrorMessage(error),
    });
  } finally {
    isCapturing = false;
  }

  return currentStatus;
}

async function waitForRscRaw(timeoutMs = 1200): Promise<string | null> {
  if (latestRscRaw?.url === location.href) {
    return latestRscRaw.raw;
  }

  window.postMessage({ source: "wikeep-rsc-request" }, location.origin);

  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (latestRscRaw?.url === location.href) {
        window.clearInterval(timer);
        resolve(latestRscRaw.raw);
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, 100);
  });
}

function handleRuntimeMessage(
  request: RuntimeRequest,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (r: RuntimeResponse | CaptureStatus | null) => void,
): boolean | void {
  if (request.command === "GET_PAGE_STATUS") {
    sendResponse(currentStatus);
    return;
  }

  if (request.command === "TRIGGER_RECAPTURE") {
    const queryId = extractQueryIdFromUrl(window.location.href);
    if (!queryId) {
      sendResponse(null);
      return;
    }

    void captureSession(queryId, true).then((status) => {
      sendResponse({ ok: true, data: status } satisfies RuntimeResponse);
    });
    return true;
  }

  if (
    request.command === "GET_WIKI_PAGE_SNAPSHOT" ||
    request.command === "SAVE_WIKI_PAGE"
  ) {
    void waitForRscRaw().then((rscRaw) => {
      const snapshot = parseWikiPage(document, location.href, rscRaw);
      sendResponse({ ok: true, data: { snapshot } satisfies GetWikiPageSnapshotResult });
    });
    return true;
  }

  if (
    request.command === "GET_FULL_WIKI_SNAPSHOT" ||
    request.command === "SAVE_FULL_WIKI"
  ) {
    void waitForRscRaw(2500).then((rscRaw) => {
      const snapshot = parseFullWiki(document, location.href, rscRaw);
      sendResponse({ ok: true, data: { snapshot } satisfies GetWikiPageSnapshotResult });
    });
    return true;
  }
}

function ensureMessageListener(): void {
  if (messageListenerRegistered) return;
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  messageListenerRegistered = true;
}

function reportWikiFingerprint(): void {
  const fp = fingerprintWikiPage(document, location.href);
  if (!fp) return;

  void sendRuntimeMessage<void, WikiPageDetectedPayload>("WIKI_PAGE_DETECTED", {
    fingerprint: { url: location.href, ...fp },
  }).catch(() => undefined);
}

function initWikiPageMode(): void {
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data as { source?: string; url?: string; raw?: string };
    if (data?.source === "wikeep-rsc" && data.url && data.raw) {
      latestRscRaw = { url: data.url, raw: data.raw };
    }
  });

  reportWikiFingerprint();
  wikiObserver?.disconnect();
  wikiObserver = new MutationObserver(debounce(reportWikiFingerprint, 600));
  wikiObserver.observe(document.body, { childList: true, subtree: true });

  ensureMessageListener();
}

async function initSessionMode(): Promise<void> {
  const queryId = extractQueryIdFromUrl(window.location.href);

  if (!queryId) {
    setStatus({
      supported: false,
      active: false,
      reason: "not_deepwiki_page",
      sourceUrl: window.location.href,
      method: undefined,
      pending: false,
      errorMessage: undefined,
      performance: undefined,
      existingConversationId: undefined,
      repoNames: undefined,
    });
    return;
  }

  ensureMessageListener();
  await captureSession(queryId);
}

function main(): void {
  const url = location.href;

  if (url.includes("/search/")) {
    void initSessionMode();
    return;
  }

  if (isWikiPageUrl(url)) {
    initWikiPageMode();
    return;
  }

  setStatus({
    supported: false,
    active: false,
    reason: "not_deepwiki_page",
    sourceUrl: window.location.href,
    method: undefined,
    pending: false,
    errorMessage: undefined,
    performance: undefined,
    existingConversationId: undefined,
    repoNames: undefined,
  });
}

main();
