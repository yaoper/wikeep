# Plan — Save DeepWiki static wiki pages to Markdown

## Goal

Add the ability to save DeepWiki **static wiki pages** (not `/search/*` Q&A
sessions) to local storage and export them as Markdown files. Examples:

```text
https://deepwiki.com/facebook/react                              (repo overview)
https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages   (wiki section)
```

Decisions locked with the maintainer:

- **Trigger**: manual "Save this page" button **plus** automatic refresh of an
  already‑saved page when its content changes (DeepWiki re‑indexes after the
  underlying repo changes).
- **Storage**: a **new dedicated `pages` object store** (separate from the
  `conversations`/`messages` session model), with change‑detection so a saved
  page can be refreshed when the wiki content changes.
- **HTML → Markdown**: **Turndown + `turndown-plugin-gfm`** (tables, strikethrough,
  task lists).

This is an additive feature. It does not change the existing `/search/*` session
capture, storage, or export.

---

## 1. Research findings (verified live on `deepwiki.com/facebook/react/...`)

### URL shapes

| Kind | Pattern | Example |
|---|---|---|
| Repo overview | `deepwiki.com/{owner}/{repo}` | `/facebook/react` |
| Wiki section | `deepwiki.com/{owner}/{repo}/{n}-{slug}` | `/facebook/react/1-react-repository-overview` |
| Wiki subsection | `deepwiki.com/{owner}/{repo}/{n.m}-{slug}` | `/facebook/react/1.1-repository-structure-and-packages` |
| **Excluded** (existing feature) | `deepwiki.com/{owner}/{repo}/search/*` … actually `deepwiki.com/search/*` | `/search/what-is-...` |

A single regex distinguishes wiki pages from sessions and other routes:

```ts
// owner/repo with optional "<section>-<slug>" tail; never the /search/ route
export const WIKI_PAGE_RE =
  /^https:\/\/deepwiki\.com\/([^/]+)\/([^/]+)(?:\/(\d+(?:\.\d+)*)-[^/]+)?\/?$/;

export function isWikiPageUrl(url: string): boolean {
  if (/^https:\/\/deepwiki\.com\/search\//.test(url)) return false;
  return WIKI_PAGE_RE.test(url);
}
```

### Content container

- The rendered article is a **`div.prose`** (Tailwind typography), ~12.6k chars
  on the sample page. Select the largest `[class*="prose"]` node.
- Inside: 18 headings (h1–h4), 8 fenced code blocks, 2 tables, ~70 links
  (GitHub citations to `github.com/{owner}/{repo}/blob/{commitSha}/...`).
- **Diagrams are pre‑rendered SVG** with zoom controls and **no recoverable
  Mermaid source** in the DOM (no `data-mermaid`, no `language-mermaid` block).
  This is the one lossy part — see §6.
- Many of the ~95 `<svg>` elements are heading "copy‑link" icons and zoom
  buttons, i.e. **UI chrome to strip**, not content.

### Table of contents (enables future "save whole wiki")

Every wiki page links the full repo TOC: 25 unique
`/{owner}/{repo}/{n[.m]}-{slug}` anchors were present. We capture these as
`relatedSections` now and can offer "Save entire wiki" later.

### Freshness signal (for auto‑refresh)

DeepWiki indexes a specific commit; citation links embed it:
`…/blob/bf76955e/package.json`. We extract this **indexed commit SHA** plus a
**content hash** of the cleaned prose. A saved page is "stale" when either the
indexed commit or the content hash changes on a later visit.

---

## 2. Current architecture (what we build on)

- **Manifest** (`public/manifest.json`): one content script matched only to
  `https://deepwiki.com/search/*`; `host_permissions` already include
  `https://deepwiki.com/*`.
- **Content script** (`src/content/index.ts`): single IIFE bundle (built
  separately in `scripts/build.mjs`). Extracts `queryId`, parses DOM, talks to
  background.
- **Background** (`src/background/index.ts`): message router + persistence.
- **Storage** (`src/storage/db.ts`): `idb` with `DB_NAME`/`DB_VERSION` from
  `src/shared/constants.ts`; today only an `oldVersion < 1` upgrade creating
  `conversations` + `messages`.
- **Markdown** (`src/shared/utils.ts`): `formatConversationAsMarkdown` +
  `buildMarkdownFilename`; download wired in `SidePanelApp.tsx` via
  `EXPORT_CONVERSATION_MARKDOWN`.
- **Messages** (`src/shared/messages.ts`): `RuntimeCommand` union + payload types.

Because the content script is a single entry, we **do not** need a new bundle —
we broaden the match pattern and branch by route inside the existing script.

---

## 3. Data model — new `pages` store

Add a new store; bump `DB_VERSION` and add an upgrade branch (no migration of
existing data needed — additive).

```ts
// src/shared/types.ts
export interface WikiPage {
  id: string;            // `wiki:{owner}/{repo}[/{sectionPath}]`
  source: 'deepwiki-wiki';
  owner: string;
  repo: string;
  sectionPath?: string;  // "1.1-repository-structure-and-packages" (undefined => repo overview)
  title: string;         // h1 / document title
  url: string;
  markdown: string;      // Turndown output (the saved body)
  contentHash: string;   // stableHash(cleaned prose) — change detection
  indexedCommit?: string;// repo commit SHA parsed from citations
  relatedSections?: string[]; // TOC hrefs for "save whole wiki" later
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  lastCheckedAt: number; // last freshness check
  isStale?: boolean;     // set when a newer version is detected
  schemaVersion: number;
}
```

```ts
// src/storage/db.ts — extend schema + upgrade
interface WikeepDBSchema extends DBSchema {
  conversations: { /* unchanged */ };
  messages: { /* unchanged */ };
  pages: {
    key: string;
    value: WikiPage;
    indexes: {
      'by-updatedAt': number;
      'by-url': string;          // unique
      'by-repo': string;         // `${owner}/${repo}` for grouping
    };
  };
}

// in upgrade(database, oldVersion):
if (oldVersion < 2) {
  const pages = database.createObjectStore('pages', { keyPath: 'id' });
  pages.createIndex('by-updatedAt', 'updatedAt');
  pages.createIndex('by-url', 'url', { unique: true });
  pages.createIndex('by-repo', 'repo');
}
```

Bump `DB_VERSION` from 1 → 2 in `src/shared/constants.ts`.

> Note: existing users keep their sessions; the new store is created on the
> version‑2 upgrade. The `conversations` store is untouched.

New repository module `src/storage/pageRepository.ts` mirrors
`conversationRepository.ts`:

```ts
upsertWikiPage(snapshot: WikiPageSnapshot): Promise<{ pageId: string; changed: boolean }>;
listWikiPages(keyword?: string): Promise<WikiPage[]>;
getWikiPage(pageId: string): Promise<WikiPage | null>;
deleteWikiPage(pageId: string): Promise<void>;
lookupWikiPageByUrl(url: string): Promise<{ exists: boolean; contentHash?: string; indexedCommit?: string }>;
```

`upsertWikiPage` returns `changed: true` when an existing record's `contentHash`
or `indexedCommit` differs — used to report "updated" vs "unchanged".

Extend `BackupData` (export/import) and `clearAllData` to include `pages` so
backup/restore and "clear all" stay correct.

---

## 4. Content script — wiki extraction

### Manifest change

Broaden the content script match so it also runs on wiki pages. The script
self‑filters by route, so injecting on all of `deepwiki.com/*` is acceptable; or
keep it tight with two patterns:

```json
"content_scripts": [
  {
    "matches": [
      "https://deepwiki.com/search/*",
      "https://deepwiki.com/*"
    ],
    "js": ["content.js"],
    "run_at": "document_end"
  }
]
```

In `src/content/index.ts`, branch at startup:

```ts
if (location.href.includes('/search/')) {
  // existing session-capture flow (unchanged)
} else if (isWikiPageUrl(location.href)) {
  initWikiPageMode();   // new
}
```

### New module `src/parser/deepwikiWikiParser.ts`

1. Select the content root: largest `[class*="prose"]` by `innerText.length`.
2. **Clone + sanitize** before conversion (don't mutate the live page):
   - remove heading "copy‑link" anchors (the `a`/`button` wrapping the small
     SVG with `opacity-0` hover classes),
   - remove zoom in/out buttons and other diagram controls,
   - replace each diagram `<svg>`/diagram wrapper with a placeholder node
     (see §6).
3. Convert the cleaned clone with Turndown (config in §5).
4. Build a `WikiPageSnapshot`:

```ts
export interface WikiPageSnapshot {
  url: string;
  owner: string;
  repo: string;
  sectionPath?: string;
  title: string;
  markdown: string;
  contentHash: string;       // stableHash of cleaned text
  indexedCommit?: string;    // from a github blob/<sha> citation
  relatedSections?: string[];// TOC hrefs
  wordCount: number;
  capturedAt: number;
}
```

`indexedCommit` parse:

```ts
const m = root.querySelector('a[href*="/blob/"]')?.getAttribute('href')
  ?.match(/\/blob\/([0-9a-f]{7,40})\//);
const indexedCommit = m?.[1];
```

### Auto‑refresh handshake (manual + auto)

On every wiki page load the content script asks the background whether this URL
is already saved and, if so, sends a lightweight fingerprint:

```text
content → BG: WIKI_PAGE_DETECTED { url, contentHash, indexedCommit }
BG: lookupWikiPageByUrl(url)
  - not saved      → BG tells panel "savable" (manual Save button enabled)
  - saved + same   → status "saved (up to date)"
  - saved + diff:
      - autoRefresh ON  → BG asks content for full snapshot → upsert → "updated"
      - autoRefresh OFF → status "update available" + Refresh button
```

So auto‑refresh only re‑captures pages the user already chose to save, and only
when the content actually changed — no history spam.

---

## 5. HTML → Markdown (Turndown + GFM)

Add dependencies:

```bash
npm i turndown turndown-plugin-gfm
npm i -D @types/turndown
```

`src/parser/htmlToMarkdown.ts`:

```ts
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export function createConverter(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-'
  });
  td.use(gfm);

  // Preserve fenced-code language from DeepWiki's <pre><code class="language-…">
  td.addRule('fencedCodeLang', {
    filter: (node) => node.nodeName === 'PRE' && !!node.querySelector('code'),
    replacement: (_content, node) => {
      const code = node.querySelector('code')!;
      const lang = (code.className.match(/language-([\w+-]+)/)?.[1]) ?? '';
      return `\n\n\`\`\`${lang}\n${code.textContent}\n\`\`\`\n\n`;
    }
  });

  return td;
}
```

Bundling: Turndown is ~ small and ships ESM/CJS; it bundles fine into the IIFE
`content.js` (the build already uses `inlineDynamicImports`). Validate the
content bundle size after adding it.

Markdown document assembled for a page (front‑matter + body):

```md
# Repository Structure and Packages

- **Repo**: facebook/react
- **Page**: https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages
- **Indexed commit**: bf76955e
- **Saved at**: 2026-06-15 21:30

---

<turndown body>
```

Filename: `wikeep-{owner}-{repo}-{sectionPath|overview}-{YYYY-MM-DD}.md`
(reuse/extend `sanitizeFilename`).

---

## 6. Diagrams — recoverable from the data layer (not lossy)

The rendered `<svg>` has no Mermaid source, but the **source is in the data
layer** (verified live — see [`plan/step-12-diagrams.md`](plan/step-12-diagrams.md)):

- **Wiki pages:** the full page Markdown, including ```` ```mermaid ```` blocks,
  ships in the Next.js RSC payload `window.__next_f` (12 mermaid blocks on
  `/facebook/react/1.1-...`). Extract that Markdown as the **primary** source;
  fall back to DOM→Turndown (with a placeholder) only if RSC parsing fails.
- **Sessions:** the `api.devin.ai/ada/query/{id}` answer is Markdown delivered as
  `type:'chunk'` items; diagram answers contain ```` ```mermaid ```` fences. They
  are saved automatically as long as the chunk Markdown is stored verbatim.

Mermaid fences render natively on GitHub and many viewers, so preserving the
source *is* saving the diagram. Optional Phase‑3: also store the rendered `<svg>`
for pixel‑exact reproduction. Full implementation in
[`plan/step-12-diagrams.md`](plan/step-12-diagrams.md).

---

## 7. Runtime messages

Add to `RuntimeCommand` and payload types:

```ts
| 'WIKI_PAGE_DETECTED'        // content → BG: fingerprint on load
| 'SAVE_WIKI_PAGE'           // panel/content → BG: capture + store
| 'LIST_WIKI_PAGES'          // panel → BG
| 'GET_WIKI_PAGE'            // panel → BG
| 'DELETE_WIKI_PAGE'        // panel → BG
| 'REFRESH_WIKI_PAGE'       // panel → BG: force re-capture current/known page
| 'EXPORT_WIKI_PAGE_MARKDOWN'// panel → BG: returns { markdown, filename }
| 'GET_WIKI_PAGE_SNAPSHOT'   // BG → content: pull full snapshot for a tab
```

Background handlers persist via `pageRepository` and broadcast an
`ACTIVE_TAB_CONTEXT_CHANGED`‑style update so the panel reflects savable / saved /
stale state in near‑real‑time (reuse the existing tab‑status mechanism).

---

## 8. Side panel UI

- **Status bar (history view):** when the active tab is a wiki page, show a
  wiki‑specific state and action:
  - not saved → "Wiki page — **Save this page**"
  - saved & fresh → "Wiki page saved"
  - saved & stale → "Update available — **Refresh**"
- **New "Wiki Pages" section** (its own view, matching Settings/Backup nav),
  since pages live in a separate store. List items grouped by `owner/repo`, each
  with: title, section, saved/updated time, a **stale badge**, and actions
  **Open · Refresh · Export Markdown · Delete**.
- **Settings:** add toggle **"Auto‑refresh saved wiki pages when content
  changes"** (drives the §4 handshake). Persist in `Settings`
  (`autoRefreshWikiPages: boolean`).
- All new strings in **English** (consistent with the recent i18n cleanup).

---

## 9. Build, deps, and permissions

- **No new content bundle** — same `src/content/index.ts` entry; only the
  manifest match list grows.
- **New deps:** `turndown`, `turndown-plugin-gfm`, `@types/turndown`. Commit the
  updated `package-lock.json` (keeps `npm ci` / the Nix flake reproducible).
- **Permissions:** none added — `host_permissions` already cover
  `https://deepwiki.com/*`, and extraction is DOM‑only (no new API host).
- **MV3 manifest checks** in the flake still pass (we only extend `matches`).

---

## 10. Testing

Vitest + jsdom are already configured.

- `isWikiPageUrl` / URL parsing: table of positive (overview, section,
  subsection) and negative (`/search/*`, homepage, external) cases.
- `deepwikiWikiParser`: fixture HTML (saved snapshot of a real `div.prose`) →
  asserts headings, code fences with language, GFM table, citation stripping,
  diagram placeholder, and `indexedCommit` extraction.
- `htmlToMarkdown`: deterministic conversion snapshots.
- Freshness: same URL with changed `contentHash`/`indexedCommit` ⇒ `isStale`
  and `upsertWikiPage().changed === true`.
- Repository: round‑trip upsert/list/get/delete; backup/restore includes `pages`.

Add a fixture under `tests/fixtures/wiki-page.html` captured from the live page.

**Live verification (DevTools MCP):** load a wiki page in the dev browser, click
Save, confirm a `pages` row in IndexedDB with correct `markdown`/`indexedCommit`,
export the `.md`, then simulate staleness and confirm the Refresh path.

---

## 11. Phased delivery

1. **Phase 1 — Save + export (manual):** types, `pages` store + `DB_VERSION` bump,
   `pageRepository`, wiki parser, Turndown converter (diagram placeholder),
   `SAVE_WIKI_PAGE` / `EXPORT_WIKI_PAGE_MARKDOWN`, manifest match, side‑panel Save
   button + Wiki Pages list. Ships the core ask: page → `.md`.
2. **Phase 2 — Auto‑refresh on change:** `WIKI_PAGE_DETECTED` fingerprint
   handshake, stale detection, `REFRESH_WIKI_PAGE`, settings toggle, stale badge.
3. **Phase 3 — Nice‑to‑haves:** "Save entire wiki" via `relatedSections`,
   optional inline‑SVG diagram capture, bulk Markdown export (zip).

---

## 12. Risks / open questions

- **DOM coupling:** like the existing DOM fallback, extraction depends on
  DeepWiki's `div.prose` markup. Mitigate with the largest‑prose heuristic and a
  fixture‑based test that fails loudly if structure shifts.
- **Diagrams are recoverable** from the data layer — Mermaid source lives in the
  wiki RSC payload and in session API chunk Markdown (see step‑12), so the
  rendered‑SVG limitation does not apply. The DOM→Turndown placeholder remains
  only as a fallback when RSC parsing fails.
- **`/search/` vs wiki disambiguation:** confirmed the session route is
  `deepwiki.com/search/*` (not under `owner/repo`), so the regex is safe; keep a
  negative test guarding it.
- **Content bundle size** grows with Turndown — measure; acceptable for a
  content script but worth a glance.

---

## 13. File touch list

```text
public/manifest.json                  broaden content_scripts matches
src/shared/constants.ts               DB_VERSION 1 → 2; (optional) wiki URL consts
src/shared/types.ts                   WikiPage, WikiPageSnapshot, Settings flag
src/shared/messages.ts                new RuntimeCommands + payloads
src/storage/db.ts                     pages store + v2 upgrade
src/storage/pageRepository.ts         (new) CRUD + freshness
src/parser/deepwikiWikiParser.ts      (new) prose → snapshot
src/parser/htmlToMarkdown.ts          (new) Turndown + gfm
src/content/index.ts                  route branch → wiki mode
src/background/index.ts               wiki message handlers + tab status
src/ui/sidepanel/SidePanelApp.tsx     wiki status action + Wiki Pages view
src/ui/components/…                    WikiPageList (mirrors ConversationList)
tests/…                               url/parser/converter/repository tests
package.json / package-lock.json      turndown deps
```
