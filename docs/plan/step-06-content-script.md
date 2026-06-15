# Step 6 — Content script (wiki mode)

**File:** `src/content/index.ts`

The content script is a single IIFE bundle. We branch by route at startup: keep
the existing `/search/*` flow, and add a wiki mode for wiki pages. No new bundle
or build change — Step 9 only widens the manifest match list.

---

## 6.1 Route branch (top of `src/content/index.ts`)

Find the current bootstrap (where it reads the URL / extracts `queryId`) and wrap
it so wiki pages take a different path.

```ts
import { isWikiPageUrl } from '../shared/wikiUrl';
import { parseWikiPage, fingerprintWikiPage } from '../parser/deepwikiWikiParser';
import { sendRuntimeMessage } from '../shared/utils';
import type {
  SaveWikiPagePayload,
  SaveWikiPageResult,
  WikiPageDetectedPayload
} from '../shared/messages';
import type { RuntimeRequest, RuntimeResponse } from '../shared/messages';

function main() {
  const url = location.href;

  if (url.includes('/search/')) {
    initSessionMode();   // existing behaviour (unchanged)
    return;
  }

  if (isWikiPageUrl(url)) {
    initWikiPageMode();  // new
    return;
  }
  // other deepwiki routes: do nothing
}

main();
```

> Rename the existing bootstrap body to `initSessionMode()` if it isn't already a
> function. Everything that previously ran at top level moves inside it.

---

## 6.2 Wiki mode

```ts
let wikiObserver: MutationObserver | null = null;

function initWikiPageMode(): void {
  // 1. Send a cheap fingerprint so the panel can show savable/stale immediately.
  reportWikiFingerprint();

  // 2. Re-report when the SPA swaps content or finishes rendering.
  wikiObserver?.disconnect();
  wikiObserver = new MutationObserver(debounce(reportWikiFingerprint, 600));
  wikiObserver.observe(document.body, { childList: true, subtree: true });

  // 3. Respond to background/panel requests.
  chrome.runtime.onMessage.addListener(handleWikiMessage);
}

function reportWikiFingerprint(): void {
  const fp = fingerprintWikiPage(document, location.href);
  if (!fp) return; // not rendered yet; observer will retry
  void sendRuntimeMessage<void, WikiPageDetectedPayload>('WIKI_PAGE_DETECTED', {
    fingerprint: { url: location.href, ...fp }
  }).catch(() => { /* background may be asleep; ignore */ });
}

function handleWikiMessage(
  request: RuntimeRequest,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (r: RuntimeResponse) => void
): boolean | void {
  // Background asks for a full snapshot (manual Save or auto-refresh).
  if (request.command === 'GET_WIKI_PAGE_SNAPSHOT' || request.command === 'SAVE_WIKI_PAGE') {
    // Prefer RSC-recovered Markdown (diagrams intact) from the MAIN-world probe;
    // parseWikiPage falls back to DOM→Turndown when it's null. See Step 12 §2b.
    const snapshot = parseWikiPage(document, location.href, rscMarkdownForCurrent());
    sendResponse({ ok: !!snapshot, data: { snapshot } });
    return true; // keep the channel open for the async-ish response
  }
}
```

> The `rscMarkdownForCurrent()` helper and the `window.addEventListener('message', …)`
> bridge that receives the MAIN‑world probe's RSC payload are defined in
> [step-12-diagrams.md](step-12-diagrams.md) §2b. Add them inside
> `initWikiPageMode()`.

`debounce` (add to `src/shared/utils.ts` if not present):

```ts
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
```

---

## 6.3 Flow summary

```text
page load (wiki URL)
  └─ content: fingerprintWikiPage() → WIKI_PAGE_DETECTED { url, contentHash, indexedCommit }
       └─ BG: lookupWikiPageByUrl(url)
            ├─ not saved        → WIKI_PAGE_STATE_CHANGED { state: 'not_saved' }   (panel: Save button)
            ├─ saved & same     → touchWikiPage()  → 'saved_fresh'
            └─ saved & different →
                 ├─ autoRefreshWikiPages ON  → BG → content GET_WIKI_PAGE_SNAPSHOT → upsert → 'updated'
                 └─ autoRefreshWikiPages OFF → markWikiPageStale() → 'saved_stale' (panel: Refresh)

manual Save (panel button)
  └─ panel → BG SAVE_WIKI_PAGE { tabId } → BG → content GET_WIKI_PAGE_SNAPSHOT → upsert → 'saved_fresh'
```

Only pages the user already saved are auto‑refreshed, and only when content
actually changed — no history spam.

---

## Checklist

- [ ] Existing search flow wrapped in `initSessionMode()`, unchanged.
- [ ] `initWikiPageMode()` sends fingerprint, observes mutations, answers snapshot requests.
- [ ] `debounce` available.
- [ ] Manual build (`npm run build`) still emits a single `content.js`.
