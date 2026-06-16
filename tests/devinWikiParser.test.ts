import { describe, expect, it } from "vitest";
import { buildFullWikiFromDom } from "../src/parser/devinWikiParser";

function setupFullWikiDOM(): Document {
  document.body.innerHTML = `
    <div data-slot="sidebar-content">
      <div data-slot="sidebar-menu-button"><button aria-label="Intro"></button></div>
      <div data-slot="sidebar-menu-button"><button aria-label="Architecture"></button></div>
      <div data-slot="sidebar-menu-button"><button aria-label="Settings"></button></div>
    </div>
    <main><div class="prose-main"><h1>Intro</h1><p>${"x ".repeat(60)}</p></div></main>
  `;

  // Define location on window
  const locationMock = new URL("https://app.devin.ai/org/s/wiki/o/r");
  Object.defineProperty(window, "location", {
    value: locationMock,
    writable: true,
    configurable: true,
  });

  const prose = document.querySelector(".prose-main")!;
  const set = (h: string, body: string) => () => {
    prose.innerHTML = `<h1>${h}</h1><p>${body.repeat(60)}</p>`;
  };

  document.querySelectorAll("button[aria-label]").forEach((b) => {
    const label = b.getAttribute("aria-label")!;
    if (label === "Architecture") b.addEventListener("click", set("Architecture", "arch "));
    if (label === "Intro") b.addEventListener("click", set("Intro", "intro "));
  });

  return document;
}

describe("buildFullWikiFromDom", () => {
  it("compiles outline sections and excludes controls", async () => {
    const doc = setupFullWikiDOM();
    const snap = await buildFullWikiFromDom(doc, "https://app.devin.ai/org/s/wiki/o/r");
    expect(snap).not.toBeNull();
    expect(snap!.kind).toBe("full-wiki");
    expect(snap!.relatedSections).toEqual(["Intro", "Architecture"]); // no "Settings"
    expect(snap!.markdown).toContain("Architecture");
  });
});
