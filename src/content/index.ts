import { extractQueryIdFromUrl } from '../api/deepwikiApi';
import { parseDeepWikiDomSnapshot } from '../parser/deepwikiDomParser';
import {
  CAPTURE_DEBOUNCE_MS,
  DEFAULT_SETTINGS,
  MAX_POLL_ATTEMPTS,
  PENDING_POLL_MS,
  SETTINGS_KEY
} from '../shared/constants';
import type {
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  LookupConversationByQueryIdPayload,
  ReportPageStatusPayload,
  RuntimeRequest,
  RuntimeResponse
} from '../shared/messages';
import type {
  CapturePerformance,
  CaptureResult,
  CaptureStatus,
  ExistingCaptureLookupResult,
  Settings
} from '../shared/types';
import { ensureErrorMessage, sendRuntimeMessage } from '../shared/utils';

let currentStatus: CaptureStatus = {
  supported: false,
  active: false,
  reason: 'idle'
};

let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
let pollingTimer: number | null = null;
let pollingAttempts = 0;
let isCapturing = false;

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
    ...partial
  };

  void chrome.runtime
    .sendMessage({
      command: 'REPORT_PAGE_STATUS',
      payload: {
        status: currentStatus
      } satisfies ReportPageStatusPayload
    } satisfies RuntimeRequest<ReportPageStatusPayload>)
    .catch(() => undefined);
}

function getDurationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function buildPerformance(
  partial: Partial<CapturePerformance>,
  captureStartedAt: number
): CapturePerformance {
  return {
    ...partial,
    totalMs: getDurationMs(captureStartedAt)
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
  return sendRuntimeMessage<CaptureResult, CaptureDeepWikiSessionPayload>('CAPTURE_DEEPWIKI_SESSION', {
    queryId,
    sourceUrl: window.location.href
  });
}

async function lookupExistingCapture(queryId: string): Promise<ExistingCaptureLookupResult> {
  return sendRuntimeMessage<ExistingCaptureLookupResult, LookupConversationByQueryIdPayload>(
    'LOOKUP_CAPTURE_BY_QUERY_ID',
    { queryId }
  );
}

async function captureViaDom(): Promise<DomCaptureOutcome> {
  const domParseStartedAt = performance.now();
  const snapshot = parseDeepWikiDomSnapshot(document, window.location.href);
  const domParseMs = getDurationMs(domParseStartedAt);

  if (!snapshot) {
    return {
      result: null,
      domParseMs
    };
  }

  const domPersistStartedAt = performance.now();
  const result = await sendRuntimeMessage<CaptureResult, CaptureDomSnapshotPayload>('CAPTURE_DOM_SNAPSHOT', {
    snapshot
  });

  return {
    result,
    domParseMs,
    domPersistMs: getDurationMs(domPersistStartedAt)
  };
}

async function runCapture(queryId: string, options: RunCaptureOptions = {}): Promise<void> {
  if (isCapturing) {
    return;
  }

  if (!options.force && currentStatus.reason === 'already_saved' && currentStatus.queryId === queryId) {
    return;
  }

  isCapturing = true;
  const captureStartedAt = performance.now();
  const shouldCheckExistingCapture = !options.force && !(currentStatus.queryId === queryId && currentStatus.pending);
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
    repoNames: undefined
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
          reason: 'already_saved',
          errorMessage: undefined,
          existingConversationId: existingCapture.conversationId,
          repoNames: existingCapture.repoNames,
          performance: buildPerformance({ localLookupMs }, captureStartedAt)
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
        method: 'dom',
        lastCapturedAt: domResult.savedAt,
        pending: false,
        reason: undefined,
        errorMessage: undefined,
        repoNames: domResult.repoNames,
        performance: buildPerformance({ localLookupMs, domParseMs, domPersistMs }, captureStartedAt)
      });
    } else {
      setStatus({
        method: undefined,
        pending: false,
        reason: 'dom_not_ready',
        performance: buildPerformance({ localLookupMs, domParseMs }, captureStartedAt)
      });
    }

    try {
      const apiResult = await captureViaApi(queryId);
      const apiPerformance = apiResult.performance;

      setStatus({
        active: true,
        method: 'api',
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
            apiPersistMs: apiPerformance?.apiPersistMs
          },
          captureStartedAt
        )
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
          reason: 'api_fetch_failed',
          errorMessage: ensureErrorMessage(error),
          performance: buildPerformance({ localLookupMs, domParseMs }, captureStartedAt)
        });
        return;
      }

      setStatus({
        active: true,
        pending: false,
        reason: 'api_fetch_failed',
        errorMessage: ensureErrorMessage(error),
        performance: buildPerformance({ localLookupMs, domParseMs, domPersistMs }, captureStartedAt)
      });
    }
  } catch (error) {
    setStatus({
      active: false,
      reason: 'storage_error',
      errorMessage: ensureErrorMessage(error),
      performance: buildPerformance({ localLookupMs, domParseMs, domPersistMs }, captureStartedAt)
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
    subtree: true
  });
}

async function init(): Promise<void> {
  const queryId = extractQueryIdFromUrl(window.location.href);

  if (!queryId) {
    setStatus({
      supported: false,
      active: false,
      reason: 'not_deepwiki_page',
      sourceUrl: window.location.href,
      method: undefined,
      pending: false,
      errorMessage: undefined,
      performance: undefined,
      existingConversationId: undefined,
      repoNames: undefined
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
    reason: 'idle',
    errorMessage: undefined,
    performance: undefined,
    existingConversationId: undefined,
    repoNames: undefined
  });

  const settings = await sendRuntimeMessage<Settings>('GET_SETTINGS');

  if (!settings.autoCaptureEnabled) {
    setStatus({
      supported: true,
      active: false,
      queryId,
      sourceUrl: window.location.href,
      method: undefined,
      pending: false,
      reason: 'auto_capture_disabled',
      errorMessage: undefined,
      performance: undefined,
      existingConversationId: undefined,
      repoNames: undefined
    });
    return;
  }

  setupObserver(queryId);
  await runCapture(queryId);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[SETTINGS_KEY]) {
    return;
  }

  const queryId = extractQueryIdFromUrl(window.location.href);

  if (!queryId) {
    return;
  }

  const nextSettings = changes[SETTINGS_KEY].newValue as Settings | undefined;

  if (!nextSettings?.autoCaptureEnabled && nextSettings?.autoCaptureEnabled !== undefined) {
    stopAutoCapture();
    setStatus({
      supported: true,
      active: false,
      queryId,
      sourceUrl: window.location.href,
      method: undefined,
      pending: false,
      reason: 'auto_capture_disabled',
      errorMessage: undefined,
      performance: undefined,
      existingConversationId: undefined
    });
    return;
  }

  if ((nextSettings?.autoCaptureEnabled ?? DEFAULT_SETTINGS.autoCaptureEnabled) && !observer) {
    setupObserver(queryId);
    void runCapture(queryId);
  }
});

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  if (request.command === 'GET_PAGE_STATUS') {
    sendResponse(currentStatus);
    return;
  }

  if (request.command === 'TRIGGER_RECAPTURE') {
    const queryId = currentStatus.queryId ?? extractQueryIdFromUrl(window.location.href);

    if (!queryId) {
      const response: RuntimeResponse<CaptureStatus> = {
        ok: false,
        error: {
          code: 'NOT_DEEPWIKI_PAGE',
          message: 'This page is not a capturable DeepWiki session.'
        }
      };
      sendResponse(response);
      return;
    }

    void runCapture(queryId, { force: true })
      .then(() => {
        const response: RuntimeResponse<CaptureStatus> = {
          ok: true,
          data: currentStatus
        };
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const response: RuntimeResponse<CaptureStatus> = {
          ok: false,
          error: {
            code: 'RECAPTURE_FAILED',
            message: ensureErrorMessage(error)
          }
        };
        sendResponse(response);
      });

    return true;
  }
});

void init();
