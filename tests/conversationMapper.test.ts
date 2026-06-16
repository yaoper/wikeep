import { describe, expect, it } from "vitest";
import {
  buildConversationFromSnapshot,
  normalizeConversation,
} from "../src/storage/conversationMapper";

describe("conversationMapper", () => {
  it("normalizes legacy records", () => {
    const conversation = normalizeConversation({
      id: "c1",
      title: "  Build   System  ",
      sourceUrl: "https://example.test/repo",
      createdAt: 1,
      updatedAt: 2,
      metadata: { repoNames: ["example/repo", " example/repo "] },
    });

    expect(conversation.question).toBe("Build   System");
    expect(conversation.metadata?.repoNames).toEqual(["example/repo"]);
  });

  it("builds a normalized conversation from a captured snapshot", () => {
    const conversation = buildConversationFromSnapshot({
      title: "  How does the build work?  ",
      sourceUrl: "https://example.test/search?q=build",
      sourceHost: "example.test",
      sourceSessionId: "sess-1",
      metadata: { repoNames: ["org/repo", " org/repo ", "org/other"] },
      messages: [
        {
          role: "user",
          content: "ignored because title wins",
          order: 0,
        },
      ],
      capturedAt: 100,
    });

    expect(conversation.id).toBe("deepwiki:sess-1");
    expect(conversation.question).toBe("How does the build work?");
    expect(conversation.createdAt).toBe(100);
    expect(conversation.updatedAt).toBe(100);
    expect(conversation.metadata?.repoNames).toEqual(["org/repo", "org/other"]);
  });

  it("merges existing conversation metadata and preserves createdAt", () => {
    const conversation = buildConversationFromSnapshot(
      {
        sourceUrl: "https://example.test/search?q=build",
        sourceHost: "example.test",
        sourceSessionId: "sess-1",
        metadata: { repoNames: ["org/new"] },
        messages: [
          {
            role: "user",
            content: "What changed?",
            order: 0,
          },
        ],
        capturedAt: 200,
      },
      {
        id: "deepwiki:sess-1",
        source: "deepwiki",
        question: "Existing question",
        sourceUrl: "https://example.test/search?q=build",
        sourceSessionId: "sess-1",
        createdAt: 10,
        updatedAt: 20,
        metadata: { repoNames: ["org/existing"] },
        schemaVersion: 3,
      },
    );

    expect(conversation.id).toBe("deepwiki:sess-1");
    expect(conversation.question).toBe("What changed?");
    expect(conversation.createdAt).toBe(10);
    expect(conversation.updatedAt).toBe(200);
    expect(conversation.metadata?.repoNames).toEqual([
      "org/existing",
      "org/new",
    ]);
  });
});
