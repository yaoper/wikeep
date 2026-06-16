import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { WikiPageSnapshot } from "../src/shared/types";
import {
  deleteWikiPage,
  getWikiPage,
  listWikiPages,
  lookupWikiPageByUrl,
  upsertWikiPage,
} from "../src/storage/pageRepository";

const base: WikiPageSnapshot = {
  url: "https://deepwiki.com/facebook/react/1.1-x",
  owner: "facebook",
  repo: "react",
  sectionPath: "1.1-x",
  title: "X",
  markdown: "# X",
  contentHash: "aaa",
  indexedCommit: "bf76955e",
  wordCount: 10,
  capturedAt: Date.now(),
};

describe("pageRepository", () => {
  it("creates then detects change on re-save", async () => {
    const first = await upsertWikiPage(base);
    expect(first.created).toBe(true);
    expect(first.changed).toBe(false);

    const second = await upsertWikiPage({
      ...base,
      contentHash: "bbb",
      indexedCommit: "deadbee",
    });
    expect(second.created).toBe(false);
    expect(second.changed).toBe(true);

    const list = await listWikiPages();
    expect(list).toHaveLength(1);
  });

  it("lookupWikiPageByUrl returns stored fingerprint", async () => {
    await upsertWikiPage(base);
    const look = await lookupWikiPageByUrl(base.url);
    expect(look.exists).toBe(true);
    expect(look.contentHash).toBe("aaa");
  });

  it("does not downgrade RSC markdown to DOM fallback for unchanged content", async () => {
    await upsertWikiPage({
      ...base,
      markdown: "# X\n\n" + "rich\n".repeat(1000),
      markdownSource: "rsc",
    });

    await upsertWikiPage({
      ...base,
      markdown: "# X\n\nshort dom fallback",
      markdownSource: "dom",
    });

    const saved = await getWikiPage("wiki:facebook/react/1.1-x");
    expect(saved?.markdownSource).toBe("rsc");
    expect(saved?.markdown.length).toBeGreaterThan(1000);
  });

  it("does not overwrite existing RSC diagrams save with a DOM fallback", async () => {
    const customBase = {
      ...base,
      sectionPath: "1.1-diagrams",
      url: "https://deepwiki.com/facebook/react/1.1-diagrams",
    };

    const existingRsc = {
      ...customBase,
      markdown: "# X\n\n```mermaid\ngraph TD\n  A --> B\n```\n",
      markdownSource: "rsc" as const,
      hasDiagrams: true,
      contentHash: "hash123",
      indexedCommit: "commit123",
    };

    const first = await upsertWikiPage(existingRsc);
    expect(first.created).toBe(true);

    const incomingDom = {
      ...customBase,
      markdown: "# X\n\n> 📊 Diagram omitted — view it on the source page\n",
      markdownSource: "dom" as const,
      hasDiagrams: false,
      contentHash: "hash456",
      indexedCommit: "commit456",
    };

    const result = await upsertWikiPage(incomingDom);

    const saved = await getWikiPage("wiki:facebook/react/1.1-diagrams");
    expect(saved?.markdownSource).toBe("rsc");
    expect(saved?.hasDiagrams).toBe(true);
    expect(saved?.markdown).toContain("```mermaid");
    expect(saved?.markdown).not.toContain("Diagram omitted");
    expect(result.changed).toBe(false);
  });

  it("deletes", async () => {
    const { pageId } = await upsertWikiPage(base);
    await deleteWikiPage(pageId);
    expect(await getWikiPage(pageId)).toBeNull();
  });
});
