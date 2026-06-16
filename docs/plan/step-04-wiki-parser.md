# Step 4 — Wiki page parser

**File:** `src/parser/deepwikiWikiParser.ts` (new)

Turns a live DeepWiki wiki page (`Document`) into a `WikiPageSnapshot`: find the
content root, sanitise a clone (strip UI chrome, mark diagrams), convert to
Markdown, and extract metadata (title, indexed commit, TOC, content hash).

Verified DOM facts (from live research):

- Content lives in the **largest `[class*="prose"]`** element.
- Heading "copy‑link" controls are small `<svg>` inside hover anchors with
  `opacity-0` classes → strip.
- Diagrams are pre‑rendered `<svg>` with no inline Mermaid source. **Preferred
  path:** recover the real Mermaid from the RSC payload (see
  [step-12-diagrams.md](step-12-diagrams.md)); the placeholder below is only the
  DOM fallback when RSC parsing fails.
- Citations link `github.com/{owner}/{repo}/blob/{commitSha}/…` → indexed commit.

---

## 4.1 `src/parser/deepwikiWikiParser.ts`

```ts
import type { WikiPageSnapshot } from '../shared/types';
import { normalizeText, stableHash } from '../shared/utils';
import { parseWikiUrl } from '../shared/wikiUrl';
import { elementToMarkdown } from './htmlToMarkdown';
import { extractWikiMarkdownFromRsc } from './deepwikiRscSource'; // Step 12

/** Pick the visible article container: the largest prose block. */
export function findContentRoot(document: Document): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="prose"]')
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.innerText.length - a.innerText.length)[0];
}

/**
 * Identify which <svg>s (by index within `root`) are real diagrams.
 * MUST run on the LIVE element — a detached clone has 0×0 layout, so
 * getBoundingClientRect() there returns zeros and the size test fails.
 */
export function collectDiagramIndexes(liveRoot: HTMLElement): Set<number> {
  const result = new Set<number>();
  Array.from(liveRoot.querySelectorAll<SVGElement>('svg')).forEach((svg, index) => {
    const rect = svg.getBoundingClientRect();
    const isBig = rect.width > 120 || rect.height > 120;
    const hasDiagramHost = !!svg.closest('figure, [class*="diagram"]');
    const isHoverIcon = !!svg.closest('[class*="opacity-0"]'); // heading copy-link icons
    if (!isHoverIcon && (isBig || hasDiagramHost)) {
      result.add(index);
    }
  });
  return result;
}

/**
 * Return a sanitised clone safe to convert.
 * Diagram indexes are measured on the LIVE root first, then applied to the
 * clone by position (clone preserves element order). Live DOM is never mutated.
 */
export function sanitizeForMarkdown(liveRoot: HTMLElement): HTMLElement {
  const diagramIdx = collectDiagramIndexes(liveRoot); // measured on LIVE layout
  const clone = liveRoot.cloneNode(true) as HTMLElement;

  // 1. Remove heading copy-link controls (hover-only icons).
  clone.querySelectorAll('[class*="opacity-0"]').forEach((el) => el.remove());

  // 2. Remove diagram zoom controls / toolbars.
  clone
    .querySelectorAll('button[aria-label*="Zoom"], button[title*="Zoom"]')
    .forEach((el) => el.remove());

  // 3. Walk the clone's SVGs in the SAME order; replace diagrams, drop icons.
  Array.from(clone.querySelectorAll('svg')).forEach((svg, index) => {
    if (diagramIdx.has(index)) {
      const placeholder = clone.ownerDocument!.createElement('div');
      placeholder.setAttribute('data-wikeep-diagram', '1');
      const host = svg.closest('figure, [class*="diagram"]') ?? svg;
      host.replaceWith(placeholder);
    } else {
      svg.remove(); // small icon
    }
  });

  return clone;
}

function extractIndexedCommit(root: HTMLElement): string | undefined {
  const href = root
    .querySelector('a[href*="/blob/"]')
    ?.getAttribute('href');
  return href?.match(/\/blob\/([0-9a-f]{7,40})\//)?.[1];
}

function extractTitle(document: Document, root: HTMLElement): string {
  const h1 = root.querySelector('h1')?.textContent?.trim();
  if (h1) return h1;
  return normalizeText(document.title.replace(/\s*\|\s*DeepWiki$/i, ''));
}

function extractToc(document: Document, owner: string, repo: string): string[] {
  const prefix = `/${owner}/${repo}/`;
  const hrefs = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((a) => a.getAttribute('href') ?? '')
    .filter((h) => h.startsWith(prefix) && /\/\d+(?:\.\d+)*-/.test(h));
  return Array.from(new Set(hrefs));
}

/**
 * Main entry: Document → snapshot (or null if not a parseable wiki page).
 * `rscRaw` is the raw RSC string from the MAIN-world probe (Step 12); when
 * present and parseable it is the preferred, diagram-complete Markdown source.
 */
export function parseWikiPage(
  document: Document,
  url: string,
  rscRaw?: string | null
): WikiPageSnapshot | null {
  const parts = parseWikiUrl(url);
  if (!parts) return null;

  const root = findContentRoot(document);
  if (!root || root.innerText.trim().length < 200) {
    return null; // not rendered yet / not a content page
  }

  const sanitized = sanitizeForMarkdown(root); // measures diagrams on live root
  const rscMarkdown = rscRaw ? extractWikiMarkdownFromRsc(rscRaw) : null;
  const markdown = rscMarkdown ?? elementToMarkdown(sanitized, { sourceUrl: url });
  const cleanedText = normalizeText(sanitized.innerText);

  return {
    url,
    owner: parts.owner,
    repo: parts.repo,
    sectionPath: parts.sectionPath,
    title: extractTitle(document, root),
    markdown,
    contentHash: stableHash(cleanedText),
    indexedCommit: extractIndexedCommit(root),
    relatedSections: extractToc(document, parts.owner, parts.repo),
    wordCount: cleanedText.split(/\s+/).filter(Boolean).length,
    hasDiagrams: /```mermaid/.test(markdown) || /data-wikeep-diagram/.test(sanitized.innerHTML),
    capturedAt: Date.now()
  };
}

/** Cheap fingerprint for the freshness handshake (no full conversion). */
export function fingerprintWikiPage(
  document: Document,
  url: string
): { contentHash: string; indexedCommit?: string } | null {
  const root = findContentRoot(document);
  if (!root) return null;
  const cleaned = normalizeText(sanitizeForMarkdown(root).innerText);
  return {
    contentHash: stableHash(cleaned),
    indexedCommit: extractIndexedCommit(root)
  };
}
```

---

## 4.2 Notes

- `isDiagramSvg` relies on `getBoundingClientRect`; in the content script it runs
  against the live layout (real sizes). In jsdom tests, rects are 0 — pass
  diagram fixtures that also have a zoom sibling or a `figure`/`diagram` wrapper
  so the heuristic still fires (see Step 10).
- The `< 200` char guard prevents saving a half‑rendered page; the content script
  retries via a `MutationObserver` (Step 6), reusing the existing pending pattern.
- `contentHash` is computed from cleaned **text** (not Markdown) so cosmetic
  Markdown differences don't cause false "stale" results.

---

## Checklist

- [ ] `findContentRoot` picks the largest prose block.
- [ ] `sanitizeForMarkdown` strips copy/zoom icons and replaces diagrams.
- [ ] `parseWikiPage` returns a full snapshot; `fingerprintWikiPage` returns the cheap hash.
- [ ] `indexedCommit` + `relatedSections` extracted.
- [ ] `npm run typecheck` passes.
