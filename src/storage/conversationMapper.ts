import type { CapturePayload, Conversation } from "../shared/types";
import { buildConversationId } from "../shared/utils";
import { normalizeText } from "../shared/utils";

export const CONVERSATION_SCHEMA_VERSION = 3;

export interface LegacyConversationRecord {
  id: string;
  source?: "deepwiki";
  title?: string;
  question?: string;
  summary?: string;
  sourceUrl: string;
  sourceSessionId?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Conversation["metadata"];
  schemaVersion?: number;
}

export function dedupeStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean)),
  );
}

export function resolveConversationQuestion(snapshot: CapturePayload): string {
  const normalizedTitle = normalizeText(snapshot.title ?? "");

  if (normalizedTitle) {
    return normalizedTitle;
  }

  return (
    snapshot.messages
      .filter((message) => message.role === "user")
      .map((message) => normalizeText(message.content))
      .filter(Boolean)
      .at(0) ?? ""
  );
}

export function normalizeConversation(
  record: LegacyConversationRecord,
): Conversation {
  const repoNames = dedupeStrings(record.metadata?.repoNames ?? []);
  const question =
    record.question ?? normalizeText(record.title ?? record.summary ?? "") ?? "";

  return {
    id: record.id,
    source: "deepwiki",
    question: question || "Unrecognized question",
    sourceUrl: record.sourceUrl,
    sourceSessionId: record.sourceSessionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    metadata: repoNames.length > 0 ? { repoNames } : undefined,
    schemaVersion: record.schemaVersion ?? CONVERSATION_SCHEMA_VERSION,
  };
}

export function buildConversationFromSnapshot(
  snapshot: CapturePayload,
  existingConversation?: Conversation,
): Conversation {
  const conversationId =
    existingConversation?.id ??
    buildConversationId(snapshot.sourceSessionId, snapshot.sourceUrl);
  const question =
    resolveConversationQuestion(snapshot) ||
    existingConversation?.question ||
    "Unrecognized question";
  const repoNames = dedupeStrings([
    ...(existingConversation?.metadata?.repoNames ?? []),
    ...(snapshot.metadata?.repoNames ?? []),
  ]);

  return {
    id: conversationId,
    source: "deepwiki",
    question,
    sourceUrl: snapshot.sourceUrl,
    sourceSessionId: snapshot.sourceSessionId,
    createdAt: existingConversation?.createdAt ?? snapshot.capturedAt,
    updatedAt: snapshot.capturedAt,
    metadata: repoNames.length > 0 ? { repoNames } : undefined,
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
  };
}
