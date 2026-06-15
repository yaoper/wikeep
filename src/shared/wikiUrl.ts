export interface WikiUrlParts {
  owner: string;
  repo: string;
  sectionPath?: string;
}

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
  const m = url.match(WIKI_PAGE_RE);
  if (!m) return null;
  return {
    owner: m[1],
    repo: m[2],
    sectionPath: m[3] || undefined
  };
}
