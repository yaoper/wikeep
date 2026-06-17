import {
  buildCapturePayloadFromDeepWikiSession,
  extractQueryIdFromUrl,
  fetchDevinSession,
} from "../api/deepwikiApi";
import { SETTINGS_KEY } from "../shared/constants";
import type {
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  ReportPageStatusPayload,
  RuntimeRequest,
  RuntimeResponse,
} from "../shared/messages";
import type { CaptureResult, CaptureStatus, Settings } from "../shared/types";
import { ensureErrorMessage, sendRuntimeMessage } from "../shared/utils";
import { isWikiPageUrl } from "../shared/wikiUrl";
import { observeWikiPage } from "./observer";
import {
  captureDevinMessages,
  captureRscMessages,
  reportWikiFingerprint,
  snapshotCurrentPage,
  snapshotFullWiki,
} from "./probe";

let currentStatus: CaptureStatus = {
  supported: false,
  active: false,
  reason: "idle",
};

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

function isDevinHost(): boolean {
  return window.location.host === "app.devin.ai";
}

/** Read the Devin bearer token + org id from the page's localStorage. */
function readDevinAuth(): { token: string; orgId?: string } | null {
  try {
    const token = JSON.parse(localStorage.getItem("auth1_session") ?? "{}")
      ?.token as string | undefined;
    if (!token) return null;

    let orgId: string | undefined;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? "";
      const match = `${key}${localStorage.getItem(key) ?? ""}`.match(
        /org-[0-9a-f]{32}/,
      );
      if (match) {
        orgId = match[0];
        break;
      }
    }
    return { token, orgId };
  } catch {
    return null;
  }
}

/**
 * Capture a Devin session. The authenticated session API needs the page's
 * bearer token, so the content script fetches and builds the snapshot here,
 * then persists it through the DOM-snapshot path.
 */
async function captureDevinSession(queryId: string): Promise<CaptureResult> {
  const auth = readDevinAuth();
  if (!auth) {
    throw new Error("Devin session auth token not found. Reload and sign in.");
  }

  const session = await fetchDevinSession(queryId, auth);
  const { snapshot } = buildCapturePayloadFromDeepWikiSession(
    session,
    window.location.href,
  );

  return sendRuntimeMessage<CaptureResult, CaptureDomSnapshotPayload>(
    "CAPTURE_DOM_SNAPSHOT",
    { snapshot },
  );
}

async function captureSession(
  queryId: string,
  force = false,
): Promise<CaptureStatus> {
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

    const result = isDevinHost()
      ? await captureDevinSession(queryId)
      : await sendRuntimeMessage<
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
    void snapshotCurrentPage().then((snapshot) => {
      sendResponse({ ok: true, data: { snapshot } });
    });
    return true;
  }

  if (
    request.command === "GET_FULL_WIKI_SNAPSHOT" ||
    request.command === "SAVE_FULL_WIKI"
  ) {
    void snapshotFullWiki().then((snapshot) => {
      sendResponse({ ok: true, data: { snapshot } });
    });
    return true;
  }
}

function ensureMessageListener(): void {
  if (messageListenerRegistered) return;
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  messageListenerRegistered = true;
}

function initWikiPageMode(): void {
  captureRscMessages();
  captureDevinMessages();
  reportWikiFingerprint();
  observeWikiPage(reportWikiFingerprint);
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
