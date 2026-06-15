import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { WikiPageSnapshot } from '../src/shared/types';
import {
  deleteWikiPage,
  getWikiPage,
  listWikiPages,
  lookupWikiPageByUrl,
  upsertWikiPage
} from '../src/storage/pageRepository';

const base: WikiPageSnapshot = {
  url: 'https://deepwiki.com/facebook/react/1.1-x',
  owner: 'facebook',
  repo: 'react',
  sectionPath: '1.1-x',
  title: 'X',
  markdown: '# X',
  contentHash: 'aaa',
  indexedCommit: 'bf76955e',
  wordCount: 10,
  capturedAt: Date.now()
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
    expect(list).toHaveLength(1);
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
