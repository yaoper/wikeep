import type { WikiPageSnapshot } from "../shared/types";
import { normalizeText, stableHash } from "../shared/utils";
import { parseWikiUrl } from "../shared/wikiUrl";
import { findContentRoot, sanitizeForMarkdown } from "./deepwikiWikiParser";
import { elementToMarkdown } from "./htmlToMarkdown";

const FULL_WIKI_SECTION_PATH = "__full-wiki";

// Sidebar items that are app chrome, not wiki outline pages.
const CONTROL_LABELS = new Set(
  [
    "back",
    "upgrade",
    "settings",
    "help",
    "download apps",
    "share",
    "search",
    "toggle sidebar",
  ].map((s) => s.toLowerCase()),
);

const OUTLINE_BUTTON_SELECTOR =
  '[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"] button[aria-label]';

function getOutlineButtons(doc: Document): HTMLButtonElement[] {
  return Array.from(
    doc.querySelectorAll<HTMLButtonElement>(OUTLINE_BUTTON_SELECTOR),
  ).filter((btn) => {
    const label = (btn.getAttribute("aria-label") ?? "").trim().toLowerCase();
    return label.length > 0 && !CONTROL_LABELS.has(label);
  });
}

function getProseMain(doc: Document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>(".prose-main") ?? findContentRoot(doc)
  );
}

/**
 * Wait until the active section has rendered: the h1 text differs from the
 * previous section AND content length is stable across two polls (so
 * lazy-rendered mermaid/SVG diagrams have painted). Falls back at `timeoutMs`.
 */
async function waitForSectionSettled(
  doc: Document,
  previousHeading: string,
  timeoutMs = 1000,
): Promise<void> {
  const started = Date.now();
  let lastLen = -1;
  let stableCount = 0;

  return new Promise((resolve) => {
    const tick = () => {
      const root = getProseMain(doc);
      const heading = root?.querySelector("h1")?.textContent?.trim() ?? "";
      const len = root ? (root.textContent ?? "").length : 0;

      const headingChanged = heading !== "" && heading !== previousHeading;
      const lengthStable = len === lastLen && len > 0;
      stableCount = lengthStable ? stableCount + 1 : 0;
      lastLen = len;

      if ((headingChanged && stableCount >= 1) || Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      window.setTimeout(tick, 120);
    };
    tick();
  });
}

export async function buildFullWikiFromDom(
  document: Document,
  url: string,
): Promise<WikiPageSnapshot | null> {
  const parts = parseWikiUrl(url);
  if (!parts) return null;

  const buttons = getOutlineButtons(document);
  if (buttons.length === 0) return null;

  const originalHash = location.hash;
  const sections: string[] = [];
  const labels: string[] = [];
  let previousHeading = "";

  for (const btn of buttons) {
    const label = (btn.getAttribute("aria-label") ?? "").trim();
    btn.click();
    await waitForSectionSettled(document, previousHeading);

    const root = getProseMain(document);
    if (!root || (root.textContent ?? "").trim().length < 40) continue;

    previousHeading = root.querySelector("h1")?.textContent?.trim() ?? previousHeading;

    const sanitized = sanitizeForMarkdown(root);
    const md = elementToMarkdown(sanitized, { sourceUrl: location.href }).trim();
    if (md) {
      sections.push(md);
      labels.push(label);
    }
  }

  // Restore the user's original location.
  location.hash = originalHash;

  if (sections.length === 0) return null;

  const markdown = normalizeText(sections.join("\n\n---\n\n"));
  const repoFullName = `${parts.owner}/${parts.repo}`;

  return {
    url: `https://app.devin.ai/org/wiki/${repoFullName}#wikeep-full-wiki`,
    owner: parts.owner,
    repo: parts.repo,
    kind: "full-wiki",
    sectionPath: FULL_WIKI_SECTION_PATH,
    title: `${repoFullName} Full Wiki`,
    markdown,
    markdownSource: "dom",
    contentHash: stableHash(markdown),
    relatedSections: labels,
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
    hasDiagrams: /```mermaid/.test(markdown) || /data-wikeep-diagram/.test(markdown),
    capturedAt: Date.now(),
  };
}
