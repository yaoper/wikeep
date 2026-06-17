# Step 8 — Preserve Mermaid diagrams (React-fiber source)

## Symptom

Saved Devin pages showed `> 📊 Diagram omitted — view it on the source page`
instead of ` ```mermaid ` blocks.

## Root cause

Devin renders Mermaid as inline `<svg class="flowchart">`; the **original
Markdown source is not in the DOM**. It lives only in the page's React props
(`memoizedProps.children` / `content`). The content script runs in the
**isolated world**, which cannot read React fiber expandos on DOM nodes, so the
DOM→Turndown fallback in `sanitizeForMarkdown` could only replace the rendered
SVG with a placeholder → "Diagram omitted".

Confirmed live: the diagram wrapper's fiber has `props.content = "graph TD ..."`,
and an ancestor renderer holds the **entire page Markdown** (with ` ```mermaid `
fences) as a string prop.

## Fix — MAIN-world Markdown probe (mirrors the DeepWiki RSC probe)

| File | Change |
|---|---|
| `src/content/devinSourceProbe.ts` (NEW) | MAIN-world script. On `wikeep-devin-md-request`, climbs from `.prose-main`'s fiber to the React root, DFS-finds the longest Markdown-looking string prop (the active page's source), posts back `{ source: "wikeep-devin-md", requestId, markdown }`. |
| `scripts/build.mjs` | Third IIFE build → `dist/devinSourceProbe.js`. |
| `public/manifest.json` | New `content_scripts` entry: `devinSourceProbe.js`, `world: "MAIN"`, matched to `app.devin.ai/org/*/wiki/*`. |
| `src/content/probe.ts` | `captureDevinMessages()` listener + `requestDevinMarkdown(timeout)` (request/response correlated by `requestId`). `snapshotCurrentPage` and `snapshotFullWiki` now feed fiber Markdown into the parser. |
| `src/content/index.ts` | `initWikiPageMode()` calls `captureDevinMessages()`. |
| `src/parser/deepwikiWikiParser.ts` | `parseWikiPage(doc, url, rscRaw?, preMarkdown?)` — when `preMarkdown` is present it wins over RSC/DOM; `markdownSource: "fiber"`. `contentHash` stays DOM-based so freshness/fingerprint matching is unaffected. |
| `src/parser/devinWikiParser.ts` | `buildFullWikiFromDom(doc, url, fetchSectionMarkdown?)` — pulls each section's Markdown from the probe (falls back to DOM); `markdownSource: "fiber"` when used. |
| `src/shared/types.ts` | `WikiMarkdownSource = "rsc" \| "dom" \| "fiber"`. |
| `src/storage/pageRepository.ts` | Downgrade guard generalized: `isRich = rsc \| fiber`. A lossy `dom` snapshot can no longer overwrite a saved `fiber` page. |

## Why a probe instead of reading the fiber directly

Content scripts get a separate JS context; React's `__reactFiber$…` expandos set
by page scripts are invisible there. Only a `world: "MAIN"` script (or
`chrome.scripting.executeScript({ world: "MAIN" })`) can read them — same reason
DeepWiki needs `pageWorldProbe.js` for `window.__next_f`.

## Verify

```bash
nix develop --command npm run typecheck   # passes
nix develop --command npm run test
nix develop --command npm run build         # emits dist/devinSourceProbe.js
```

Manual: open a diagram-heavy Devin page, Save page, export. Expect markdown to
contain ` ```mermaid `, `markdownSource: "fiber"`, `hasDiagrams: true`, and **no**
"Diagram omitted". Re-saving after a DOM-only read must not clobber it.
