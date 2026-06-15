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
      "The React repository is a monorepo containing the core React library, renderers, developer tools, compiler, supporting packages, coordinated releases, and cross-package optimizations. ".repeat(6);
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
    expect(md).not.toContain("The next top-level wiki page must not be included");
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
});
