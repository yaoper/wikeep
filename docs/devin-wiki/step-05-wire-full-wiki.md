# Step 5 — Wire the full-wiki builder into `snapshotFullWiki()`

**File:** `src/content/probe.ts` (MODIFY)

## Why

`snapshotFullWiki()` currently calls `parseFullWiki`, which returns `null` for
Devin (RSC-only). Branch on host so Devin uses the new DOM builder from Step 4.

## Snippet

Add the import and branch:

```ts
// top of src/content/probe.ts
import { buildFullWikiFromDom } from "../parser/devinWikiParser";
```

```ts
export async function snapshotFullWiki(): Promise<WikiPageSnapshot | null> {
  // Devin: no RSC stream — traverse the sidebar DOM and compile.
  if (location.host === "app.devin.ai") {
    return buildFullWikiFromDom(document, location.href);
  }

  const rscRaw = await waitForRscRaw(2500);
  return parseFullWiki(document, location.href, rscRaw);
}
```

## Flow recap (no other edits needed)

1. Side panel → `SAVE_FULL_WIKI` → `background/handlers/wiki.ts#saveFull`.
2. `saveFull` has no `payload.snapshot`, so it calls
   `requestWikiSnapshot(tabId, "GET_FULL_WIKI_SNAPSHOT")`.
3. Content script `handleRuntimeMessage` → `snapshotFullWiki()` → (Devin)
   `buildFullWikiFromDom`.
4. The returned snapshot goes back to `saveFull` → `upsertWikiPage` → IndexedDB.

The `saveFull` "Reload the DeepWiki page" error message still fires only when the
builder returns `null` (e.g. no sidebar buttons found) — consider broadening that
copy to mention Devin, but it is not required for function.
