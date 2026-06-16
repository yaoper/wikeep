import { describe, expect, it } from "vitest";
import { extractWikiMarkdownFromRsc } from "../src/parser/deepwikiRscSource";

describe("DeepWiki RSC multi-byte text records", () => {
  it("respects UTF-8 byte length with multi-byte content", () => {
    const body = [
      "# Überblick — naïve café 🚀",
      "",
      "Some content with emoji 🎉. ".repeat(20),
    ].join("\n");
    const byteLen = new TextEncoder().encode(body).length;
    const raw = `1:T${byteLen.toString(16)},1,${body}`;

    const md = extractWikiMarkdownFromRsc(raw, {
      title: "Überblick — naïve café 🚀",
    });

    expect(md).toContain("# Überblick");
    expect(md).toContain("🚀");
    expect(md).toContain("🎉");
  });
});
