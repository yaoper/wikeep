# Step 7 — Background handlers

**File:** `src/background/index.ts`

Add wiki message handlers to the existing `chrome.runtime.onMessage` router, plus
a tiny per‑tab state cache so the side panel can show savable/saved/stale for the
active tab (reuse the existing tab‑status broadcast pattern).

---

## 7.1 Imports

```ts
import {
  upsertWikiPage,
  listWikiPages,
  getWikiPage,
  deleteWikiPage,
  lookupWikiPageByUrl,
  markWikiPageStale,
  touchWikiPage
} from '../storage/pageRepository';
import { buildWikiPageMarkdown, buildWikiPageFilename } from '../shared/wikiMarkdown';
import type {
  WikiPageDetectedPayload,
  SaveWikiPagePayload,
  SaveWikiPageResult,
  ListWikiPagesPayload,
  GetWikiPagePayload,
  DeleteWikiPagePayload,
  RefreshWikiPagePayload,
  ExportWikiPageMarkdownPayload,
  ExportWikiPageMarkdownResult,
  GetWikiPageSnapshotResult,
  WikiPageStateChangedPayload
} from '../shared/messages';
import type { WikiPageSnapshot, WikiPageState } from '../shared/types';
```

---

> ⚠️ Router style (verified): `src/background/index.ts` uses
> `handleRuntimeCommand(command, payload, sender)` where each `case` **returns the
> data value** and a wrapper turns it into `{ ok: true, data }`; thrown errors
> become `{ ok: false, error }`. There is **no `respond()` helper** — do not
> introduce one. All handlers below return values or throw.

## 7.2 Helpers + per‑tab wiki state cache

```ts
// Per-tab wiki state so getActiveTabContext() can report it (the review noted
// the original snippet only broadcast state without storing it).
const wikiStateCache = new Map<number, WikiPageStateChangedPayload>();

/** Ask a tab's content script for a fresh snapshot. */
async function requestSnapshotFromTab(tabId: number): Promise<WikiPageSnapshot | null> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      command: 'GET_WIKI_PAGE_SNAPSHOT'
    })) as { ok: boolean; data?: GetWikiPageSnapshotResult };
    return res?.ok ? res.data?.snapshot ?? null : null;
  } catch {
    return null; // content script not present / page not ready
  }
}

/** Store state for the tab AND push to the panel. */
function setWikiState(tabId: number | undefined, payload: WikiPageStateChangedPayload): void {
  if (typeof tabId === 'number') wikiStateCache.set(tabId, payload);
  chrome.runtime
    .sendMessage({ command: 'WIKI_PAGE_STATE_CHANGED', payload })
    .catch(() => { /* panel may be closed */ });
}

async function getAutoRefreshEnabled(): Promise<boolean> {
  const settings = await getSettings(); // existing settings accessor
  return settings.autoRefreshWikiPages === true;
}
```

Clear the cache when a tab closes (add to the existing `tabs.onRemoved` handler):

```ts
chrome.tabs.onRemoved.addListener((tabId) => {
  wikiStateCache.delete(tabId);
  // …existing cleanup…
});
```

---

## 7.3 Handler functions (return‑style)

Write the logic as functions that **return data or throw**, matching the existing
file. `sender` is the third arg of `handleRuntimeCommand`.

```ts
async function handleWikiPageDetected(
  payload: WikiPageDetectedPayload,
  sender: chrome.runtime.MessageSender
): Promise<{ state: WikiPageState }> {
  const { fingerprint } = payload;
  const tabId = payload.tabId ?? sender.tab?.id;
  const known = await lookupWikiPageByUrl(fingerprint.url);

  if (!known.exists) {
    setWikiState(tabId, { url: fingerprint.url, state: 'not_saved' });
    return { state: 'not_saved' };
  }

  const same =
    known.contentHash === fingerprint.contentHash &&
    known.indexedCommit === fingerprint.indexedCommit;

  if (same) {
    await touchWikiPage(fingerprint.url);
    setWikiState(tabId, { url: fingerprint.url, state: 'saved_fresh', pageId: known.pageId });
    return { state: 'saved_fresh' };
  }

  if (await getAutoRefreshEnabled()) {
    const snapshot = tabId ? await requestSnapshotFromTab(tabId) : null;
    if (snapshot) {
      const { pageId } = await upsertWikiPage(snapshot);
      setWikiState(tabId, { url: fingerprint.url, state: 'updated', pageId, title: snapshot.title });
      return { state: 'updated' };
    }
  }

  await markWikiPageStale(fingerprint.url);
  setWikiState(tabId, { url: fingerprint.url, state: 'saved_stale', pageId: known.pageId });
  return { state: 'saved_stale' };
}

async function handleSaveWikiPage(
  payload: SaveWikiPagePayload,
  sender: chrome.runtime.MessageSender
): Promise<SaveWikiPageResult> {
  const tabId = payload.tabId ?? sender.tab?.id ?? (await getActiveTabId());
  const snapshot = payload.snapshot ?? (tabId ? await requestSnapshotFromTab(tabId) : null);

  if (!snapshot) {
    throw new Error('Could not read the wiki page. Make sure it is fully loaded.');
  }

  const { pageId, changed, created } = await upsertWikiPage(snapshot);
  setWikiState(tabId, { url: snapshot.url, state: 'saved_fresh', pageId, title: snapshot.title });
  return { pageId, changed, created, title: snapshot.title };
}

/**
 * Refresh can be triggered from the Wiki Pages list with only a `pageId` (no
 * active tab). Resolve which tab to read the live snapshot from.
 */
async function resolveWikiRefreshTab(
  payload: RefreshWikiPagePayload,
  sender: chrome.runtime.MessageSender
): Promise<number | undefined> {
  if (payload.tabId) return payload.tabId;
  if (sender.tab?.id) return sender.tab.id;

  if (payload.pageId) {
    const page = await getWikiPage(payload.pageId);
    if (!page) throw new Error('Wiki page not found.');

    const tabs = await chrome.tabs.query({ url: page.url });
    const tabId = tabs.find((tab) => typeof tab.id === 'number')?.id;
    if (!tabId) {
      throw new Error('Open this saved DeepWiki page in a tab before refreshing it.');
    }
    return tabId;
  }

  return getActiveTabId();
}

async function handleRefreshWikiPage(
  payload: RefreshWikiPagePayload,
  sender: chrome.runtime.MessageSender
): Promise<SaveWikiPageResult> {
  const tabId = await resolveWikiRefreshTab(payload, sender);
  const snapshot = tabId ? await requestSnapshotFromTab(tabId) : null;
  if (!snapshot) {
    throw new Error('Could not read the wiki page. Make sure it is open and fully loaded.');
  }

  const { pageId, changed, created } = await upsertWikiPage(snapshot);
  setWikiState(tabId, { url: snapshot.url, state: 'saved_fresh', pageId, title: snapshot.title });
  return { pageId, changed, created, title: snapshot.title };
}

async function exportWikiPageMarkdown(
  payload: ExportWikiPageMarkdownPayload
): Promise<ExportWikiPageMarkdownResult> {
  const page = await getWikiPage(payload.pageId);
  if (!page) throw new Error('Wiki page not found.');
  return { markdown: buildWikiPageMarkdown(page), filename: buildWikiPageFilename(page) };
}
```

Then add cases to the existing `switch` in `handleRuntimeCommand` — each just
`return`s (the wrapper builds `{ ok, data }`):

```ts
case 'WIKI_PAGE_DETECTED':
  return handleWikiPageDetected(payload as WikiPageDetectedPayload, sender);
case 'SAVE_WIKI_PAGE':
  return handleSaveWikiPage(payload as SaveWikiPagePayload, sender);
case 'REFRESH_WIKI_PAGE':
  return handleRefreshWikiPage(payload as RefreshWikiPagePayload, sender);
case 'LIST_WIKI_PAGES':
  return listWikiPages((payload as ListWikiPagesPayload | undefined)?.keyword);
case 'GET_WIKI_PAGE':
  return getWikiPage((payload as GetWikiPagePayload).pageId);
case 'DELETE_WIKI_PAGE':
  return deleteWikiPage((payload as DeleteWikiPagePayload).pageId);
case 'EXPORT_WIKI_PAGE_MARKDOWN':
  return exportWikiPageMarkdown(payload as ExportWikiPageMarkdownPayload);
```

> `getActiveTabId` / `getSettings` already exist in the file — reuse them. Keep
> the `onMessage` listener returning `true` (it already does) so async results
> resolve.

## 7.3b Route‑aware active‑tab context

The current `getActiveTabContext()` sets `supported: Boolean(queryId)`, so wiki
pages never show as supported. Make it route‑aware and attach the cached wiki
state:

```ts
import { parseWikiUrl } from '../shared/wikiUrl';

async function getActiveTabContext(): Promise<ActiveTabContext> {
  const tab = await getActiveTab();          // existing helper
  if (!tab?.url) return { supported: false };

  const queryId = extractQueryIdFromUrl(tab.url) ?? undefined;
  const wikiParts = parseWikiUrl(tab.url);

  return {
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
    supported: Boolean(queryId || wikiParts),
    routeKind: queryId ? 'session' : wikiParts ? 'wiki' : 'other',
    queryId,
    status: /* existing session status logic, only when queryId */ undefined,
    wikiState: wikiParts && tab.id != null ? wikiStateCache.get(tab.id) : undefined
  };
}
```

Keep the existing session `status` computation for the `queryId` branch; only add
the `routeKind` / `wikiState` fields and the `wikiParts` term in `supported`.

---

## 7.4 Markdown document builder — `src/shared/wikiMarkdown.ts` (new)

Wraps the stored `markdown` body with front‑matter (separate from the session
formatter to keep concerns clean).

```ts
import type { WikiPage } from './types';

function sanitizeFilename(text: string): string {
  return (
    text.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'wiki-page'
  );
}

export function buildWikiPageMarkdown(page: WikiPage): string {
  const lines = [
    `# ${page.title}`,
    '',
    `- **Repo**: ${page.owner}/${page.repo}`,
    `- **Page**: ${page.url}`,
    ...(page.sectionPath ? [`- **Section**: ${page.sectionPath}`] : []),
    ...(page.indexedCommit ? [`- **Indexed commit**: ${page.indexedCommit}`] : []),
    `- **Saved at**: ${new Date(page.updatedAt).toLocaleString('en-US')}`,
    '',
    '---',
    '',
    page.markdown
  ];
  return lines.join('\n');
}

export function buildWikiPageFilename(page: WikiPage): string {
  const date = new Date(page.updatedAt).toISOString().slice(0, 10);
  const slug = sanitizeFilename(`${page.owner}-${page.repo}-${page.sectionPath ?? 'overview'}`);
  return `wikeep-${slug}-${date}.md`;
}
```

---

## Checklist

- [ ] Handlers written as **return/throw** functions; `case`s just `return fn(...)` (no `respond()`).
- [ ] `wikiStateCache` stores per‑tab state and is cleared on `tabs.onRemoved`.
- [ ] `WIKI_PAGE_DETECTED` implements the savable/fresh/stale/updated logic.
- [ ] `SAVE_WIKI_PAGE` / `REFRESH_WIKI_PAGE` pull a snapshot and upsert.
- [ ] `getActiveTabContext` is route‑aware (`routeKind`, wiki `supported`, `wikiState`).
- [ ] `wikiMarkdown.ts` builds the export document + filename.
- [ ] `DEFAULT_SETTINGS` includes `autoRefreshWikiPages` (Step 1).
- [ ] `npm run typecheck` passes.
