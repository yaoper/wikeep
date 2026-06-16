import { describe, expect, it } from "vitest";
import { normalizeConversation } from "../src/storage/conversationMapper";

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
});
