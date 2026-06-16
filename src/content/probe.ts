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
  // Devin has no RSC stream; parse the DOM immediately.
  if (isDevinPage()) {
    return parseWikiPage(document, location.href, null);
  }

  const rscRaw = await waitForRscRaw(2500);
  return parseWikiPage(document, location.href, rscRaw);
}

export async function snapshotFullWiki(): Promise<WikiPageSnapshot | null> {
  // Devin has no RSC stream; traverse the sidebar DOM and compile.
  if (isDevinPage()) {
    return buildFullWikiFromDom(document, location.href);
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
