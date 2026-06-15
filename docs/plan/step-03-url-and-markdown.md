# Step 3 — Wiki URL helpers & HTML→Markdown converter

**Files:** `src/shared/wikiUrl.ts` (new), `src/parser/htmlToMarkdown.ts` (new),
`package.json`

---

## 3.1 Dependencies

```bash
npm i turndown turndown-plugin-gfm
npm i -D @types/turndown
```

Commit the updated `package-lock.json` (keeps `npm ci` and the Nix flake
reproducible).

---

## 3.2 Wiki URL helpers — `src/shared/wikiUrl.ts`

```ts
export interface WikiUrlParts {
  owner: string;
  repo: string;
  sectionPath?: string; // e.g. "1.1-repository-structure-and-packages"
}

// owner/repo, optionally followed by "<number(.number)*>-<slug>"; never /search/
const WIKI_PAGE_RE =
  /^https?:\/\/deepwiki\.com\/([^/]+)\/([^/]+)(?:\/(\d+(?:\.\d+)*-[^/?#]+))?\/?(?:[?#].*)?$/;

const RESERVED_FIRST_SEGMENTS = new Set(['search', 'login', 'settings', 'about', 'api']);

export function isWikiPageUrl(url: string): boolean {
  if (/^https?:\/\/deepwiki\.com\/search\//.test(url)) return false;
  const m = url.match(WIKI_PAGE_RE);
  if (!m) return false;
  return !RESERVED_FIRST_SEGMENTS.has(m[1].toLowerCase());
}

export function parseWikiUrl(url: string): WikiUrlParts | null {
  if (!isWikiPageUrl(url)) return null;
  const m = url.match(WIKI_PAGE_RE)!;
  return {
    owner: m[1],
    repo: m[2],
    sectionPath: m[3] || undefined
  };
}
```

Behaviour table (covered by tests in Step 10):

| URL | `isWikiPageUrl` |
|---|---|
| `https://deepwiki.com/facebook/react` | ✅ |
| `https://deepwiki.com/facebook/react/1-react-repository-overview` | ✅ |
| `https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages` | ✅ |
| `https://deepwiki.com/search/what-is-...` | ❌ |
| `https://deepwiki.com/` | ❌ |
| `https://deepwiki.com/settings` | ❌ |
| `https://example.com/facebook/react` | ❌ |

---

## 3.3 HTML→Markdown — `src/parser/htmlToMarkdown.ts`

```ts
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export interface ConverterOptions {
  /** URL used in the diagram placeholder note. */
  sourceUrl?: string;
}

export function createConverter(options: ConverterOptions = {}): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_'
  });

  td.use(gfm); // tables, strikethrough, task lists

  // Preserve fenced-code language from <pre><code class="language-…">
  td.addRule('fencedCodeLang', {
    filter: (node) =>
      node.nodeName === 'PRE' && !!(node as HTMLElement).querySelector('code'),
    replacement: (_content, node) => {
      const code = (node as HTMLElement).querySelector('code')!;
      const lang = code.className.match(/language-([\w+-]+)/)?.[1] ?? '';
      const text = (code.textContent ?? '').replace(/\n$/, '');
      return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
    }
  });

  // Diagram placeholder: any element we tagged with data-wikeep-diagram
  td.addRule('diagramPlaceholder', {
    filter: (node) =>
      node.nodeType === 1 && (node as HTMLElement).hasAttribute('data-wikeep-diagram'),
    replacement: () => {
      const link = options.sourceUrl ? `: ${options.sourceUrl}` : '';
      return `\n\n> 📊 Diagram omitted — view it on the source page${link}\n\n`;
    }
  });

  return td;
}

/** Convert an already-sanitised element (see Step 4) to Markdown. */
export function elementToMarkdown(el: HTMLElement, options: ConverterOptions = {}): string {
  return createConverter(options).turndown(el.innerHTML).trim();
}
```

> Turndown operates on HTML strings or nodes; we pass sanitised `innerHTML` from
> the cloned prose element (Step 4) so the live page is never mutated.

---

## Checklist

- [ ] `turndown`, `turndown-plugin-gfm`, `@types/turndown` installed; lockfile committed.
- [ ] `isWikiPageUrl` / `parseWikiUrl` implemented.
- [ ] `createConverter` / `elementToMarkdown` implemented with code‑lang + diagram rules.
- [ ] `npm run typecheck` passes.
