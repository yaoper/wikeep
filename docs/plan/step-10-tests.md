# Step 10 — Tests

Vitest + jsdom are already configured (`vite.config.ts` → `test.environment:
'jsdom'`). Add focused unit tests and one HTML fixture.

---

## 10.1 URL matching — `tests/wikiUrl.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { isWikiPageUrl, parseWikiUrl } from '../src/shared/wikiUrl';

describe('isWikiPageUrl', () => {
  const yes = [
    'https://deepwiki.com/facebook/react',
    'https://deepwiki.com/facebook/react/1-react-repository-overview',
    'https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages',
    'https://deepwiki.com/vercel/next.js/3.4-react-server-components:-flight-protocol'
  ];
  const no = [
    'https://deepwiki.com/',
    'https://deepwiki.com/search/what-is-the-react-scheduler_abc123',
    'https://deepwiki.com/settings',
    'https://example.com/facebook/react'
  ];
  it.each(yes)('accepts %s', (u) => expect(isWikiPageUrl(u)).toBe(true));
  it.each(no)('rejects %s', (u) => expect(isWikiPageUrl(u)).toBe(false));
});

describe('parseWikiUrl', () => {
  it('parses an overview URL', () => {
    expect(parseWikiUrl('https://deepwiki.com/facebook/react')).toEqual({
      owner: 'facebook', repo: 'react', sectionPath: undefined
    });
  });
  it('parses a section URL', () => {
    expect(parseWikiUrl('https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages')).toEqual({
      owner: 'facebook', repo: 'react', sectionPath: '1.1-repository-structure-and-packages'
    });
  });
});
```

---

## 10.2 HTML→Markdown — `tests/htmlToMarkdown.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createConverter } from '../src/parser/htmlToMarkdown';

describe('createConverter', () => {
  it('converts headings, lists and inline code', () => {
    const md = createConverter().turndown(
      '<h2>Title</h2><ul><li>one</li><li>two</li></ul><p>use <code>npm ci</code></p>'
    );
    expect(md).toContain('## Title');
    expect(md).toContain('- one');
    expect(md).toContain('`npm ci`');
  });

  it('keeps code-block language', () => {
    const md = createConverter().turndown(
      '<pre><code class="language-ts">const x = 1;</code></pre>'
    );
    expect(md).toContain('```ts');
    expect(md).toContain('const x = 1;');
  });

  it('renders GFM tables', () => {
    const md = createConverter().turndown(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
    );
    expect(md).toContain('| A | B |');
    expect(md).toContain('| 1 | 2 |');
  });

  it('emits a diagram placeholder', () => {
    const md = createConverter({ sourceUrl: 'https://deepwiki.com/x/y' })
      .turndown('<div data-wikeep-diagram="1"></div>');
    expect(md).toContain('Diagram omitted');
    expect(md).toContain('https://deepwiki.com/x/y');
  });
});
```

---

## 10.3 Parser — `tests/deepwikiWikiParser.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseWikiPage, fingerprintWikiPage } from '../src/parser/deepwikiWikiParser';

function loadDom(html: string, url: string) {
  document.body.innerHTML = html;
  Object.defineProperty(document, 'title', { value: 'Repository Structure | facebook/react | DeepWiki', configurable: true });
  Object.defineProperty(window, 'location', { value: new URL(url) as unknown as Location, configurable: true });
}

const PROSE = `
  <div class="prose prose-invert">
    <h1>Repository Structure and Packages</h1>
    <p>The repo is a monorepo with <code>packages/*</code> workspaces.</p>
    <pre><code class="language-json">{ "private": true }</code></pre>
    <p>See <a href="https://github.com/facebook/react/blob/bf76955e/package.json">package.json</a>.</p>
    <figure><svg width="400" height="300"><rect/></svg></figure>
    <a href="/facebook/react/2-core-reconciler-architecture">Core</a>
  </div>`;

describe('parseWikiPage', () => {
  beforeEach(() => loadDom(PROSE.repeat(2), 'https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages'));

  it('produces a snapshot with title, markdown, commit and toc', () => {
    const snap = parseWikiPage(document, location.href)!;
    expect(snap).not.toBeNull();
    expect(snap.owner).toBe('facebook');
    expect(snap.repo).toBe('react');
    expect(snap.sectionPath).toBe('1.1-repository-structure-and-packages');
    expect(snap.title).toBe('Repository Structure and Packages');
    expect(snap.markdown).toMatch(/^# Repository Structure and Packages/m); // ATX h1 from <h1>
    expect(snap.markdown).toContain('```json');     // code-lang preserved
    expect(snap.indexedCommit).toBe('bf76955e');
    expect(snap.markdown).toContain('Diagram omitted'); // svg → placeholder
    expect(snap.relatedSections).toContain('/facebook/react/2-core-reconciler-architecture');
    expect(snap.contentHash).toMatch(/^[0-9a-f]+$/);
  });

  it('fingerprint matches parse hash for identical content', () => {
    const fp = fingerprintWikiPage(document, location.href)!;
    const snap = parseWikiPage(document, location.href)!;
    expect(fp.contentHash).toBe(snap.contentHash);
    expect(fp.indexedCommit).toBe(snap.indexedCommit);
  });
});
```

> jsdom returns 0‑sized rects, so the diagram fixture wraps the `<svg>` in a
> `<figure>` (matched by `isDiagramSvg`'s `figure` check) to trigger the
> placeholder path. Keep a fixture that mirrors real DeepWiki markup under
> `tests/fixtures/wiki-page.html` and load it for a higher‑fidelity test.

---

## 10.4 Repository — `tests/pageRepository.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto'; // npm i -D fake-indexeddb
import { upsertWikiPage, listWikiPages, getWikiPage, deleteWikiPage, lookupWikiPageByUrl } from '../src/storage/pageRepository';
import type { WikiPageSnapshot } from '../src/shared/types';

const base: WikiPageSnapshot = {
  url: 'https://deepwiki.com/facebook/react/1.1-x',
  owner: 'facebook', repo: 'react', sectionPath: '1.1-x',
  title: 'X', markdown: '# X', contentHash: 'aaa', indexedCommit: 'bf76955e',
  wordCount: 10, capturedAt: Date.now()
};

describe('pageRepository', () => {
  it('creates then detects change on re-save', async () => {
    const first = await upsertWikiPage(base);
    expect(first.created).toBe(true);
    expect(first.changed).toBe(false);

    const second = await upsertWikiPage({ ...base, contentHash: 'bbb', indexedCommit: 'deadbee' });
    expect(second.created).toBe(false);
    expect(second.changed).toBe(true);

    const list = await listWikiPages();
    expect(list).toHaveLength(1); // same id, updated in place
  });

  it('lookupWikiPageByUrl returns stored fingerprint', async () => {
    await upsertWikiPage(base);
    const look = await lookupWikiPageByUrl(base.url);
    expect(look.exists).toBe(true);
    expect(look.contentHash).toBe('aaa');
  });

  it('deletes', async () => {
    const { pageId } = await upsertWikiPage(base);
    await deleteWikiPage(pageId);
    expect(await getWikiPage(pageId)).toBeNull();
  });
});
```

Add dev deps used above:

```bash
npm i -D fake-indexeddb
```

---

## Checklist

- [ ] `wikiUrl`, `htmlToMarkdown`, `deepwikiWikiParser`, `pageRepository` tests pass.
- [ ] `tests/fixtures/wiki-page.html` captured from a real page.
- [ ] `npm test` green (`vitest run`).
