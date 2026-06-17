import type { WikiMarkdownSource, WikiPageSnapshot } from "../shared/types";
import { normalizeText, stableHash } from "../shared/utils";
import { parseWikiUrl } from "../shared/wikiUrl";
import {
  extractFullWikiMarkdownFromRsc,
  extractWikiMarkdownFromRsc,
} from "./deepwikiRscSource";
import { elementToMarkdown } from "./htmlToMarkdown";

const FULL_WIKI_SECTION_PATH = "__full-wiki";
const DEBUG_WIKI_SAVE = false;


function getElementText(element: HTMLElement): string {
  return element.innerText || element.textContent || "";
}

function scoreContentRootCandidate(
  element: HTMLElement,
  pageTitle: string,
): number {
  const text = getElementText(element).trim();
  if (!text) return Number.NEGATIVE_INFINITY;

  let score = text.length;
  const heading = element.querySelector("h1")?.textContent?.trim() ?? "";

  if (heading && normalizeText(heading) === normalizeText(pageTitle)) {
    score += 100_000;
  }

  if (element.matches("main, article, [role='main']")) {
    score += 10_000;
  }

  if (element.closest("main, article, [role='main']")) {
    score += 5_000;
  }

  score += element.querySelectorAll("h2, h3").length * 500;
  score += element.querySelectorAll("hr").length * 100;

  return score;
}

export function findContentRoot(document: Document): HTMLElement | null {
  const pageTitle = normalizeText(
    document.querySelector("h1")?.textContent?.trim() ||
      document.title.replace(/\s*\|\s*(DeepWiki|Devin)\s*$/i, ""),
  );

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="prose"]'),
  ).filter((candidate) => getElementText(candidate).trim().length >= 200);

  if (candidates.length === 0) return null;

  return (
    candidates.sort(
      (a, b) =>
        scoreContentRootCandidate(b, pageTitle) -
        scoreContentRootCandidate(a, pageTitle),
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

/**
 * Read an <h1>'s heading text without the interactive copy-anchor affordance.
 * Devin's heading contains a "copy link" control whose text ("Link", and a
 * "copied!" toast) would otherwise concatenate into the title, e.g.
 * "Getting Started & SetupLink copied!".
 */
function cleanHeadingText(h1: HTMLElement | null): string {
  if (!h1) return "";
  const clone = h1.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("a, button, svg, [role='button'], [aria-hidden='true']")
    .forEach((node) => node.remove());
  return (clone.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*Link\s*copied!?\s*$/i, "")
    .replace(/\s*copied!?\s*$/i, "")
    .trim();
}

/** First Markdown heading text, e.g. "# Getting Started & Setup" -> "Getting Started & Setup". */
function firstMarkdownHeading(markdown?: string | null): string {
  if (!markdown) return "";
  const m = markdown.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].trim() : "";
}

function extractTitle(
  document: Document,
  root: HTMLElement,
  preMarkdown?: string | null,
): string {
  // The authoritative source (Devin fiber / RSC) Markdown gives the cleanest title.
  const fromMarkdown = firstMarkdownHeading(preMarkdown);
  if (fromMarkdown) return fromMarkdown;

  const h1 = cleanHeadingText(root.querySelector("h1"));
  if (h1) return h1;

  return normalizeText(document.title.replace(/\s*\|\s*(DeepWiki|Devin)\s*$/i, ""));
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
  preMarkdown?: string | null,
): WikiPageSnapshot | null {
  const parts = parseWikiUrl(url);
  if (!parts) return null;

  const root = findContentRoot(document);
  if (!root || getElementText(root).trim().length < 200) {
    return null;
  }

  const sanitized = sanitizeForMarkdown(root);

  // Devin: the original Markdown (with ```mermaid fences) is supplied directly
  // from the page's React props via the MAIN-world probe. Prefer it over both
  // RSC and DOM so diagrams survive.
  const fiberMarkdown =
    preMarkdown && preMarkdown.trim().length > 0
      ? normalizeText(preMarkdown)
      : null;

  // Prefer the Markdown heading for the title (avoids DOM copy-anchor artifacts).
  const title = extractTitle(document, root, fiberMarkdown);
  const rscMarkdown =
    !fiberMarkdown && rscRaw
      ? extractWikiMarkdownFromRsc(rscRaw, {
          title,
          sectionPath: parts.sectionPath,
        })
      : null;
  const markdown =
    fiberMarkdown ??
    rscMarkdown ??
    elementToMarkdown(sanitized, { sourceUrl: url });
  const markdownSource: WikiMarkdownSource = fiberMarkdown
    ? "fiber"
    : rscMarkdown
      ? "rsc"
      : "dom";
  const cleanedText = normalizeText(getElementText(sanitized));

  if (DEBUG_WIKI_SAVE) {
    console.debug("[wikeep] wiki snapshot", {
      title,
      sectionPath: parts.sectionPath,
      hasRscRaw: !!rscRaw,
      rscRawLength: rscRaw?.length ?? 0,
      rscMarkdownLength: rscMarkdown?.length ?? 0,
      markdownSource,
      hasMermaid: markdown.includes("```mermaid"),
      hasLiveDiagramSvg: collectDiagramIndexes(root).size > 0,
    });
  }


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
  const sanitized = sanitizeForMarkdown(root);
  return {
    contentHash: stableHash(normalizeText(getElementText(sanitized))),
    indexedCommit: extractIndexedCommit(root),
  };
}
