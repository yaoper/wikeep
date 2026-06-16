(() => {
  const capturedChunks: string[] = [];
  const processedItems = new Set<unknown>();

  function processItem(x: unknown) {
    if (processedItems.has(x)) return;
    processedItems.add(x);

    const val = Array.isArray(x) ? x[1] : x;
    if (typeof val === "string") {
      capturedChunks.push(val);
    }
  }

  function readRsc(): string | null {
    const f = (window as unknown as { __next_f?: unknown[] }).__next_f;
    if (Array.isArray(f)) {
      f.forEach(processItem);
    }
    return capturedChunks.length > 0 ? capturedChunks.join("") : null;
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

  function hookArray(arr: any) {
    if (!arr || arr.__wikeep_hooked) return;
    arr.__wikeep_hooked = true;

    // Process all existing items first
    arr.forEach(processItem);

    // Hook the push method
    const originalPush = arr.push;
    if (typeof originalPush === "function") {
      arr.push = (...items: any[]) => {
        items.forEach(processItem);
        const result = originalPush.apply(arr, items);
        post();
        return result;
      };
    }

    // Intercept future assignments of the push method
    let currentPush = arr.push;
    Object.defineProperty(arr, "push", {
      get() {
        return currentPush;
      },
      set(newPush) {
        currentPush = (...items: any[]) => {
          items.forEach(processItem);
          const result = newPush.apply(arr, items);
          post();
          return result;
        };
      },
      configurable: true,
    });
  }

  let currentNextF = (window as any).__next_f;

  // Intercept window.__next_f re-assignment
  Object.defineProperty(window, "__next_f", {
    get() {
      return currentNextF;
    },
    set(newVal) {
      currentNextF = newVal;
      if (newVal) {
        hookArray(newVal);
      }
    },
    configurable: true,
  });

  if (currentNextF) {
    hookArray(currentNextF);
  }

  // Periodic backup check just in case Next.js or other scripts bypass getter/setter
  window.setInterval(() => {
    const f = (window as any).__next_f;
    if (f && !f.__wikeep_hooked) {
      hookArray(f);
    }
  }, 500);

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
