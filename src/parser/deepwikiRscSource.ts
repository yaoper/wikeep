export interface WikiRscExtractionOptions {
  title?: string;
  sectionPath?: string;
}

interface MarkdownHeading {
  index: number;
  level: number;
  text: string;
}

function decodeRscText(joined: string): string {
  return joined
    .split("\\n").join("\n")
    .split('\\"').join('"')
    .split("\\t").join("\t")
    .split("\\r").join("\r");
}

function normalizeHeading(text: string): string {
  return text
    .replaceAll("`", "")
    .replaceAll("*", "")
    .replaceAll("_", "")
    .replaceAll("~", "")
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
  const candidates = [options.title, titleFromSectionPath(options.sectionPath)]
    .map((value) => (value ? normalizeHeading(value) : ""))
    .filter(Boolean);

  if (candidates.length === 0) return undefined;

  const matches = (heading: MarkdownHeading) =>
    candidates.some((candidate) => normalizeHeading(heading.text) === candidate);

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

function extractMarkdownBody(joined: string): string | null {
  if (!joined) return null;

  const unescaped = decodeRscText(joined);
  const startIdx = unescaped.search(/(^|\n)#{1,2} \S/);
  if (startIdx === -1) return null;

  const body = unescaped.slice(startIdx).trim();
  return /#{1,3} /.test(body) && body.length > 200 ? body : null;
}

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

export function extractFullWikiMarkdownFromRsc(joined: string): string | null {
  return extractMarkdownBody(joined);
}
