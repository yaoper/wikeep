# Step 4 — Decompose the side panel

**Goal:** break the 1056-line `SidePanelApp.tsx` into a typed messaging client,
pure helpers, icons, hooks, and view components. **Risk:** high.
**Touches:** `src/ui/`.

Today the component owns ~17 `useState`, ~10 `useEffect`, ~30 handlers, status
helpers, four icon components, and all JSX. Split it in five sub-commits.

## Target layout

```
src/ui/
  api/client.ts                 # typed sendRuntimeMessage wrappers
  sidepanel/
    SidePanelApp.tsx            # shell only (< 200 LOC)
    status.ts                   # pure status helpers (+ unit tests)
    views/HistoryView.tsx
    views/SettingsView.tsx
    views/BackupView.tsx
  components/icons.tsx          # RefreshIcon, MoreIcon, BackIcon, ToastIcon
  hooks/
    useActiveTabContext.ts
    useWikiPages.ts
    useConversations.ts
    useSettings.ts
    useBackup.ts
```

## 4a — Messaging client

Move every `sendRuntimeMessage` call into one typed module (uses the Step 2
`CommandMap`):

```ts
// src/ui/api/client.ts
import type { RuntimeCommand, PayloadOf, ResultOf, RuntimeResponse } from "../../shared/messages";

async function send<C extends RuntimeCommand>(
  command: C,
  payload?: PayloadOf<C>,
): Promise<ResultOf<C>> {
  const res = (await chrome.runtime.sendMessage({ command, payload })) as RuntimeResponse<ResultOf<C>>;
  if (!res?.ok) throw new Error(res?.error?.message ?? "Request failed");
  return res.data as ResultOf<C>;
}

export const api = {
  listConversations: (keyword?: string) => send("LIST_CONVERSATIONS", { keyword }),
  listWikiPages:     (keyword?: string) => send("LIST_WIKI_PAGES", { keyword }),
  getActiveContext:  () => send("GET_ACTIVE_TAB_CONTEXT", undefined),
  getSettings:       () => send("GET_SETTINGS", undefined),
  saveWikiPage:      (tabId?: number) => send("SAVE_WIKI_PAGE", { tabId }),
  saveFullWiki:      (tabId?: number) => send("SAVE_FULL_WIKI", { tabId }),
  exportData:        () => send("EXPORT_DATA", undefined),
  importData:        (backup: BackupData) => send("IMPORT_DATA", { backup }),
  // ...one method per command the UI uses
};
```

No component calls `chrome.runtime.sendMessage` directly after this.

## 4b — Pure status helpers out

Move `isStatusPending`, `getWikiStatusTone`, `getStatusTone`, `getStatusTitle`,
`getStatusSubtitle`, `getStatusActionLabel`, `shouldAutoRefreshContext` into
`src/ui/sidepanel/status.ts` and unit-test them (they're pure → cheap to test):

```ts
// tests/sidePanelStatus.test.ts
import { getStatusTone } from "../src/ui/sidepanel/status";

it("returns 'saved' for a freshly saved wiki context", () => {
  expect(getStatusTone({ routeKind: "wiki", wikiState: { state: "saved_fresh" } } as any)).toBe("saved");
});
```

## 4c — Icons out

Move `RefreshIcon`, `MoreIcon`, `BackIcon`, `ToastIcon` to
`src/ui/components/icons.tsx` and import them.

## 4d — State into hooks

Group cohesive `useState`/`useEffect` clusters. Example:

```ts
// src/ui/hooks/useWikiPages.ts
import { useCallback, useState } from "react";
import { api } from "../api/client";
import type { WikiPage } from "../../shared/types";

export function useWikiPages() {
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (keyword?: string, opts?: { silent?: boolean }) => {
    try {
      setWikiPages(await api.listWikiPages(keyword));
    } catch (e) {
      if (!opts?.silent) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const saveFull = useCallback(async (tabId?: number) => {
    const r = await api.saveFullWiki(tabId);
    await load(undefined, { silent: true });
    return r;
  }, [load]);

  return { wikiPages, error, load, saveFull };
}
```

Likewise `useActiveTabContext` (context load + auto-refresh + the
`onMessage` subscription for `ACTIVE_TAB_CONTEXT_CHANGED` /
`WIKI_PAGE_STATE_CHANGED`), `useConversations`, `useSettings`, `useBackup`.

## 4e — Split views

Extract `HistoryView`, `SettingsView`, `BackupView`. `SidePanelApp` becomes a
shell that composes hooks, renders the header/toast, and picks a view:

```tsx
// src/ui/sidepanel/SidePanelApp.tsx (shell)
export function SidePanelApp() {
  const [view, setView] = useState<View>("history");
  const conversations = useConversations();
  const wiki = useWikiPages();
  const context = useActiveTabContext();
  const settings = useSettings();

  return (
    <div className="panel">
      <Header context={context} onNavigate={setView} />
      {view === "history" && <HistoryView conversations={conversations} wiki={wiki} context={context} />}
      {view === "settings" && <SettingsView settings={settings} />}
      {view === "backup" && <BackupView />}
      <Toast /* info/error messages */ />
    </div>
  );
}
```

## Order of operations (one commit each)

`4a client` → `4b status` → `4c icons` → `4d hooks` → `4e views`. After each,
`npm run typecheck && npm test` and the Step 1 smoke test must pass.

## Done when

- `SidePanelApp.tsx` < 200 LOC and contains no `chrome.*` calls.
- Status helpers are unit-tested.
- Each view/hook is single-purpose; smoke test passes unchanged.
