(() => {
  function readRsc(): string | null {
    const f = (window as unknown as { __next_f?: unknown[] }).__next_f;
    if (!Array.isArray(f)) return null;
    return f
      .map((x) => (Array.isArray(x) ? x[1] : x))
      .filter((v): v is string => typeof v === "string")
      .join("");
  }

  function post() {
    const raw = readRsc();
    if (raw) {
      window.postMessage(
        { source: "wikeep-rsc", url: location.href, raw },
        location.origin,
      );
    }
  }

  let hookInstalled = false;

  function installPushHook() {
    if (hookInstalled) return;

    const target = (window as unknown as { __next_f?: unknown[] }).__next_f;
    if (!Array.isArray(target)) return;

    const originalPush = target.push.bind(target);
    target.push = (...items: unknown[]) => {
      const result = originalPush(...items);
      post();
      return result;
    };

    hookInstalled = true;
  }

  installPushHook();
  const hookTimer = window.setInterval(() => {
    installPushHook();
    if (hookInstalled) window.clearInterval(hookTimer);
  }, 100);

  post();
  let t: number | undefined;
  new MutationObserver(() => {
    if (t) clearTimeout(t);
    t = window.setTimeout(post, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("message", (e) => {
    if (
      e.source === window &&
      (e.data as { source?: string })?.source === "wikeep-rsc-request"
    ) {
      post();
    }
  });
})();
