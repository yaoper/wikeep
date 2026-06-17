# Step 1 — Devin URL matching in `wikiUrl.ts`

**File:** `src/shared/wikiUrl.ts` (MODIFY)

## Why

`isWikiPageUrl` / `parseWikiUrl` are the single source of truth: `background/handlers/wiki.ts`
(`detected`) and the side-panel Save UI both gate on them, so matching Devin here
lights up the Save buttons everywhere automatically.

Devin differs from DeepWiki in two ways that forbid reusing `WIKI_PAGE_RE`:

- Path shape: `app.devin.ai/org/<org-slug>/wiki/<owner>/<repo>` (extra `org/<slug>/wiki` prefix).
- `sectionPath` lives in the **hash** (`#1.2` / `#1.2-slug`), not the path.

So add a **second matcher** and branch by host.

## Full file

```ts
export interface WikiUrlParts {
  owner: string;
  repo: string;
  sectionPath?: string;
}

// DeepWiki: owner/repo with optional path-encoded section.
const WIKI_PAGE_RE =
  /^https?:\/\/deepwiki\.com\/([^/]+)\/([^/]+)(?:\/(\d+(?:\.\d+)*-[^/?#]+))?\/?(?:[?#].*)?$/;

// Devin: app.devin.ai/org/<org-slug>/wiki/<owner>/<repo> (+ optional ?branch=, #hash).
const DEVIN_WIKI_RE =
  /^https?:\/\/app\.devin\.ai\/org\/[^/]+\/wiki\/([^/?#]+)\/([^/?#]+)\/?(?:[?#].*)?$/;

const RESERVED_FIRST_SEGMENTS = new Set(["search", "login", "settings", "about", "api"]);

function isDevinHost(url: string): boolean {
  try {
    return new URL(url).host === "app.devin.ai";
  } catch {
    return false;
  }
}

/** Extract `1.2` from `#1.2` or `#1.2-some-slug`; undefined if no numeric hash. */
function parseDevinSectionPath(url: string): string | undefined {
  let hash = "";
  try {
    hash = new URL(url).hash.replace(/^#/, "");
  } catch {
    return undefined;
  }
  const m = hash.match(/^(\d+(?:\.\d+)*)(?:-.*)?$/);
  return m ? m[1] : undefined;
}

export function isWikiPageUrl(url: string): boolean {
  if (isDevinHost(url)) {
    return DEVIN_WIKI_RE.test(url);
  }
  if (/^https?:\/\/deepwiki\.com\/search\//.test(url)) return false;
  const m = url.match(WIKI_PAGE_RE);
  if (!m) return false;
  return !RESERVED_FIRST_SEGMENTS.has(m[1].toLowerCase());
}

export function parseWikiUrl(url: string): WikiUrlParts | null {
  if (!isWikiPageUrl(url)) return null;

  if (isDevinHost(url)) {
    const m = url.match(DEVIN_WIKI_RE);
    if (!m) return null;
    return {
      owner: m[1],
      repo: m[2],
      sectionPath: parseDevinSectionPath(url),
    };
  }

  const m = url.match(WIKI_PAGE_RE);
  if (!m) return null;
  return {
    owner: m[1],
    repo: m[2],
    sectionPath: m[3] || undefined,
  };
}
```

## Notes

- `owner`/`repo` may be URL-encoded (the org slug contains Cyrillic in the test
  URL). We keep the raw decoded values from the path segment; downstream
  `pageRepository` keys on `owner/repo`, which is fine as long as it's consistent.
- Negative cases the regex correctly rejects: `app.devin.ai/org/<slug>` (no `/wiki/`),
  `app.devin.ai/settings`, and any non-`app.devin.ai` Devin host.
