let wikiObserver: MutationObserver | null = null;
let timer: number | undefined;

export function observeWikiPage(callback: () => void): void {
  wikiObserver?.disconnect();
  wikiObserver = new MutationObserver(() => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(callback, 600);
  });
  wikiObserver.observe(document.body, { childList: true, subtree: true });
}
