export interface WikiRscExtractionOptions {
  title?: string;
  sectionPath?: string;
}

interface MarkdownHeading {
  index: number;
  level: number;
  text: string;
}

interface RscTextRecord {
  token: string;
  content: string;
}

function decodeRscText(joined: string): string {
  return joined
    .split("\\n")
    .join("\n")
    .split('\\"')
    .join('"')
    .split("\\t")
    .join("\t")
    .split("\\r")
    .join("\r");
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

function extractRscTextRecords(unescaped: string): RscTextRecord[] {
  const markers: Array<{ index: number; contentStart: number; token: string }> =
    [];
  const re = /(?:^|\n|\d,)([0-9a-z]+):T[0-9a-f]+,1,/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(unescaped))) {
    const token = match[1];
    if (!token) continue;
    markers.push({
      index: match.index,
      contentStart: match.index + match[0].length,
      token,
    });
  }

  return markers
    .map((marker, index) => {
      const nextMarker = markers[index + 1];
      return {
        token: marker.token,
        content: unescaped
          .slice(marker.contentStart, nextMarker?.index ?? unescaped.length)
          .trim(),
      };
    })
    .filter((record) => /#{1,6} /.test(record.content));
}

function extractPageContentToken(
  unescaped: string,
  options: WikiRscExtractionOptions,
): string | null {
  const expectedTitle = normalizeHeading(
    options.title ?? titleFromSectionPath(options.sectionPath) ?? "",
  );
  if (!expectedTitle) return null;

  const pageMapRe =
    /\{"page_plan":\{"id":"([^"]+)","title":"([^"]+)"\},"content":"\$([0-9a-z]+)"\}/g;
  let match: RegExpExecArray | null;

  while ((match = pageMapRe.exec(unescaped))) {
    const title = match[2] ?? "";
    if (normalizeHeading(title) === expectedTitle) {
      return match[3] ?? null;
    }
  }

  return null;
}

function firstHeadingTitle(markdown: string): string {
  return markdown.match(/^#{1,6}\s+(.+?)\s*$/m)?.[1] ?? "";
}

function findRecordByTitle(
  records: RscTextRecord[],
  options: WikiRscExtractionOptions,
): RscTextRecord | undefined {
  const expectedTitle = normalizeHeading(
    options.title ?? titleFromSectionPath(options.sectionPath) ?? "",
  );
  if (!expectedTitle) return undefined;

  return records.find(
    (record) =>
      normalizeHeading(firstHeadingTitle(record.content)) === expectedTitle,
  );
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
    candidates.some(
      (candidate) => normalizeHeading(heading.text) === candidate,
    );

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
    (heading) =>
      heading.index > pageHeading.index && heading.level <= pageHeading.level,
  );

  return markdown
    .slice(pageHeading.index, nextPageHeading?.index ?? markdown.length)
    .trim();
}

function extractMarkdownBody(joined: string): string | null {
  if (!joined) return null;

  const unescaped = decodeRscText(joined);
  const records = extractRscTextRecords(unescaped);
  const recordBody = records
    .map((record) => record.content)
    .filter((content) => /^#\s+\S/m.test(content))
    .join("\n\n");

  if (/#{1,3} /.test(recordBody) && recordBody.length > 200) {
    return recordBody.trim();
  }

  const startIdx = unescaped.search(/(^|\n)#{1,2} \S/);
  if (startIdx === -1) return null;

  const body = unescaped.slice(startIdx).trim();
  return /#{1,3} /.test(body) && body.length > 200 ? body : null;
}

export function extractWikiMarkdownFromRsc(
  joined: string,
  options: WikiRscExtractionOptions = {},
): string | null {
  const unescaped = decodeRscText(joined);
  const pageToken = extractPageContentToken(unescaped, options);
  const records = extractRscTextRecords(unescaped);
  const tokenMarkdown = pageToken
    ? records.find((record) => record.token === pageToken)?.content
    : findRecordByTitle(records, options)?.content;
  const body = tokenMarkdown ?? extractMarkdownBody(joined);
  if (!body) return null;

  const pageMarkdown = tokenMarkdown ?? sliceSinglePageMarkdown(body, options);
  if (!pageMarkdown) return null;

  const expectedTitle = normalizeHeading(
    options.title ?? titleFromSectionPath(options.sectionPath) ?? "",
  );
  const firstHeading = normalizeHeading(firstHeadingTitle(pageMarkdown));

  if (expectedTitle && firstHeading && expectedTitle !== firstHeading) {
    return null;
  }

  return /#{1,3} /.test(pageMarkdown) && pageMarkdown.length > 200
    ? pageMarkdown
    : null;
}

export function extractFullWikiMarkdownFromRsc(joined: string): string | null {
  return extractMarkdownBody(joined);
}
