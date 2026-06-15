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

const REPOSITORY_OVERVIEW = `
  <div class="prose prose-invert">
    <h1>React Repository Overview</h1>
    <details>
      <summary>Relevant source files</summary>
      <ul>
        <li><a href="https://github.com/facebook/react/blob/bf76955e/README.md?plain=1">README.md</a></li>
        <li><a href="https://github.com/facebook/react/blob/bf76955e/package.json">package.json</a></li>
      </ul>
    </details>
    <hr />
    <p>The React repository is a monorepo containing the core React library, its renderers like React DOM and React Native, developer tools, the React Compiler, and various related packages. Its primary purpose is to provide a unified development environment for all parts of the React ecosystem.</p>
    <p>The repository is organized into several major subsystems:</p>
    <ul>
      <li><strong>Core React Packages</strong>: react, react-reconciler, and scheduler.</li>
      <li><strong>Renderers</strong>: react-dom, react-native, react-art, and react-test-renderer.</li>
      <li><strong>React Compiler</strong>: compile-time transformations for React components.</li>
    </ul>
    <p>This page offers a high-level introduction to the monorepo's purposes, major subsystems, package layout, and their relationships.</p>
    <p>Sources: <a href="https://github.com/facebook/react/blob/bf76955e/package.json#L1-L5">package.json</a> <a href="https://github.com/facebook/react/blob/bf76955e/README.md?plain=1#L1-L79">README.md</a></p>
    <hr />
    <h2>Repository Structure and Packages</h2>
    <p>This visible child-summary section is part of the current overview page.</p>
    <h2>Build System and Tooling</h2>
    <p>This second visible section is also part of the current overview page.</p>
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

  it("uses only the matching RSC page markdown when available", () => {
    const repeated = "This page section contains the source markdown for one page only. ".repeat(8);
    const rscRaw = [
      "# Glossary",
      "Glossary content that must not be saved with this page.",
      "# Repository Structure and Packages",
      repeated,
      "## Package layout",
      "The React repository is split into packages and shared tooling.",
      "```mermaid",
      "graph TD",
      "  packages --> tooling",
      "```",
      "# Build System and Tooling",
      "Build content that belongs to another page.",
    ].join("\\n");

    const snap = parseWikiPage(document, location.href, rscRaw);

    expect(snap?.markdownSource).toBe("rsc");
    expect(snap?.markdown).toContain("# Repository Structure and Packages");
    expect(snap?.markdown).toContain("```mermaid");
    expect(snap?.markdown).not.toContain("Glossary content");
    expect(snap?.markdown).not.toContain("Build content");
  });

  it("keeps full repository overview DOM page, including visible subsections", () => {
    loadDom(
      REPOSITORY_OVERVIEW,
      "https://deepwiki.com/facebook/react/1-react-repository-overview",
    );

    const snap = parseWikiPage(document, location.href);

    expect(snap?.title).toBe("React Repository Overview");
    expect(snap?.markdownSource).toBe("dom");
    expect(snap?.markdown).toContain("Relevant source files");
    expect(snap?.markdown).toContain("The React repository is a monorepo");
    expect(snap?.markdown).toContain("Core React Packages");
    expect(snap?.markdown).toContain("Sources:");
    expect(snap?.markdown).toContain("Repository Structure and Packages");
    expect(snap?.markdown).toContain("Build System and Tooling");
    expect(snap?.markdown).toContain("This visible child-summary section");
    expect(snap?.markdown).toContain("This second visible section");
  });

  it("fingerprint matches parse hash for identical content", () => {
    const fp = fingerprintWikiPage(document, location.href);
    const snap = parseWikiPage(document, location.href);
    expect(fp?.contentHash).toBe(snap?.contentHash);
    expect(fp?.indexedCommit).toBe(snap?.indexedCommit);
  });
});
