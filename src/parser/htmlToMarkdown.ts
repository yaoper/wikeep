import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export interface ConverterOptions {
  sourceUrl?: string;
}

export function createConverter(
  options: ConverterOptions = {},
): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });

  td.use(gfm);

  td.addRule("fencedCodeLang", {
    filter: (node: Node) =>
      node.nodeName === "PRE" && !!(node as HTMLElement).querySelector("code"),
    replacement: (_content: string, node: Node) => {
      const code = (node as HTMLElement).querySelector("code");
      if (!code) return "\n\n```\n```\n\n";
      const lang = code.className.match(/language-([\w+-]+)/)?.[1] ?? "";
      const text = (code.textContent ?? "").replace(/\n$/, "");
      return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
    },
  });

  td.addRule("diagramPlaceholder", {
    filter: (node: Node) =>
      node.nodeType === 1 &&
      (node as HTMLElement).hasAttribute("data-wikeep-diagram"),
    replacement: () => {
      const link = options.sourceUrl ? `: ${options.sourceUrl}` : "";
      return `\n\n> 📊 Diagram omitted — view it on the source page${link}\n\n`;
    },
  });

  return td;
}

export function elementToMarkdown(
  el: HTMLElement,
  options: ConverterOptions = {},
): string {
  return createConverter(options).turndown(el.innerHTML).trim();
}
