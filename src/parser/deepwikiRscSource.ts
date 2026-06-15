export interface WikiRscExtractionOptions {
  /** Visible page title from the live DOM, e.g. "Build System and Tooling". */
  title?: string;
  /** URL section path, e.g. "6-build-system-and-tooling". */
  sectionPath?: string;
}

interface MarkdownHeading {
  index: number;
  level: number;
  text: string;
}

interface MarkdownRule {
  index: number;
  endIndex: number;
}

function decodeRscText(joined: string): string {
  return joined
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");
}

function normalizeHeading(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function titleFromSectionPath(sectionPath?: string): string | undefined {
  if (!sectionPath) return undefined;
  const slug = sectionPath.replace(/^\d+(?:\.\d+)*-/, "");
  return slug.replace(/-/g, " ");
}

function isRepositoryOverview(options: WikiRscExtractionOptions): boolean {
  const title = normalizeHeading(options.title ?? "");
  const pathTitle = normalizeHeading(titleFromSectionPath(options.sectionPath) ?? "");
  return title.endsWith("repository overview") || pathTitle.endsWith("repository overview");
}

function collectHorizontalRules(markdown: string): MarkdownRule[] {
  const rules: MarkdownRule[] = [];
  const re = /(?:^|\n)(?:-{3,}|\*{3,}|_{3,})\s*(?:\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    const raw = match[0] ?? "";
    const leadingNewline = raw.startsWith("\n") ? 1 : 0;
    rules.push({
      index: match.index + leadingNewline,
      endIndex: match.index + raw.length,
    });
  }
  return rules;
}

function hasSourcesBlock(markdown: string): boolean {
  return /(?:^|\n)\s*(?:Sources?|References?)\s*:/i.test(markdown);
}

function hasChildSummaryHeading(markdown: string): boolean {
  return /(?:^|\n)#{2,3}\s+\S/.test(markdown);
}

function trimRepositoryOverviewMarkdown(markdown: string): string {
  // DeepWiki overview pages can include child-page summaries after horizontal
  // rules. However, some payloads may also include an earlier rule after the
  // "Relevant source files" block. For a unique page save, keep the full
  // overview body and trim only at the separator after the overview Sources
  // block, which is where embedded child summaries begin.
  const rules = collectHorizontalRules(markdown);
  if (rules.length === 0) return markdown;

  const afterSourcesRule = rules.find((rule) => {
    const before = markdown.slice(0, rule.index);
    const after = markdown.slice(rule.endIndex);
    return hasSourcesBlock(before) && hasChildSummaryHeading(after);
  });

  if (afterSourcesRule) {
    return markdown.slice(0, afterSourcesRule.index).trim();
  }

  // Fallback for older/variant DeepWiki markup: trim at the first separator
  // that follows a substantial overview body and is followed by child headings.
  // This avoids cutting immediately after "Relevant source files" when the real
  // page text has not appeared yet.
  const bodyBoundary = rules.find((rule) => {
    const before = markdown.slice(0, rule.index).trim();
    const after = markdown.slice(rule.endIndex);
    return before.length > 800 && hasChildSummaryHeading(after);
  });

  return bodyBoundary ? markdown.slice(0, bodyBoundary.index).trim() : markdown;
}

function collectHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    headings.push({
      index: match.index,
      level: match[1]?.length ?? 1,
      text: match[2] ?? "",
    });
  }
  return headings;
}

function findPageHeading(
  headings: MarkdownHeading[],
  options: WikiRscExtractionOptions,
): MarkdownHeading | undefined {
  const candidates = [
    options.title,
    titleFromSectionPath(options.sectionPath),
  ]
    .map((value) => (value ? normalizeHeading(value) : ""))
    .filter(Boolean);

  if (candidates.length === 0) return undefined;

  const matches = (heading: MarkdownHeading) =>
    candidates.some((candidate) => normalizeHeading(heading.text) === candidate);

  // DeepWiki page bodies normally start with an H1. Prefer that so inner H2/H3
  // subsections do not accidentally become the page boundary.
  return (
    headings.find((heading) => heading.level === 1 && matches(heading)) ??
    headings.find((heading) => heading.level <= 2 && matches(heading))
  );
}

function sliceSinglePageMarkdown(
  markdown: string,
  options: WikiRscExtractionOptions,
): string | null {
  const headings = collectHeadings(markdown);
  if (headings.length === 0) return null;

  const pageHeading = findPageHeading(headings, options);
  if (!pageHeading) return null;

  const nextPageHeading = headings.find(
    (heading) => heading.index > pageHeading.index && heading.level <= pageHeading.level,
  );

  let pageMarkdown = markdown
    .slice(pageHeading.index, nextPageHeading?.index ?? markdown.length)
    .trim();

  if (isRepositoryOverview(options)) {
    pageMarkdown = trimRepositoryOverviewMarkdown(pageMarkdown);
  }

  return pageMarkdown;
}

function extractMarkdownBody(joined: string): string | null {
  if (!joined) return null;

  const unescaped = decodeRscText(joined);
  const startIdx = unescaped.search(/(^|\n)#{1,2} \S/);
  if (startIdx === -1) return null;

  const body = unescaped.slice(startIdx).trim();
  return /#{1,3} /.test(body) && body.length > 200 ? body : null;
}

/**
 * Best-effort recovery of one current wiki page's source Markdown from the raw
 * RSC string delivered by the MAIN-world probe. DeepWiki's RSC payload can
 * contain the whole wiki, so callers must pass the live page title/sectionPath;
 * this function slices from that page heading to the next same/higher-level
 * heading instead of returning the entire wiki bundle. Repository overview pages
 * are additionally trimmed at the child-summary separator after the overview
 * Sources block, preserving the real overview text above it.
 */
export function extractWikiMarkdownFromRsc(
  joined: string,
  options: WikiRscExtractionOptions = {},
): string | null {
  const body = extractMarkdownBody(joined);
  if (!body) return null;

  const pageMarkdown = sliceSinglePageMarkdown(body, options);
  if (!pageMarkdown) return null;

  return /#{1,3} /.test(pageMarkdown) && pageMarkdown.length > 200
    ? pageMarkdown
    : null;
}

/**
 * Recover the full repository wiki Markdown from the same RSC payload.
 * This intentionally does NOT slice to the active page and is used only by the
 * explicit "Save full wiki" button.
 */
export function extractFullWikiMarkdownFromRsc(joined: string): string | null {
  return extractMarkdownBody(joined);
}
