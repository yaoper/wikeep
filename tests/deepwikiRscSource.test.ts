import { describe, expect, it } from "vitest";
import { extractWikiMarkdownFromRsc } from "../src/parser/deepwikiRscSource";

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
});
