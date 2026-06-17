import {
  fingerprintWikiPage,
  parseFullWiki,
  parseWikiPage,
} from "../parser/deepwikiWikiParser";
import { buildFullWikiFromDom } from "../parser/devinWikiParser";
import type { WikiPageDetectedPayload } from "../shared/messages";
import type { WikiPageSnapshot } from "../shared/types";
import { sendRuntimeMessage } from "../shared/utils";

let latestRscRaw: { url: string; raw: string } | null = null;
let rscMessageListenerRegistered = false;

export function captureRscMessages(): void {
  if (rscMessageListenerRegistered) return;

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data as { source?: string; url?: string; raw?: string };
    if (data?.source === "wikeep-rsc" && data.url && data.raw) {
      latestRscRaw = { url: data.url, raw: data.raw };
    }
  });

  rscMessageListenerRegistered = true;
}

// --- Devin MAIN-world Markdown probe ---------------------------------------
let devinReqSeq = 0;
const devinPending = new Map<number, (markdown: string | null) => void>();
let devinListenerRegistered = false;

export function captureDevinMessages(): void {
  if (devinListenerRegistered) return;

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data as {
      source?: string;
      requestId?: number;
      markdown?: string | null;
    };
    if (
      data?.source === "wikeep-devin-md" &&
      typeof data.requestId === "number"
    ) {
      const cb = devinPending.get(data.requestId);
      if (cb) {
        devinPending.delete(data.requestId);
        cb(data.markdown ?? null);
      }
    }
  });

  devinListenerRegistered = true;
}

/** Ask the MAIN-world probe for the current Devin page's raw Markdown. */
export function requestDevinMarkdown(timeoutMs = 2000): Promise<string | null> {
  const requestId = ++devinReqSeq;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      devinPending.delete(requestId);
      resolve(null);
    }, timeoutMs);

    devinPending.set(requestId, (markdown) => {
      window.clearTimeout(timer);
      resolve(markdown);
    });

    window.postMessage(
      { source: "wikeep-devin-md-request", requestId },
      location.origin,
    );
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

function isDevinPage(): boolean {
  return location.host === "app.devin.ai";
}

export async function snapshotCurrentPage(): Promise<WikiPageSnapshot | null> {
  // Devin has no RSC stream, but the original Markdown (with ```mermaid fences)
  // lives in React props. Pull it from the MAIN-world probe; fall back to DOM.
  if (isDevinPage()) {
    const fiberMarkdown = await requestDevinMarkdown(2000);
    return parseWikiPage(document, location.href, null, fiberMarkdown);
  }

  const rscRaw = await waitForRscRaw(2500);
  return parseWikiPage(document, location.href, rscRaw);
}

export async function snapshotFullWiki(): Promise<WikiPageSnapshot | null> {
  // Devin has no RSC stream; traverse the sidebar DOM and pull each section's
  // Markdown from the MAIN-world probe so diagrams are preserved.
  if (isDevinPage()) {
    return buildFullWikiFromDom(document, location.href, () =>
      requestDevinMarkdown(2000),
    );
  }

  const rscRaw = await waitForRscRaw(2500);
  return parseFullWiki(document, location.href, rscRaw);
}

export function reportWikiFingerprint(): void {
  const fp = fingerprintWikiPage(document, location.href);
  if (!fp) return;

  void sendRuntimeMessage<void, WikiPageDetectedPayload>("WIKI_PAGE_DETECTED", {
    fingerprint: { url: location.href, ...fp },
  }).catch(() => undefined);
}
