# Step 3 — Bypass `waitForRscRaw` for Devin single-page saves

**File:** `src/content/probe.ts` (MODIFY)

## Why

`snapshotCurrentPage()` always waits up to 2.5s for an RSC Flight stream before
parsing. Devin never emits one, so that wait is pure latency. `parseWikiPage`
already falls back to DOM markdown when `rscRaw` is `null`, so for Devin we skip
the wait and parse immediately.

## Snippet

Add a host check at the top of `snapshotCurrentPage()`:

```ts
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
```

## Single-page title fallback (parser)

`parseWikiPage` prefers the section `h1`, so titles are usually correct. The only
edge is the fallback in `extractTitle` (`deepwikiWikiParser.ts`) which strips
`/\s*\|\s*DeepWiki$/i` and won't strip Devin's suffix. Make the strip host-aware:

```ts
// src/parser/deepwikiWikiParser.ts
function extractTitle(document: Document, root: HTMLElement): string {
  const h1 = root.querySelector("h1")?.textContent?.trim();
  if (h1) return h1;
  // Strip either brand suffix from the document title fallback.
  return normalizeText(
    document.title.replace(/\s*\|\s*(DeepWiki|Devin)\s*$/i, ""),
  );
}
```

`relatedSections` (from `extractToc`) will be empty on Devin because it looks for
path-style anchors; that is acceptable for single pages. The full-wiki builder in
Step 4 populates `relatedSections` from sidebar labels instead.
