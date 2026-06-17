import type {
  Conversation,
  Message,
  MessageCitation,
  WikiPage,
} from "./types";
import type { RuntimeCommand, RuntimeResponse } from "./messages";

export function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

export function stableHash(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return Math.abs(hash >>> 0).toString(16);
}

export function buildConversationId(
  sourceSessionId: string | undefined,
  sourceUrl: string,
): string {
  return sourceSessionId
    ? `deepwiki:${sourceSessionId}`
    : `deepwiki:${stableHash(sourceUrl)}`;
}

export function buildSnippet(text: string, keyword: string): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedText || !normalizedKeyword) {
    return clipText(normalizedText, 120);
  }

  const lower = normalizedText.toLowerCase();
  const matchIndex = lower.indexOf(normalizedKeyword);

  if (matchIndex === -1) {
    return clipText(normalizedText, 120);
  }

  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(
    normalizedText.length,
    matchIndex + normalizedKeyword.length + 60,
  );
  const prefix = start > 0 ? "…" : "";
  const suffix = end < normalizedText.length ? "…" : "";

  return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
}

export function ensureErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

const ROLE_LABELS: Record<string, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Unknown",
};

export function sanitizeFilename(text: string): string {
  return (
    text
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50) || "session"
  );
}

export function formatConversationAsMarkdown(
  conversation: Conversation,
  messages: Message[],
): string {
  const lines: string[] = [];
  const question =
    normalizeText(conversation.question) || "Unrecognized question";
  const repoNames = conversation.metadata?.repoNames ?? [];

  lines.push(`# ${question}`);
  lines.push("");

  if (repoNames.length > 0) {
    lines.push(`- **Repository**: ${repoNames.join(", ")}`);
  }

  lines.push(`- **Source**: ${conversation.sourceUrl}`);
  lines.push(
    `- **Saved at**: ${new Date(conversation.updatedAt).toLocaleString("en-US")}`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const message of messages) {
    const role = ROLE_LABELS[message.role] ?? message.role;
    const content = normalizeText(message.content);

    if (!content) {
      continue;
    }

    lines.push(`## ${role}`);
    lines.push("");
    lines.push(content);
    lines.push("");

    const sources = formatMessageSources(message.metadata?.citations);
    if (sources.length > 0) {
      lines.push("**Sources:**");
      lines.push("");
      lines.push(...sources);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Render a message's source citations as Markdown lines in DeepWiki's style:
 * `path/to/File.js` [103-320]()
 */
function formatMessageSources(
  citations: MessageCitation[] | undefined,
): string[] {
  if (!citations || citations.length === 0) return [];

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const c of citations) {
    if (!c.filePath) continue;
    const key = `${c.filePath}:${c.rangeStart}-${c.rangeEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`- \`${c.filePath}\` [${c.rangeStart}-${c.rangeEnd}]()`);
  }
  return lines;
}

export function buildMarkdownFilename(conversation: Conversation): string {
  // Match wiki-page naming with a "session" marker:
  // wikeep-<source>-session-<repo>-<question>-<date>.md
  const source = conversation.sourceUrl?.includes("app.devin.ai")
    ? "devin"
    : "deepwiki";
  const repo = conversation.metadata?.repoNames?.[0];
  const question = normalizeText(conversation.question) || "session";
  const segments = repo ? [repo, question] : [question];
  const date = new Date(conversation.updatedAt).toISOString().slice(0, 10);
  return `wikeep-${source}-session-${sanitizeFilename(segments.join("-"))}-${date}.md`;
}

export function formatWikiPageAsMarkdown(page: WikiPage): string {
  const lines: string[] = [];
  lines.push(`# ${normalizeText(page.title) || page.repoFullName}`);
  lines.push("");
  lines.push(`- **Repository**: ${page.repoFullName}`);
  lines.push(`- **Source**: ${page.url}`);
  if (page.sectionPath) {
    lines.push(`- **Section**: ${page.sectionPath}`);
  }
  if (page.indexedCommit) {
    lines.push(`- **Indexed commit**: ${page.indexedCommit}`);
  }
  lines.push(
    `- **Saved at**: ${new Date(page.updatedAt).toLocaleString("en-US")}`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(page.markdown.trim());
  lines.push("");
  return lines.join("\n");
}

export function buildWikiPageMarkdownFilename(page: WikiPage): string {
  // Source label distinguishes deepwiki.com vs app.devin.ai exports.
  const source = page.source === "devin-wiki" ? "devin" : "deepwiki";

  const segments = [page.repoFullName];
  // Devin section paths are bare numbers (e.g. "5.2"), so include the page
  // title for readability. DeepWiki slugs already embed the title.
  if (source === "devin" && page.kind !== "full-wiki" && page.title) {
    segments.push(page.title);
  }
  if (page.sectionPath) {
    segments.push(page.sectionPath);
  }

  const date = new Date(page.updatedAt).toISOString().slice(0, 10);
  return `wikeep-${source}-${sanitizeFilename(segments.join("-"))}-${date}.md`;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export async function sendRuntimeMessage<TResponse, TPayload = unknown>(
  command: RuntimeCommand,
  payload?: TPayload,
): Promise<TResponse> {
  const response = (await chrome.runtime.sendMessage({
    command,
    payload,
  })) as RuntimeResponse<TResponse>;

  if (!response.ok) {
    throw new Error(
      response.error?.message ?? `Runtime command failed: ${command}`,
    );
  }

  return response.data as TResponse;
}
