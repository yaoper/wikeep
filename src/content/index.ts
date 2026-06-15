import { extractQueryIdFromUrl } from "../api/deepwikiApi";
import { parseDeepWikiDomSnapshot } from "../parser/deepwikiDomParser";
import {
  fingerprintWikiPage,
  parseWikiPage,
} from "../parser/deepwikiWikiParser";
import {
  CAPTURE_DEBOUNCE_MS,
  MAX_POLL_ATTEMPTS,
  PENDING_POLL_MS,
  SETTINGS_KEY,
} from "../shared/constants";
import type {
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  GetWikiPageSnapshotResult,
  LookupConversationByQueryIdPayload,
  ReportPageStatusPayload,
  RuntimeRequest,
  RuntimeResponse,
  SaveWikiPagePayload,
  WikiPageDetectedPayload,
} from "../shared/messages";
import type {
  CapturePerformance,
  CaptureResult,
  CaptureStatus,
  ExistingCaptureLookupResult,
  Settings,
} from "../shared/types";
import {
  debounce,
  ensureErrorMessage,
  sendRuntimeMessage,
} from "../shared/utils";
import { isWikiPageUrl } from "../shared/wikiUrl";

let currentStatus: CaptureStatus = {
  supported: false,
  active: false,
  reason: "idle",
};

let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
let pollingTimer: number | null = null;
let pollingAttempts = 0;
let isCapturing = false;
let wikiObserver: MutationObserver | null = null;
let latestRscRaw: { url: string; raw: string } | null = null;
let wikiMessageListenerRegistered = false;

interface RunCaptureOptions {
  force?: boolean;
}

interface DomCaptureOutcome {
  result: CaptureResult | null;
  domParseMs: number;
  domPersistMs?: number;
}

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

function getDurationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function buildPerformance(
  partial: Partial<CapturePerformance>,
  captureStartedAt: number,
): CapturePerformance {
  return {
    ...partial,
    totalMs: getDurationMs(captureStartedAt),
  };
}

function stopPolling(): void {
  if (pollingTimer) {
    window.clearInterval(pollingTimer);
    pollingTimer = null;
  }

  pollingAttempts = 0;
}

function clearDebounceTimer(): void {
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function disconnectObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function startPolling(queryId: string): void {
  if (pollingTimer) {
    return;
  }

  pollingTimer = window.setInterval(() => {
    pollingAttempts += 1;

    if (pollingAttempts > MAX_POLL_ATTEMPTS) {
      stopPolling();
      return;
    }

    void runCapture(queryId);
  }, PENDING_POLL_MS);
}

function stopAutoCapture(): void {
  disconnectObserver();
  clearDebounceTimer();
  stopPolling();
}

async function captureViaApi(queryId: string): Promise<CaptureResult> {
  return sendRuntimeMessage<CaptureResult, CaptureDeepWikiSessionPayload>(
    "CAPTURE_DEEPWIKI_SESSION",
    {
      queryId,
      sourceUrl: window.location.href,
    },
  );
}

async function lookupExistingCapture(
  queryId: string,
): Promise<ExistingCaptureLookupResult> {
  return sendRuntimeMessage<
    ExistingCaptureLookupResult,
    LookupConversationByQueryIdPayload
  >("LOOKUP_CAPTURE_BY_QUERY_ID", { queryId });
}

async function captureViaDom(): Promise<DomCaptureOutcome> {
  const domParseStartedAt = performance.now();
  const snapshot = parseDeepWikiDomSnapshot(document, window.location.href);
  const domParseMs = getDurationMs(domParseStartedAt);

  if (!snapshot) {
    return {
      result: null,
      domParseMs,
    };
  }

  const domPersistStartedAt = performance.now();
  const result = await sendRuntimeMessage<
    CaptureResult,
    CaptureDomSnapshotPayload
  >("CAPTURE_DOM_SNAPSHOT", {
    snapshot,
  });

  return {
    result,
    domParseMs,
    domPersistMs: getDurationMs(domPersistStartedAt),
  };
}

async function runCapture(
  queryId: string,
  options: RunCaptureOptions = {},
): Promise<void> {
  if (isCapturing) {
    return;
  }

  if (
    !options.force &&
    currentStatus.reason === "already_saved" &&
    currentStatus.queryId === queryId
  ) {
    return;
  }

  isCapturing = true;
  const captureStartedAt = performance.now();
  const shouldCheckExistingCapture =
    !options.force &&
    !(currentStatus.queryId === queryId && currentStatus.pending);
  let localLookupMs: number | undefined;
  let domParseMs: number | undefined;
  let domPersistMs: number | undefined;

  setStatus({
    supported: true,
    active: true,
    queryId,
    sourceUrl: window.location.href,
    method: undefined,
    pending: undefined,
    reason: undefined,
    errorMessage: undefined,
    performance: undefined,
    existingConversationId: undefined,
    repoNames: undefined,
  });

  try {
    if (shouldCheckExistingCapture) {
      const lookupStartedAt = performance.now();
      const existingCapture = await lookupExistingCapture(queryId);
      localLookupMs = getDurationMs(lookupStartedAt);

      if (existingCapture.exists) {
        stopAutoCapture();
        setStatus({
          active: false,
          method: undefined,
          lastCapturedAt: existingCapture.updatedAt,
          pending: false,
          reason: "already_saved",
          errorMessage: undefined,
          existingConversationId: existingCapture.conversationId,
          repoNames: existingCapture.repoNames,
          performance: buildPerformance({ localLookupMs }, captureStartedAt),
        });
        return;
      }
    }

    const domCapture = await captureViaDom();
    const domResult = domCapture.result;
    domParseMs = domCapture.domParseMs;
    domPersistMs = domCapture.domPersistMs;

    if (domResult) {
      setStatus({
        method: "dom",
        lastCapturedAt: domResult.savedAt,
        pending: false,
        reason: undefined,
        errorMessage: undefined,
        repoNames: domResult.repoNames,
        performance: buildPerformance(
          { localLookupMs, domParseMs, domPersistMs },
          captureStartedAt,
        ),
      });
    } else {
      setStatus({
        method: undefined,
        pending: false,
        reason: "dom_not_ready",
        performance: buildPerformance(
          { localLookupMs, domParseMs },
          captureStartedAt,
        ),
      });
    }

    try {
      const apiResult = await captureViaApi(queryId);
      const apiPerformance = apiResult.performance;

      setStatus({
        active: true,
        method: "api",
        lastCapturedAt: apiResult.savedAt,
        pending: apiResult.pending,
        reason: undefined,
        errorMessage: undefined,
        repoNames: apiResult.repoNames,
        performance: buildPerformance(
          {
            localLookupMs,
            domParseMs,
            domPersistMs,
            apiFetchMs: apiPerformance?.apiFetchMs,
            apiTransformMs: apiPerformance?.apiTransformMs,
            apiPersistMs: apiPerformance?.apiPersistMs,
          },
          captureStartedAt,
        ),
      });

      if (apiResult.pending) {
        disconnectObserver();
        clearDebounceTimer();
        startPolling(queryId);
      } else {
        stopAutoCapture();
      }
    } catch (error) {
      stopPolling();

      if (!domResult) {
        setStatus({
          active: false,
          method: undefined,
          reason: "api_fetch_failed",
          errorMessage: ensureErrorMessage(error),
          performance: buildPerformance(
            { localLookupMs, domParseMs },
            captureStartedAt,
          ),
        });
        return;
      }

      setStatus({
        active: true,
        pending: false,
        reason: "api_fetch_failed",
        errorMessage: ensureErrorMessage(error),
        performance: buildPerformance(
          { localLookupMs, domParseMs, domPersistMs },
          captureStartedAt,
        ),
      });
    }
  } catch (error) {
    setStatus({
      active: false,
      reason: "storage_error",
      errorMessage: ensureErrorMessage(error),
      performance: buildPerformance(
        { localLookupMs, domParseMs, domPersistMs },
        captureStartedAt,
      ),
    });
  } finally {
    isCapturing = false;
  }
}

function setupObserver(queryId: string): void {
  disconnectObserver();

  observer = new MutationObserver(() => {
    clearDebounceTimer();

    debounceTimer = window.setTimeout(() => {
      void runCapture(queryId);
    }, CAPTURE_DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
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

function handleWikiMessage(
  request: RuntimeRequest,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (r: RuntimeResponse<GetWikiPageSnapshotResult>) => void,
): boolean | void {
  if (
    request.command === "GET_WIKI_PAGE_SNAPSHOT" ||
    request.command === "SAVE_WIKI_PAGE"
  ) {
    void waitForRscRaw().then((rscRaw) => {
      const snapshot = parseWikiPage(document, location.href, rscRaw);
      sendResponse({ ok: true, data: { snapshot } });
    });
    return true;
  }
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

  if (!wikiMessageListenerRegistered) {
    chrome.runtime.onMessage.addListener(handleWikiMessage);
    wikiMessageListenerRegistered = true;
  }
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

  const settings = await sendRuntimeMessage<Settings>("GET_SETTINGS");

  if (!settings.autoCaptureEnabled) {
    setStatus({
      supported: true,
      active: false,
      queryId,
      sourceUrl: window.location.href,
      method: undefined,
      pending: false,
      reason: "auto_capture_disabled",
      errorMessage: undefined,
      performance: undefined,
      existingConversationId: undefined,
      repoNames: undefined,
    });
    return;
  }

  setupObserver(queryId);
  await runCapture(queryId);
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }

  const next = changes[SETTINGS_KEY].newValue as Settings | undefined;
  const queryId = extractQueryIdFromUrl(window.location.href);

  if (!queryId) {
    return;
  }

  if (!next?.autoCaptureEnabled) {
    stopAutoCapture();
    setStatus({
      supported: true,
      active: false,
      queryId,
      sourceUrl: window.location.href,
      method: undefined,
      pending: false,
      reason: "auto_capture_disabled",
      errorMessage: undefined,
      performance: undefined,
      existingConversationId: undefined,
      repoNames: undefined,
    });
    return;
  }

  setupObserver(queryId);
  void runCapture(queryId, { force: true });
});

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, _sender, sendResponse) => {
    if (request.command === "GET_PAGE_STATUS") {
      sendResponse(currentStatus);
      return true;
    }

    if (request.command === "TRIGGER_RECAPTURE") {
      const queryId = extractQueryIdFromUrl(window.location.href);

      if (!queryId) {
        sendResponse({
          ok: false,
          error: {
            code: "NOT_SUPPORTED",
            message: "This page cannot be recaptured.",
          },
        } satisfies RuntimeResponse);
        return true;
      }

      void runCapture(queryId, { force: true })
        .then(() => {
          sendResponse({ ok: true } satisfies RuntimeResponse);
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: {
              code: "CAPTURE_FAILED",
              message: ensureErrorMessage(error),
            },
          } satisfies RuntimeResponse);
        });

      return true;
    }

    return undefined;
  },
);

main();
