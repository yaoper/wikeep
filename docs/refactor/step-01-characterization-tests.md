# Step 1 — Characterization tests for the god files

**Goal:** pin current behavior so the Step 3/4 extractions are safe.
**Risk:** low (tests only). **Touches:** `tests/`.

Parsers, repositories, API, and `wikiUrl` already have tests. The two god files
(`background/index.ts` router, `SidePanelApp.tsx`) do **not**. Add coverage
there first.

## 1.1 Background router dispatch test

Mock `chrome.*` and the repository/handler layer; assert each command routes to
the right call. Example shape:

```ts
// tests/backgroundRouter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the modules the router delegates to.
vi.mock("../src/storage/conversationRepository", () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  getConversationDetail: vi.fn().mockResolvedValue(null),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Minimal chrome stub.
  (globalThis as any).chrome = {
    tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }]), sendMessage: vi.fn() },
    runtime: { lastError: undefined, sendMessage: vi.fn() },
  };
});

describe("handleRuntimeCommand", () => {
  it("LIST_CONVERSATIONS delegates with keyword", async () => {
    const { handleRuntimeCommand } = await import("../src/background/index");
    const repo = await import("../src/storage/conversationRepository");

    await handleRuntimeCommand("LIST_CONVERSATIONS", { keyword: "auth" }, {} as any);

    expect(repo.listConversations).toHaveBeenCalledWith("auth");
  });

  it("throws on unknown command", async () => {
    const { handleRuntimeCommand } = await import("../src/background/index");
    await expect(
      handleRuntimeCommand("NOPE" as any, undefined, {} as any),
    ).rejects.toThrow(/Unsupported runtime command/);
  });
});
```

> Note: `handleRuntimeCommand` is currently module-private. Export it (or move it
> to `router.ts` in Step 3) so it is testable. Exporting it now is a safe
> precursor.

Cover at least one command per domain: a conversation command, a wiki command
(`SAVE_WIKI_PAGE`), a settings command, and `EXPORT_DATA`/`IMPORT_DATA`.

## 1.2 Side panel smoke test

Render `SidePanelApp` with a mocked messaging layer and assert the main flows
don't regress. Stub `chrome.runtime.sendMessage` to resolve canned
`RuntimeResponse`s.

```ts
// tests/sidePanelApp.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SidePanelApp } from "../src/ui/sidepanel/SidePanelApp";

beforeEach(() => {
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn(async (req: { command: string }) => {
        switch (req.command) {
          case "LIST_CONVERSATIONS": return { ok: true, data: [] };
          case "LIST_WIKI_PAGES": return { ok: true, data: [] };
          case "GET_ACTIVE_TAB_CONTEXT": return { ok: true, data: { routeKind: "other" } };
          case "GET_SETTINGS": return { ok: true, data: { autoCapture: true } };
          default: return { ok: true, data: null };
        }
      }),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  };
});

describe("SidePanelApp", () => {
  it("loads history view without crashing", async () => {
    render(<SidePanelApp />);
    await waitFor(() => expect(screen.getByText(/history/i)).toBeTruthy());
  });
});
```

> This needs `@testing-library/react` + `@testing-library/jest-dom` as
> devDependencies and `environment: "jsdom"` in `vitest.config`. Add them in this
> step's commit.

## Done when

- Every router `case` has at least one dispatch assertion (or one per domain).
- A render smoke test covers history/settings view switch.
- `npm test` green.

```bash
git add -A && git commit -m "test: characterize background router and side panel"
```
