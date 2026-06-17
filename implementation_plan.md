# Support Saving Wiki Pages from Devin (`app.devin.ai`)

> Target branch: `feature/devin-wiki-support` (based on `refactor/codebase-cleanup`).
> This plan is written against the **refactored** module layout, where the content
> script is split into `content/index.ts` (routing), `content/probe.ts` (snapshot
> orchestration + RSC wait), and `content/observer.ts`, and background message
> handling lives in `background/handlers/wiki.ts`.

Add support for saving single wiki pages and full wikis from
`https://app.devin.ai/org/<org-slug>/wiki/<owner>/<repo>`.

## Context & Key Findings
1. **Dynamic Client Routing**: Devin's wiki uses client-side hash routing (`#1.1`, `#1.2`). Changing the hash updates the DOM of the main prose container (`.prose-main`).
2. **Interactive Elements**: Sidebar items contain hidden overlay `<button>` elements with `aria-label="<Page Title>"`. Clicking them programmatically triggers routing.
3. **No RSC Flight Stream**: Devin does not expose `window.__next_f` or `__NEXT_DATA__` (`hasNextF: false`, `hasNextData: false`). All Devin saves are **DOM-based only**.
4. **`.prose-main` is parser-compatible**: `findContentRoot` (in `deepwikiWikiParser.ts`) selects on `[class*="prose"]` with a ≥200-char gate, so it picks up `.prose-main` unchanged. The single-page DOM parse works once URL matching is added.
5. **Optimization**: Bypass `waitForRscRaw` (2.5s timeout, in `content/probe.ts`) on `app.devin.ai`. Pure latency win — `parseWikiPage` already falls back to DOM markdown when `rscRaw` is `null`.

### Gaps in existing code this plan must close
- **`parseFullWiki` is RSC-only.** It returns `null` when `rscRaw` is falsy (`if (!parts || !rscRaw) return null;`) and again if `extractFullWikiMarkdownFromRsc` is empty. It **cannot** be reused for Devin — a new DOM-traversal builder is required.
- **`extractToc` is DeepWiki-specific.** It only collects path-style anchors (`/owner/repo/1.2-slug`); Devin uses hash routing, so `relatedSections` would be empty unless rebuilt from sidebar labels.
- **Title cleanup is DeepWiki-specific.** `extractTitle`/`findContentRoot` strip `/\s*\|\s*DeepWiki$/i`, which won't strip Devin's suffix. `h1` is preferred so impact is minor, but a Devin-aware fallback is warranted.
- **`sectionPath` location differs.** DeepWiki puts it in the path (`\d+(?:\.\d+)*-slug`); Devin puts it in the hash (`#1.2` / `#1.2-slug`). Needs a **separate matcher**, not a tweak to `WIKI_PAGE_RE`.

---

## Proposed Changes

### Extension Manifest

#### [MODIFY] [public/manifest.json](file:///Users/test/Documents/work/wikeep/public/manifest.json)
- Add `"https://app.devin.ai/*"` to `host_permissions`.
- Add `"https://app.devin.ai/org/*/wiki/*"` to the `content.js` `content_scripts` match patterns.
- **Do NOT** add Devin to the `pageWorldProbe.js` (MAIN world) match patterns — that probe only captures RSC Flight records, which Devin lacks. Injecting it on Devin is dead weight.

### URL Matching & Routing

#### [MODIFY] [src/shared/wikiUrl.ts](file:///Users/test/Documents/work/wikeep/src/shared/wikiUrl.ts)
- Add a **second, Devin-specific regex** (leave `WIKI_PAGE_RE` for DeepWiki untouched) matching `https://app.devin.ai/org/<org-slug>/wiki/<owner>/<repo>` with optional `?branch=...` and a `#<sectionPath>` hash.
- `isWikiPageUrl` returns true if either matcher matches.
- `parseWikiUrl` branches by host: for Devin, take `owner`/`repo` from the path and `sectionPath` from the **hash** (`1.2` from `#1.2` or `#1.2-slug`); keep DeepWiki behavior otherwise.
- Result: this is the single source of truth — `background/handlers/wiki.ts` (`detected`) and the side-panel Save UI both gate on `isWikiPageUrl`, so the Save buttons light up on Devin automatically.

### Content Script

#### [MODIFY] [src/content/index.ts](file:///Users/test/Documents/work/wikeep/src/content/index.ts)
- No handler logic changes needed here — `GET/SAVE_WIKI_PAGE` and `GET/SAVE_FULL_WIKI` already delegate to `snapshotCurrentPage()` / `snapshotFullWiki()`. `main()` already routes via `isWikiPageUrl`, so once `wikiUrl.ts` matches Devin, `initWikiPageMode()` runs unchanged.

#### [MODIFY] [src/content/probe.ts](file:///Users/test/Documents/work/wikeep/src/content/probe.ts)
- In `snapshotCurrentPage()`: if `location.host === "app.devin.ai"`, skip `waitForRscRaw` and call `parseWikiPage(document, location.href, null)` directly.
- In `snapshotFullWiki()`: branch on host. For Devin, call the **new DOM traversal builder** (below) instead of `parseFullWiki`, which would return `null`.

#### [NEW] DOM full-wiki builder — `src/parser/devinWikiParser.ts`
Add `async function buildFullWikiFromDom(document, url): Promise<WikiPageSnapshot | null>` that imports `findContentRoot`, `sanitizeForMarkdown`, `collectDiagramIndexes` (exported from `deepwikiWikiParser.ts`) and `elementToMarkdown`, then:
1. Finds sidebar outline buttons: `document.querySelectorAll('[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"] button[aria-label]')`, excluding control items ("Back", "Upgrade", "Settings", "Help", "Download apps", …) via an exclusion set.
2. Records the original `location.hash`.
3. For each button in order: dispatch `.click()`, then **wait for content to settle** — poll for `.prose-main h1` text change *and* content-length stability (so lazy-rendered mermaid/SVG diagrams paint), with a hard fallback (~1000ms, raised from 600ms for diagram safety).
4. Run `sanitizeForMarkdown` + `elementToMarkdown` on each settled `.prose-main`; collect per-section markdown.
5. Join sections into one document; restore the original hash.
6. Return a hand-constructed `WikiPageSnapshot`: `kind: "full-wiki"`, `sectionPath: "__full-wiki"`, `markdownSource: "dom"`, computed `contentHash`/`wordCount`, `relatedSections` from the collected button labels.

#### Single-page parse for Devin
- Reuse `parseWikiPage` (works on `.prose-main`), but add a Devin-aware title fallback so the DeepWiki suffix-strip doesn't leave Devin branding in the title. `relatedSections` from `extractToc` will be empty on Devin (acceptable, or populate from sidebar labels).

### Background — no change required
- `background/handlers/wiki.ts` `save`/`saveFull` already request the snapshot from the content script (`requestWikiSnapshot`) and persist via `upsertWikiPage`. The Devin snapshot flows through unchanged.

---

## Verification Plan

### Automated Tests
- **URL tests** in `tests/` for `wikiUrl`: Devin repo root, Devin with `?branch=`, Devin with `#1.2` and `#1.2-slug`, and negative Devin paths. Confirm DeepWiki cases still pass.
- **Parser fixture tests** (riskiest new code — do not skip):
  - jsdom fixture of a Devin page → `parseWikiPage(doc, url, null)` returns DOM markdown with `markdownSource: "dom"` and correct title.
  - Fixture / mocked button sequence → `buildFullWikiFromDom` compiles multi-section markdown, excludes control buttons, restores original hash.
- Run:
  ```bash
  nix develop --command npm run test
  ```

### Manual Verification
- `npm run build`; load the unpacked extension in Chrome.
- Open `https://app.devin.ai/org/<org-slug>/wiki/drunkod/nix-config-1?branch=master`.
- Confirm Save buttons enable (gated by `isWikiPageUrl`).
- Save single page: saves instantly (RSC wait bypassed), correct title, DOM markdown, diagrams present.
- Save Full Wiki: sequential sidebar traversal, all sections compiled, diagrams rendered, hash restored, saved to IndexedDB.
