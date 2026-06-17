// MAIN-world probe for Devin wiki pages.
//
// Devin renders wiki pages from a raw Markdown string held in React props
// (including ```mermaid fences). That string only exists on the React fiber,
// which the isolated content-script world cannot read. This probe runs in the
// MAIN world, extracts the current page's Markdown on request, and posts it
// back to the isolated content script via window.postMessage.

interface DevinMdRequest {
  source?: string;
  requestId?: number;
}

type Fiber = {
  memoizedProps?: Record<string, unknown> | null;
  child?: Fiber | null;
  sibling?: Fiber | null;
  return?: Fiber | null;
} | null;

function getFiber(el: Element | null): Fiber {
  if (!el) return null;
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  return key ? ((el as unknown as Record<string, Fiber>)[key] ?? null) : null;
}

// Heuristic: a page-Markdown string is long and starts a line with a heading.
function looksLikeMarkdown(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 200 &&
    /(^|\n)#{1,3}\s/.test(value)
  );
}

const MD_PROP_KEYS = [
  "children",
  "content",
  "source",
  "markdown",
  "text",
  "value",
];

/**
 * From the prose container's fiber, climb to the React root and DFS the whole
 * subtree for the LONGEST Markdown-looking string prop. On Devin only the
 * active page's renderer is mounted, so the longest match is the current page.
 */
function extractPageMarkdown(): string | null {
  const host =
    document.querySelector(".prose-main") ??
    document.querySelector('[class*="prose"]');
  const start = getFiber(host);
  if (!start) return null;

  let root: Fiber = start;
  while (root && root.return) root = root.return;

  let best: string | null = null;
  const stack: Fiber[] = [root];
  let guard = 0;

  while (stack.length && guard < 200_000) {
    guard++;
    const node = stack.pop();
    if (!node) continue;

    const props = node.memoizedProps;
    if (props) {
      for (const key of MD_PROP_KEYS) {
        const v = props[key];
        if (looksLikeMarkdown(v) && (!best || v.length > best.length)) {
          best = v;
        }
      }
    }

    if (node.child) stack.push(node.child);
    if (node.sibling) stack.push(node.sibling);
  }

  return best;
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as DevinMdRequest;
  if (data?.source !== "wikeep-devin-md-request") return;

  let markdown: string | null = null;
  try {
    markdown = extractPageMarkdown();
  } catch {
    markdown = null;
  }

  window.postMessage(
    {
      source: "wikeep-devin-md",
      requestId: data.requestId,
      url: location.href,
      markdown,
    },
    location.origin,
  );
});
