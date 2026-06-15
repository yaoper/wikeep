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
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
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

  return markdown
    .slice(pageHeading.index, nextPageHeading?.index ?? markdown.length)
    .trim();
}

/**
 * Best-effort recovery of one current wiki page's source Markdown from the raw
 * RSC string delivered by the MAIN-world probe. DeepWiki's RSC payload can
 * contain the whole wiki, so callers must pass the live page title/sectionPath;
 * this function slices from that page heading to the next same/higher-level
 * heading instead of returning the entire wiki bundle.
 */
export function extractWikiMarkdownFromRsc(
  joined: string,
  options: WikiRscExtractionOptions = {},
): string | null {
  if (!joined) return null;

  const unescaped = decodeRscText(joined);
  const startIdx = unescaped.search(/(^|\n)#{1,2} \S/);
  if (startIdx === -1) return null;

  const body = unescaped.slice(startIdx);
  const pageMarkdown = sliceSinglePageMarkdown(body, options);
  if (!pageMarkdown) return null;

  return /#{1,3} /.test(pageMarkdown) && pageMarkdown.length > 200
    ? pageMarkdown
    : null;
}
