# Step 6 — Tests

The riskiest new code is the parser/traversal, so cover it — not just URL parsing.

## 6a — URL matching (`tests/wikiUrl.test.ts`, extend)

```ts
import { describe, expect, it } from "vitest";
import { isWikiPageUrl, parseWikiUrl } from "../src/shared/wikiUrl";

const ORG = "org/some-org-slug-c5c1f593e932";

describe("Devin wiki URLs", () => {
  const root = `https://app.devin.ai/${ORG}/wiki/drunkod/nix-config-1`;

  it("matches a Devin repo root", () => {
    expect(isWikiPageUrl(root)).toBe(true);
    expect(parseWikiUrl(root)).toEqual({
      owner: "drunkod",
      repo: "nix-config-1",
      sectionPath: undefined,
    });
  });

  it("ignores ?branch= and parses hash sectionPath", () => {
    const url = `${root}?branch=master#1.2-repository-structure`;
    expect(isWikiPageUrl(url)).toBe(true);
    expect(parseWikiUrl(url)?.sectionPath).toBe("1.2");
  });

  it("parses a bare numeric hash", () => {
    expect(parseWikiUrl(`${root}#3`)?.sectionPath).toBe("3");
  });

  it("rejects non-wiki Devin paths", () => {
    expect(isWikiPageUrl(`https://app.devin.ai/${ORG}`)).toBe(false);
    expect(isWikiPageUrl("https://app.devin.ai/settings")).toBe(false);
  });

  it("leaves DeepWiki matching intact", () => {
    expect(isWikiPageUrl("https://deepwiki.com/facebook/react")).toBe(true);
  });
});
```

## 6b — Single-page DOM parse (jsdom fixture)

```ts
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { parseWikiPage } from "../src/parser/deepwikiWikiParser";

const DEVIN_URL =
  "https://app.devin.ai/org/slug/wiki/drunkod/nix-config-1#1.1";

function devinDoc(): Document {
  const dom = new JSDOM(`<!doctype html><html><head>
    <title>Getting Started | Devin</title></head><body>
    <main><div class="prose-main">
      <h1>Getting Started &amp; Setup</h1>
      <p>${"This is the body content of the section. ".repeat(20)}</p>
      <h2>Prerequisites</h2><p>Install nix and direnv.</p>
    </div></main></body></html>`);
  return dom.window.document;
}

describe("parseWikiPage on Devin DOM (rscRaw = null)", () => {
  it("produces dom markdown with the right title", () => {
    const snap = parseWikiPage(devinDoc(), DEVIN_URL, null);
    expect(snap).not.toBeNull();
    expect(snap!.markdownSource).toBe("dom");
    expect(snap!.title).toBe("Getting Started & Setup");
    expect(snap!.owner).toBe("drunkod");
    expect(snap!.markdown).toContain("Prerequisites");
  });
});
```

> Note: `innerText` is undefined in jsdom; the parser already falls back to
> `textContent` via `getElementText`, so the fixture works.

## 6c — Full-wiki DOM builder (jsdom + stubbed clicks)

Build a fixture with a `[data-slot="sidebar-content"]` containing two outline
buttons plus one control button ("Settings"). Wire each outline button's `click`
to swap `.prose-main` innerHTML to that section, then assert:

```ts
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { buildFullWikiFromDom } from "../src/parser/devinWikiParser";

function fullWikiDoc(): Document {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div data-slot="sidebar-content">
      <div data-slot="sidebar-menu-button"><button aria-label="Intro"></button></div>
      <div data-slot="sidebar-menu-button"><button aria-label="Architecture"></button></div>
      <div data-slot="sidebar-menu-button"><button aria-label="Settings"></button></div>
    </div>
    <main><div class="prose-main"><h1>Intro</h1><p>${"x ".repeat(60)}</p></div></main>
  </body></html>`, { url: "https://app.devin.ai/org/s/wiki/o/r" });

  const doc = dom.window.document;
  const prose = doc.querySelector(".prose-main")!;
  const set = (h: string, body: string) => () => {
    prose.innerHTML = `<h1>${h}</h1><p>${body.repeat(60)}</p>`;
  };
  doc.querySelectorAll("button[aria-label]").forEach((b) => {
    const label = b.getAttribute("aria-label")!;
    if (label === "Architecture") b.addEventListener("click", set("Architecture", "arch "));
    if (label === "Intro") b.addEventListener("click", set("Intro", "intro "));
  });
  // Make jsdom's location/setTimeout visible to the module under test.
  vi.stubGlobal("location", dom.window.location);
  vi.stubGlobal("setTimeout", dom.window.setTimeout.bind(dom.window));
  return doc;
}

describe("buildFullWikiFromDom", () => {
  it("compiles outline sections and excludes controls", async () => {
    const snap = await buildFullWikiFromDom(fullWikiDoc(), "https://app.devin.ai/org/s/wiki/o/r");
    expect(snap).not.toBeNull();
    expect(snap!.kind).toBe("full-wiki");
    expect(snap!.relatedSections).toEqual(["Intro", "Architecture"]); // no "Settings"
    expect(snap!.markdown).toContain("Architecture");
  });
});
```

> The builder reads global `location`/`setTimeout`/`window`; stub them from the
> jsdom window (as above) or run these tests with vitest's `jsdom` environment.

## Run

```bash
nix develop --command npm run test
```
