import type { WikiPageSnapshot } from "../shared/types";
import { normalizeText, stableHash } from "../shared/utils";
import { parseWikiUrl } from "../shared/wikiUrl";
import { extractWikiMarkdownFromRsc } from "./deepwikiRscSource";
import { elementToMarkdown } from "./htmlToMarkdown";

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

  const sanitized = sanitizeForMarkdown(root);
  const rscMarkdown = rscRaw ? extractWikiMarkdownFromRsc(rscRaw) : null;
  const markdown =
    rscMarkdown ?? elementToMarkdown(sanitized, { sourceUrl: url });
  const cleanedText = normalizeText(getElementText(sanitized));

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
    hasDiagrams:
      /```mermaid/.test(markdown) ||
      /data-wikeep-diagram/.test(sanitized.innerHTML),
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
  const cleaned = normalizeText(getElementText(sanitizeForMarkdown(root)));
  return {
    contentHash: stableHash(cleaned),
    indexedCommit: extractIndexedCommit(root),
  };
}
