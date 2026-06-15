import type { BackupData, WikiPage, WikiPageSnapshot } from '../shared/types';
import { normalizeText } from '../shared/utils';
import { getDb } from './db';

const SCHEMA_VERSION = 1;

export function buildWikiPageId(snapshot: Pick<WikiPageSnapshot, 'owner' | 'repo' | 'sectionPath'>): string {
  const base = `wiki:${snapshot.owner}/${snapshot.repo}`;
  return snapshot.sectionPath ? `${base}/${snapshot.sectionPath}` : base;
}

export async function upsertWikiPage(
  snapshot: WikiPageSnapshot
): Promise<{ pageId: string; changed: boolean; created: boolean }> {
  const db = await getDb();
  const id = buildWikiPageId(snapshot);
  const now = Date.now();
  const existing = (await db.get('pages', id)) as WikiPage | undefined;

  const changed =
    !!existing &&
    (existing.contentHash !== snapshot.contentHash || existing.indexedCommit !== snapshot.indexedCommit);

  const page: WikiPage = {
    id,
    source: 'deepwiki-wiki',
    owner: snapshot.owner,
    repo: snapshot.repo,
    repoFullName: `${snapshot.owner}/${snapshot.repo}`,
    sectionPath: snapshot.sectionPath,
    hasDiagrams: snapshot.hasDiagrams,
    title: normalizeText(snapshot.title) || `${snapshot.owner}/${snapshot.repo}`,
    url: snapshot.url,
    markdown: snapshot.markdown,
    contentHash: snapshot.contentHash,
    indexedCommit: snapshot.indexedCommit,
    relatedSections: snapshot.relatedSections,
    wordCount: snapshot.wordCount,
    createdAt: existing?.createdAt ?? snapshot.capturedAt ?? now,
    updatedAt: now,
    lastCheckedAt: now,
    isStale: false,
    schemaVersion: SCHEMA_VERSION
  };

  await db.put('pages', page);

  return { pageId: id, changed, created: !existing };
}

export async function listWikiPages(keyword?: string): Promise<WikiPage[]> {
  const db = await getDb();
  const records = (await db.getAllFromIndex('pages', 'by-updatedAt')) as WikiPage[];
  const ordered = records.sort((a, b) => b.updatedAt - a.updatedAt);

  const term = keyword?.trim().toLowerCase();
  if (!term) {
    return ordered;
  }

  return ordered.filter((p) =>
    [p.title, p.repoFullName, p.sectionPath ?? '', p.markdown].join('\n').toLowerCase().includes(term)
  );
}

export async function getWikiPage(pageId: string): Promise<WikiPage | null> {
  const db = await getDb();
  return ((await db.get('pages', pageId)) as WikiPage | undefined) ?? null;
}

export async function getWikiPageByUrl(url: string): Promise<WikiPage | null> {
  const db = await getDb();
  return ((await db.getFromIndex('pages', 'by-url', url)) as WikiPage | undefined) ?? null;
}

export async function lookupWikiPageByUrl(url: string): Promise<{
  exists: boolean;
  pageId?: string;
  contentHash?: string;
  indexedCommit?: string;
}> {
  const page = await getWikiPageByUrl(url);
  if (!page) {
    return { exists: false };
  }

  return {
    exists: true,
    pageId: page.id,
    contentHash: page.contentHash,
    indexedCommit: page.indexedCommit
  };
}

export async function markWikiPageStale(url: string): Promise<void> {
  const db = await getDb();
  const page = await getWikiPageByUrl(url);
  if (!page) return;
  await db.put('pages', { ...page, isStale: true, lastCheckedAt: Date.now() });
}

export async function touchWikiPage(url: string): Promise<void> {
  const db = await getDb();
  const page = await getWikiPageByUrl(url);
  if (!page) return;
  await db.put('pages', { ...page, isStale: false, lastCheckedAt: Date.now() });
}

export async function deleteWikiPage(pageId: string): Promise<void> {
  const db = await getDb();
  await db.delete('pages', pageId);
}

export async function clearAllWikiPages(): Promise<void> {
  const db = await getDb();
  await db.clear('pages');
}

export async function exportWikiPages(): Promise<WikiPage[]> {
  const db = await getDb();
  return (await db.getAll('pages')) as WikiPage[];
}

export async function importWikiPages(backup: BackupData): Promise<number> {
  const pages = backup.pages ?? [];
  if (pages.length === 0) return 0;

  const db = await getDb();
  const tx = db.transaction('pages', 'readwrite');
  for (const page of pages) {
    await tx.store.put(page);
  }
  await tx.done;
  return pages.length;
}
