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
