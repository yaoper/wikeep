import { extractQueryIdFromUrl } from '../api/deepwikiApi';
import { parseDeepWikiDomSnapshot } from '../parser/deepwikiDomParser';
import { CAPTURE_DEBOUNCE_MS, MAX_POLL_ATTEMPTS, PENDING_POLL_MS } from '../shared/constants';
import type {
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  RuntimeRequest,
  RuntimeResponse
} from '../shared/messages';
import type { CaptureResult, CaptureStatus, Settings } from '../shared/types';
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

function setStatus(partial: Partial<CaptureStatus>): void {
  currentStatus = {
    ...currentStatus,
    ...partial
  };
}

function stopPolling(): void {
  if (pollingTimer) {
    window.clearInterval(pollingTimer);
    pollingTimer = null;
  }

  pollingAttempts = 0;
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

async function captureViaApi(queryId: string): Promise<CaptureResult> {
  return sendRuntimeMessage<CaptureResult, CaptureDeepWikiSessionPayload>('CAPTURE_DEEPWIKI_SESSION', {
    queryId,
    sourceUrl: window.location.href
  });
}

async function captureViaDom(): Promise<CaptureResult | null> {
  const snapshot = parseDeepWikiDomSnapshot(document, window.location.href);

  if (!snapshot) {
    return null;
  }

  return sendRuntimeMessage<CaptureResult, CaptureDomSnapshotPayload>('CAPTURE_DOM_SNAPSHOT', {
    snapshot
  });
}

async function runCapture(queryId: string): Promise<void> {
  if (isCapturing) {
    return;
  }

  isCapturing = true;
  setStatus({
    supported: true,
    active: true,
    queryId,
    sourceUrl: window.location.href
  });

  try {
    const apiResult = await captureViaApi(queryId);
    setStatus({
      method: 'api',
      lastCapturedAt: apiResult.savedAt,
      pending: apiResult.pending,
      reason: undefined,
      errorMessage: undefined
    });

    if (apiResult.pending) {
      startPolling(queryId);
    } else {
      stopPolling();
    }
    return;
  } catch (error) {
    setStatus({
      method: undefined,
      reason: 'api_fetch_failed',
      errorMessage: ensureErrorMessage(error)
    });
  } finally {
    isCapturing = false;
  }

  try {
    const domResult = await captureViaDom();

    if (!domResult) {
      setStatus({
        active: false,
        reason: 'unsupported_dom_structure'
      });
      return;
    }

    setStatus({
      active: true,
      method: 'dom',
      lastCapturedAt: domResult.savedAt,
      pending: false,
      reason: undefined,
      errorMessage: undefined
    });
  } catch (error) {
    setStatus({
      active: false,
      reason: 'storage_error',
      errorMessage: ensureErrorMessage(error)
    });
  }
}

function setupObserver(queryId: string): void {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(() => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

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
      sourceUrl: window.location.href
    });
    return;
  }

  const settings = await sendRuntimeMessage<Settings>('GET_SETTINGS');

  if (!settings.autoCaptureEnabled) {
    setStatus({
      supported: true,
      active: false,
      queryId,
      sourceUrl: window.location.href,
      reason: 'auto_capture_disabled'
    });
    return;
  }

  setupObserver(queryId);
  await runCapture(queryId);
}

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
          message: '当前页面不是可抓取的 DeepWiki session。'
        }
      };
      sendResponse(response);
      return;
    }

    void runCapture(queryId)
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
