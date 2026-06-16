# Step 0 — Hygiene & guardrails

**Goal:** remove debug noise and lock in safety before any structural work.
**Risk:** low. **Touches:** `background/index.ts`, `parser/deepwikiRscSource.ts`,
new `shared/logger.ts`.

## 0.1 Add a gated logger

Create `src/shared/logger.ts`:

```ts
// Vite statically replaces import.meta.env.DEV; logs are tree-shaken in prod.
const DEV = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (DEV) console.log("[wikeep]", ...args);
  },
  warn: (...args: unknown[]) => {
    if (DEV) console.warn("[wikeep]", ...args);
  },
  error: (...args: unknown[]) => {
    // Errors are always surfaced.
    console.error("[wikeep]", ...args);
  },
};
```

## 0.2 Clean `requestWikiSnapshot()`

The recent fix left raw `console.*` debug lines. Keep the real guard, drop the
noise, route through the logger.

Before (`src/background/index.ts`):

```ts
console.log("[wikeep bg] requestWikiSnapshot to tab:", tabId, "command:", command);
try {
  const response = (await chrome.tabs.sendMessage(tabId, {
    command,
  } satisfies RuntimeRequest)) as RuntimeResponse<GetWikiPageSnapshotResult>;

  console.log("[wikeep bg] received response:", response);
  if (!response) {
    console.error("[wikeep bg] response is undefined, lastError:", chrome.runtime.lastError);
    throw new Error(chrome.runtime.lastError?.message ?? "Response is undefined");
  }

  if (!response.ok) {
    throw new Error(response.error?.message ?? "Failed to get wiki page snapshot.");
  }

  return response.data?.snapshot ?? null;
} catch (err) {
  console.error("[wikeep bg] requestWikiSnapshot failed:", err);
  throw err;
}
```

After:

```ts
const response = (await chrome.tabs.sendMessage(tabId, {
  command,
} satisfies RuntimeRequest)) as RuntimeResponse<GetWikiPageSnapshotResult>;

// Keep the guard: a missing response means the content script never replied.
if (!response) {
  throw new Error(
    chrome.runtime.lastError?.message ?? "No response from content script.",
  );
}
if (!response.ok) {
  throw new Error(response.error?.message ?? "Failed to get wiki page snapshot.");
}

return response.data?.snapshot ?? null;
```

Then sweep the rest of `background/index.ts` for stray `console.log` and replace
genuine diagnostics with `logger.*`:

```bash
grep -rn "console\.\(log\|debug\)" src/   # should return nothing after this step
```

## 0.3 Fix RSC parser nits

In `src/parser/deepwikiRscSource.ts`, replace the magic `+ 100` and remove the
stray trailing-whitespace block.

```ts
// Max plausible RSC row header: "<token>:T<hex>,1," — comfortably under this.
const MAX_RSC_HEADER_LEN = 100;

// ...inside the walk loop:
const slice = joined.slice(currentPos, currentPos + MAX_RSC_HEADER_LEN);
```

## Done when

- `grep -rn "console\.\(log\|debug\)" src/` returns nothing.
- Magic number replaced with a named constant + comment.
- `npm run typecheck && npm test` green.
- Any pure-formatting changes are in a **separate** commit.

```bash
git add -A && git commit -m "chore: gate logging, drop debug noise, tidy RSC parser"
```
