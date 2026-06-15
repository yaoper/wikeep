import { beforeEach, describe, expect, it } from "vitest";
import {
  fingerprintWikiPage,
  parseWikiPage,
} from "../src/parser/deepwikiWikiParser";

function loadDom(html: string, url: string) {
  document.body.innerHTML = html;
  Object.defineProperty(document, "title", {
    value: "Repository Structure | facebook/react | DeepWiki",
    configurable: true,
  });
  Object.defineProperty(window, "location", {
    value: new URL(url) as unknown as Location,
    configurable: true,
  });
}

const PROSE = `
  <div class="prose prose-invert">
    <h1>Repository Structure and Packages</h1>
    <p>The repo is a monorepo with <code>packages/*</code> workspaces. It contains multiple packages, shared tooling, test fixtures, build scripts, release automation, compiler integrations, reconciler internals, and renderer-specific implementations that are documented across the repository structure page.</p>
    <pre><code class="language-json">{ "private": true }</code></pre>
    <p>See <a href="https://github.com/facebook/react/blob/bf76955e/package.json">package.json</a>.</p>
    <figure><svg width="400" height="300"><rect/></svg></figure>
    <a href="/facebook/react/2-core-reconciler-architecture">Core</a>
  </div>`;

describe("parseWikiPage", () => {
  beforeEach(() =>
    loadDom(
      PROSE,
      "https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages",
    ),
  );

  it("produces a snapshot with title, markdown, commit and toc", () => {
    const snap = parseWikiPage(document, location.href);
    expect(snap).not.toBeNull();
    expect(snap?.owner).toBe("facebook");
    expect(snap?.repo).toBe("react");
    expect(snap?.sectionPath).toBe("1.1-repository-structure-and-packages");
    expect(snap?.title).toBe("Repository Structure and Packages");
    expect(snap?.markdown).toMatch(/^# Repository Structure and Packages/m);
    expect(snap?.markdown).toContain("```json");
    expect(snap?.indexedCommit).toBe("bf76955e");
    expect(snap?.markdown).toContain("Diagram omitted");
    expect(snap?.relatedSections).toContain(
      "/facebook/react/2-core-reconciler-architecture",
    );
    expect(snap?.contentHash).toMatch(/^[0-9a-f]+$/);
  });

  it("fingerprint matches parse hash for identical content", () => {
    const fp = fingerprintWikiPage(document, location.href);
    const snap = parseWikiPage(document, location.href);
    expect(fp?.contentHash).toBe(snap?.contentHash);
    expect(fp?.indexedCommit).toBe(snap?.indexedCommit);
  });
});
