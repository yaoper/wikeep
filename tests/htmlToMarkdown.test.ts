import { describe, expect, it } from "vitest";
import { createConverter } from "../src/parser/htmlToMarkdown";

describe("createConverter", () => {
  it("converts headings, lists and inline code", () => {
    const md = createConverter().turndown(
      "<h2>Title</h2><ul><li>one</li><li>two</li></ul><p>use <code>npm ci</code></p>",
    );
    expect(md).toContain("## Title");
    expect(md).toContain("one");
    expect(md).toContain("`npm ci`");
  });

  it("keeps code-block language", () => {
    const md = createConverter().turndown(
      '<pre><code class="language-ts">const x = 1;</code></pre>',
    );
    expect(md).toContain("```ts");
    expect(md).toContain("const x = 1;");
  });

  it("renders GFM tables", () => {
    const md = createConverter().turndown(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    );
    expect(md).toContain("| A | B |");
    expect(md).toContain("| 1 | 2 |");
  });

  it("emits a diagram placeholder", () => {
    const md = createConverter({
      sourceUrl: "https://deepwiki.com/x/y",
    }).turndown('<div><div data-wikeep-diagram="1">x</div></div>');
    expect(md).toContain("Diagram omitted");
    expect(md).toContain("https://deepwiki.com/x/y");
  });
});
