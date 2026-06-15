import type { WikiPageSnapshot } from "../shared/types";
import { normalizeText, stableHash } from "../shared/utils";
import { parseWikiUrl } from "../shared/wikiUrl";
import {
  extractFullWikiMarkdownFromRsc,
  extractWikiMarkdownFromRsc,
} from "./deepwikiRscSource";
import { elementToMarkdown } from "./htmlToMarkdown";

const FULL_WIKI_SECTION_PATH = "__full-wiki";

function getElementText(element: HTMLElement): string {
  return element.innerText || element.textContent || "";
}

export function findContentRoot(document: Document): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="prose"]'),
  );
  if (candidates.length === 0) return null;
  return (
    candidates.sort(
      (a, b) => getElementText(b).length - getElementText(a).length,
    )[0] ?? null
  );
}

export function collectDiagramIndexes(liveRoot: HTMLElement): Set<number> {
  const result = new Set<number>();
  Array.from(liveRoot.querySelectorAll<SVGElement>("svg")).forEach(
    (svg, index) => {
      const rect = svg.getBoundingClientRect();
      const isBig = rect.width > 120 || rect.height > 120;
      const hasDiagramHost = !!svg.closest('figure, [class*="diagram"]');
      const isHoverIcon = !!svg.closest('[class*="opacity-0"]');
      if (!isHoverIcon && (isBig || hasDiagramHost)) {
        result.add(index);
      }
    },
  );
  return result;
}

export function sanitizeForMarkdown(liveRoot: HTMLElement): HTMLElement {
  const diagramIdx = collectDiagramIndexes(liveRoot);
  const clone = liveRoot.cloneNode(true) as HTMLElement;

  clone.querySelectorAll('[class*="opacity-0"]').forEach((el) => el.remove());
  clone
    .querySelectorAll('button[aria-label*="Zoom"], button[title*="Zoom"]')
    .forEach((el) => el.remove());

  Array.from(clone.querySelectorAll("svg")).forEach((svg, index) => {
    if (diagramIdx.has(index)) {
      const placeholder = clone.ownerDocument.createElement("div");
      placeholder.setAttribute("data-wikeep-diagram", "1");
      placeholder.textContent = "Diagram";
      const host = svg.closest('figure, [class*="diagram"]') ?? svg;
      host.replaceWith(placeholder);
    } else {
      svg.remove();
    }
  });

  return clone;
}

function isRepositoryOverviewPage(title: string, sectionPath?: string): boolean {
  const normTitle = normalizeText(title).toLowerCase();
  const normSection = (sectionPath ?? "").replace(/-/g, " ").toLowerCase();
  return normTitle.endsWith("repository overview") || normSection.endsWith("repository overview");
}

function trimRepositoryOverviewDom(root: HTMLElement): HTMLElement {
  // The overview route can render child-page summaries after <hr> separators.
  // A unique page save should keep only the active overview block; the child
  // pages are saved separately through their own URLs.
  const firstRule = root.querySelector("hr");
  if (!firstRule?.parentNode) return root;

  let node: ChildNode | null = firstRule;
  while (node) {
    const next: ChildNode | null = node.nextSibling;
    node.parentNode?.removeChild(node);
    node = next;
  }

  return root;
}

function extractIndexedCommit(root: HTMLElement): string | undefined {
  const href = root.querySelector('a[href*="/blob/"]')?.getAttribute("href");
  return href?.match(/\/blob\/([0-9a-f]{7,40})\//)?.[1];
}

function extractTitle(document: Document, root: HTMLElement): string {
  const h1 = root.querySelector("h1")?.textContent?.trim();
  if (h1) return h1;
  return normalizeText(document.title.replace(/\s*\|\s*DeepWiki$/i, ""));
}

function extractToc(document: Document, owner: string, repo: string): string[] {
  const prefix = `/${owner}/${repo}/`;
  const hrefs = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a[href]"),
  )
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => h.startsWith(prefix) && /\/\d+(?:\.\d+)*-/.test(h));
  return Array.from(new Set(hrefs));
}

function buildFullWikiUrl(owner: string, repo: string): string {
  return `https://deepwiki.com/${owner}/${repo}#wikeep-full-wiki`;
}

export function parseWikiPage(
  document: Document,
  url: string,
  rscRaw?: string | null,
): WikiPageSnapshot | null {
  const parts = parseWikiUrl(url);
  if (!parts) return null;

  const root = findContentRoot(document);
  if (!root || getElementText(root).trim().length < 200) {
    return null;
  }

  const title = extractTitle(document, root);
  const sanitized = isRepositoryOverviewPage(title, parts.sectionPath)
    ? trimRepositoryOverviewDom(sanitizeForMarkdown(root))
    : sanitizeForMarkdown(root);
  const rscMarkdown = rscRaw
    ? extractWikiMarkdownFromRsc(rscRaw, {
        title,
        sectionPath: parts.sectionPath,
      })
    : null;
  const markdown =
    rscMarkdown ?? elementToMarkdown(sanitized, { sourceUrl: url });
  const markdownSource = rscMarkdown ? "rsc" : "dom";
  const cleanedText = normalizeText(getElementText(sanitized));

  return {
    url,
    owner: parts.owner,
    repo: parts.repo,
    kind: "page",
    sectionPath: parts.sectionPath,
    title,
    markdown,
    markdownSource,
    contentHash: stableHash(cleanedText),
    indexedCommit: extractIndexedCommit(root),
    relatedSections: extractToc(document, parts.owner, parts.repo),
    wordCount: cleanedText.split(/\s+/).filter(Boolean).length,
    hasDiagrams:
      /```mermaid/.test(markdown) ||
      /data-wikeep-diagram/.test(sanitized.innerHTML),
    capturedAt: Date.now(),
  };
}

export function parseFullWiki(
  document: Document,
  url: string,
  rscRaw?: string | null,
): WikiPageSnapshot | null {
  const parts = parseWikiUrl(url);
  if (!parts || !rscRaw) return null;

  const root = findContentRoot(document);
  if (!root) return null;

  const markdown = extractFullWikiMarkdownFromRsc(rscRaw);
  if (!markdown) return null;

  const repoFullName = `${parts.owner}/${parts.repo}`;
  const normalizedMarkdown = normalizeText(markdown);

  return {
    url: buildFullWikiUrl(parts.owner, parts.repo),
    owner: parts.owner,
    repo: parts.repo,
    kind: "full-wiki",
    sectionPath: FULL_WIKI_SECTION_PATH,
    title: `${repoFullName} Full Wiki`,
    markdown: normalizedMarkdown,
    markdownSource: "rsc",
    contentHash: stableHash(normalizedMarkdown),
    indexedCommit: extractIndexedCommit(root),
    relatedSections: extractToc(document, parts.owner, parts.repo),
    wordCount: normalizedMarkdown.split(/\s+/).filter(Boolean).length,
    hasDiagrams: /```mermaid/.test(normalizedMarkdown),
    capturedAt: Date.now(),
  };
}

export function fingerprintWikiPage(
  document: Document,
  url: string,
): { contentHash: string; indexedCommit?: string } | null {
  const parts = parseWikiUrl(url);
  if (!parts) return null;
  const root = findContentRoot(document);
  if (!root) return null;

  const title = extractTitle(document, root);
  const sanitized = isRepositoryOverviewPage(title, parts.sectionPath)
    ? trimRepositoryOverviewDom(sanitizeForMarkdown(root))
    : sanitizeForMarkdown(root);
  const cleaned = normalizeText(getElementText(sanitized));
  return {
    contentHash: stableHash(cleaned),
    indexedCommit: extractIndexedCommit(root),
  };
}
