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

// Max plausible RSC row header: "<token>:T<hex>,1," — comfortably under this.
const MAX_RSC_HEADER_LEN = 100;

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

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function endIndexFromUtf8ByteLength(
  value: string,
  startIndex: number,
  byteLength: number,
): number | null {
  let bytes = 0;
  let index = startIndex;

  while (index < value.length && bytes < byteLength) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) return null;

    bytes += utf8ByteLength(codePoint);
    index += codePoint > 0xffff ? 2 : 1;
  }

  return bytes === byteLength ? index : null;
}

// extractRscTextRecords walks the RSC payload record by record.
// Each record header is "<token>:T<hexByteLength>,1," and the body is exactly
// <hexByteLength> UTF-8 bytes. We measure against the RAW (escaped) string so the
// declared byte length matches the wire format, then decode each record body.
function extractRscTextRecords(joined: string): RscTextRecord[] {
  const records: RscTextRecord[] = [];

  const firstT = joined.indexOf(":T");
  if (firstT === -1) return [];

  let startIdx = firstT;
  while (startIdx > 0 && /[0-9a-z]/i.test(joined[startIdx - 1])) {
    startIdx--;
  }

  let currentPos = startIdx;

  while (currentPos < joined.length) {
    const re = /^([0-9a-z]+):T([0-9a-f]+),(?:1,)?/i;
    const slice = joined.slice(currentPos, currentPos + MAX_RSC_HEADER_LEN);
    const match = re.exec(slice);
    if (!match) {
      const nextT = joined.indexOf(":T", currentPos);
      if (nextT === -1) break;

      let nextStartIdx = nextT;
      while (
        nextStartIdx > currentPos &&
        /[0-9a-z]/i.test(joined[nextStartIdx - 1])
      ) {
        nextStartIdx--;
      }
      currentPos = nextStartIdx;
      continue;
    }

    const token = match[1];
    const lengthHex = match[2];
    const headerLength = match[0].length;

    if (!token || !lengthHex) {
      currentPos += headerLength;
      continue;
    }

    const contentStart = currentPos + headerLength;
    const byteLength = Number.parseInt(lengthHex, 16);

    const contentEnd = Number.isFinite(byteLength)
      ? (endIndexFromUtf8ByteLength(joined, contentStart, byteLength) ??
        Math.min(contentStart + byteLength, joined.length))
      : contentStart;

    const escapedContent = joined.slice(contentStart, contentEnd);
    const content = decodeRscText(escapedContent).trim();

    records.push({
      token,
      content,
    });

    currentPos = contentEnd;

    while (
      currentPos < joined.length &&
      !/[0-9a-z]/i.test(joined[currentPos])
    ) {
      currentPos++;
    }
  }

  return records.filter((r) => /#{1,6} /.test(r.content));
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
  const records = extractRscTextRecords(joined);
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
  const records = extractRscTextRecords(joined);
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
