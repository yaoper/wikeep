import { describe, expect, it } from "vitest";
import {
  extractFullWikiMarkdownFromRsc,
  extractWikiMarkdownFromRsc,
} from "../src/parser/deepwikiRscSource";

describe("extractWikiMarkdownFromRsc", () => {
  it("extracts only the current page by visible title", () => {
    const currentBody =
      "Build system details for the current DeepWiki page. ".repeat(8);
    const raw = [
      "# Glossary",
      "Glossary content that belongs to a different static page.",
      "# Build System and Tooling",
      currentBody,
      "## Code-to-Artifact Mapping",
      "This subsection should stay because it belongs to the current page.",
      "```mermaid",
      "graph TD",
      "  source --> artifact",
      "```",
      "# Rendering Targets",
      "Rendering content must not be included in the build-system export.",
    ].join("\\n");

    const md = extractWikiMarkdownFromRsc(raw, {
      title: "Build System and Tooling",
      sectionPath: "6-build-system-and-tooling",
    });

    expect(md).toMatch(/^# Build System and Tooling/m);
    expect(md).toContain("Code-to-Artifact Mapping");
    expect(md).toContain("```mermaid");
    expect(md).not.toContain("Glossary content");
    expect(md).not.toContain("Rendering content");
  });

  it("can match from sectionPath when the title is unavailable", () => {
    const currentBody =
      "Glossary content for the selected unique page. ".repeat(8);
    const raw = [
      "# Repository Structure and Packages",
      "Repository content must not be included.",
      "# Glossary",
      currentBody,
      "## Miscellaneous Jargon",
      "Definitions stay with the glossary page.",
      "# Build System and Tooling",
      "Build content must not be included.",
    ].join("\\n");

    const md = extractWikiMarkdownFromRsc(raw, {
      sectionPath: "8-glossary",
    });

    expect(md).toMatch(/^# Glossary/m);
    expect(md).toContain("Miscellaneous Jargon");
    expect(md).not.toContain("Repository content");
    expect(md).not.toContain("Build content");
  });

  it("keeps the full visible repository overview page, including child-summary sections", () => {
    const overviewBody =
      "The React repository is a monorepo containing the core React library, renderers, developer tools, compiler, supporting packages, coordinated releases, and cross-package optimizations. ".repeat(
        6,
      );
    const raw = [
      "# React Repository Overview",
      "<details><summary>Relevant source files</summary></details>",
      "---",
      overviewBody,
      "Sources: package.json and README.md",
      "---",
      "## Repository Structure and Packages",
      "This child-page summary is visible on the current overview page and should stay.",
      "---",
      "## Build System and Tooling",
      "Another visible subsection should also stay.",
      "# Glossary",
      "The next top-level wiki page must not be included.",
    ].join("\\n");

    const md = extractWikiMarkdownFromRsc(raw, {
      title: "React Repository Overview",
      sectionPath: "1-react-repository-overview",
    });

    expect(md).toMatch(/^# React Repository Overview/m);
    expect(md).toContain("Relevant source files");
    expect(md).toContain("The React repository is a monorepo");
    expect(md).toContain("Sources: package.json and README.md");
    expect(md).toContain("Repository Structure and Packages");
    expect(md).toContain("Build System and Tooling");
    expect(md).not.toContain(
      "The next top-level wiki page must not be included",
    );
  });

  it("extracts the current page from DeepWiki RSC text records via the page map token", () => {
    const overview = [
      "# React Repository Overview",
      "Overview content. ".repeat(20),
      "## Repository Structure and Packages",
      "Repository structure content visible on the overview page.",
      "### Dependency Relationships of Core Packages",
      "```mermaid",
      "graph TD",
      "  react --> scheduler",
      "```",
      "## How the Pieces Fit Together",
      "```mermaid",
      "graph TD",
      "  monorepo --> react",
      "```",
      "The pieces fit together content visible on the overview page.",
    ].join("\\n");
    const structure = [
      "# Repository Structure and Packages",
      "Monorepo layout content. ".repeat(20),
      "## Monorepo Layout",
      "This belongs to the child page only.",
    ].join("\\n");
    const raw = [
      '{"pages":[{"page_plan":{"id":"1","title":"React Repository Overview"},"content":"$17"},{"page_plan":{"id":"1.1","title":"Repository Structure and Packages"},"content":"$18"}]}',
      `17:T${overview.length.toString(16)},1,${overview}`,
      `1,18:T${structure.length.toString(16)},1,${structure}`,
    ].join("\\n");

    const md = extractWikiMarkdownFromRsc(raw, {
      title: "React Repository Overview",
      sectionPath: "1-react-repository-overview",
    });

    expect(md).toMatch(/^# React Repository Overview/m);
    expect(md).toContain("Repository Structure and Packages");
    expect(md).toContain("How the Pieces Fit Together");
    expect(md).toContain("```mermaid");
    expect(md).toContain("react --> scheduler");
    expect(md).toContain("monorepo --> react");
    expect(md).not.toContain("Monorepo Layout");
  });

  it("can intentionally extract the full wiki bundle", () => {
    const raw = [
      "# React Repository Overview",
      "Overview content. ".repeat(20),
      "---",
      "## Repository Structure and Packages",
      "Repository structure content. ".repeat(20),
      "```mermaid",
      "graph TD",
      "  react --> scheduler",
      "```",
      "## Build System and Tooling",
      "Build tooling content. ".repeat(20),
    ].join("\\n");

    const md = extractFullWikiMarkdownFromRsc(raw);

    expect(md).toContain("React Repository Overview");
    expect(md).toContain("Repository Structure and Packages");
    expect(md).toContain("Build System and Tooling");
    expect(md).toContain("```mermaid");
  });

  it("extracts a page by matching the RSC text-record heading when the page map is absent", () => {
    const overview = [
      "# React Repository Overview",
      "Overview content. ".repeat(20),
    ].join("\\n");
    const core = [
      "# Core Reconciler Architecture",
      "Core reconciler intro. ".repeat(20),
      "## Fiber Tree Structure",
      "```mermaid",
      "graph TD",
      "  FiberRoot --> HostRoot",
      "```",
      "# Summary Diagram: Core Reconciler Architecture and Key Code Entities",
      "```mermaid",
      "graph TD",
      "  RenderPhase --> CommitPhase",
      "```",
      "# Navigation to Detailed Subsystems",
      "Navigation content that is still visible on the current page.",
    ].join("\\n");
    const next = [
      "# Fiber Work Loop and Scheduling",
      "Next page content must not be included. ".repeat(20),
    ].join("\\n");
    const raw = [
      `17:T${overview.length.toString(16)},1,${overview}`,
      `1,1a:T${core.length.toString(16)},1,${core}`,
      `1,1b:T${next.length.toString(16)},1,${next}`,
    ].join("\\n");

    const md = extractWikiMarkdownFromRsc(raw, {
      title: "Core Reconciler Architecture",
      sectionPath: "2-core-reconciler-architecture",
    });

    expect(md).toMatch(/^# Core Reconciler Architecture/m);
    expect(md).toContain("Fiber Tree Structure");
    expect(md).toContain("```mermaid");
    expect(md).toContain("FiberRoot --> HostRoot");
    expect(md).toContain("Summary Diagram: Core Reconciler Architecture");
    expect(md).toContain("RenderPhase --> CommitPhase");
    expect(md).toContain("Navigation to Detailed Subsystems");
    expect(md).not.toContain("Next page content must not be included");
  });

  it("extracts all DeepWiki RSC text records for the full wiki bundle", () => {
    const overview = [
      "# React Repository Overview",
      "Overview content. ".repeat(20),
      "## How the Pieces Fit Together",
      "Overview conclusion.",
    ].join("\\n");
    const structure = [
      "# Repository Structure and Packages",
      "Monorepo layout content. ".repeat(20),
    ].join("\\n");
    const raw = [
      '{"pages":[{"page_plan":{"id":"1","title":"React Repository Overview"},"content":"$17"},{"page_plan":{"id":"1.1","title":"Repository Structure and Packages"},"content":"$18"}]}',
      `17:T${overview.length.toString(16)},1,${overview}`,
      `1,18:T${structure.length.toString(16)},1,${structure}`,
    ].join("\\n");

    const md = extractFullWikiMarkdownFromRsc(raw);

    expect(md).toContain("# React Repository Overview");
    expect(md).toContain("How the Pieces Fit Together");
    expect(md).toContain("# Repository Structure and Packages");
    expect(md).toContain("Monorepo layout content");
  });

  it("returns null when the RSC slice does not start at the requested page heading", () => {
    const raw = [
      "# Diagrams",
      "Diagram summary content. ".repeat(20),
      "## Feature Flags System",
      "Feature flag content that belongs to the overview page but not at the top boundary. ".repeat(
        10,
      ),
      "## How the Pieces Fit Together",
      "How the pieces fit together content. ".repeat(10),
    ].join("\\n");

    const md = extractWikiMarkdownFromRsc(raw, {
      title: "React Repository Overview",
      sectionPath: "1-react-repository-overview",
    });

    expect(md).toBeNull();
  });

  it("preserves Mermaid diagrams from an RSC text record when page map is absent", () => {
    const core = [
      "# Core Reconciler Architecture",
      "Core intro. ".repeat(20),
      "## Fiber Tree Structure",
      "```mermaid",
      "graph TD",
      "  FiberRoot --> HostRoot",
      "```",
      "# Summary Diagram: Core Reconciler Architecture and Key Code Entities",
      "```mermaid",
      "graph TD",
      "  RenderPhase --> CommitPhase",
      "```",
      "# Navigation to Detailed Subsystems",
      "Still visible on this page.",
    ].join("\\n");

    const next = [
      "# Fiber Work Loop and Scheduling",
      "Next page content must not be included. ".repeat(20),
    ].join("\\n");

    const raw = [
      `1,1a:T${core.length.toString(16)},1,${core}`,
      `1,1b:T${next.length.toString(16)},1,${next}`,
    ].join("\\n");

    const md = extractWikiMarkdownFromRsc(raw, {
      title: "Core Reconciler Architecture",
      sectionPath: "2-core-reconciler-architecture",
    });

    expect(md).toContain("```mermaid");
    expect(md).toContain("FiberRoot --> HostRoot");
    expect(md).toContain("RenderPhase --> CommitPhase");
    expect(md).toContain("Navigation to Detailed Subsystems");
    expect(md).not.toContain("Next page content must not be included");
  });
});
