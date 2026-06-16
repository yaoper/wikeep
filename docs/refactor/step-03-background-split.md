# Step 3 — Decompose the background service worker

**Goal:** turn the 704-line god worker into a thin entrypoint + a router + focused
domain handlers. **Risk:** high (lots of movement). **Touches:**
`src/background/`.

Rely on the Step 1 router tests. Move code without changing logic.

## Target layout

```
src/background/
  index.ts          # entrypoint: register chrome.* listeners only (< 120 LOC)
  router.ts         # handleRuntimeCommand: command -> handler
  handlers/
    conversations.ts # capture (api/dom), list/detail/delete, export md
    wiki.ts          # detect/save/saveFull/list/get/delete/refresh/export
    tabContext.ts    # active-tab context, badge, status, change notifications
    data.ts          # export/import/clear-all, settings
```

## 3.1 Extract the router

Move `handleRuntimeCommand` to `src/background/router.ts`. It should only map a
command to a handler call — no business logic.

```ts
// src/background/router.ts
import type { RuntimeCommand, PayloadOf, ResultOf } from "../shared/messages";
import * as conversations from "./handlers/conversations";
import * as wiki from "./handlers/wiki";
import * as tabContext from "./handlers/tabContext";
import * as data from "./handlers/data";

export async function handleRuntimeCommand<C extends RuntimeCommand>(
  command: C,
  payload: PayloadOf<C>,
  sender: chrome.runtime.MessageSender,
): Promise<ResultOf<C>> {
  switch (command) {
    case "LIST_CONVERSATIONS":
      return conversations.list(payload?.keyword) as Promise<ResultOf<C>>;
    case "SAVE_WIKI_PAGE":
      return wiki.save({ ...payload, tabId: payload?.tabId ?? sender.tab?.id }) as Promise<ResultOf<C>>;
    case "GET_ACTIVE_TAB_CONTEXT":
      return tabContext.get() as Promise<ResultOf<C>>;
    case "EXPORT_DATA":
      return data.exportAll() as Promise<ResultOf<C>>;
    // ...remaining cases
    default: {
      const _exhaustive: never = command;
      throw new Error(`Unsupported runtime command: ${String(_exhaustive)}`);
    }
  }
}
```

## 3.2 Move handlers by domain

Cut each function into its domain file unchanged. Example — `wiki.ts` collects
the wiki handlers (`saveWikiPage`, `saveFullWiki`, `handleWikiPageDetected`,
`handleRefreshWikiPage`, `requestWikiSnapshot`, `resolveWikiRefreshTab`,
`exportWikiPageMarkdown`) and re-exports the public entry points:

```ts
// src/background/handlers/wiki.ts
import { logger } from "../../shared/logger";
import * as pages from "../../storage/pageRepository";
// ...

export async function save(payload: SaveWikiPagePayload): Promise<SaveWikiPageResult> {
  // body moved verbatim from index.ts saveWikiPage()
}

export async function saveFull(payload: SaveFullWikiPayload): Promise<SaveWikiPageResult> { /* ... */ }
export async function detected(sender: chrome.runtime.MessageSender, p: WikiPageDetectedPayload) { /* ... */ }
// internal helpers stay un-exported in this module
```

Do the same for `conversations.ts`, `tabContext.ts` (move `cacheTabStatus`,
`clearActiveTabBadge`, `notifyActiveTabContextChanged`,
`notifyIfActiveTabChanged`, `handleActiveTabChange`, `getActiveTabContext`),
and `data.ts`.

## 3.3 Slim the entrypoint

`index.ts` keeps only listener wiring:

```ts
// src/background/index.ts
import { handleRuntimeCommand } from "./router";
import * as tabContext from "./handlers/tabContext";

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  handleRuntimeCommand(req.command, req.payload, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) =>
      sendResponse({ ok: false, error: { code: "RUNTIME", message: String(error?.message ?? error) } }),
    );
  return true; // async response
});

chrome.tabs.onActivated.addListener(() => void tabContext.handleActiveTabChange());
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === "complete") void tabContext.handleActiveTabChange();
});
chrome.action.onClicked.addListener(() => void tabContext.openSidePanelForActiveTab());
```

## Order of operations (one commit each)

1. Extract `router.ts` (export from `index`, keep handlers in place). Tests green.
2. Move conversation handlers → `handlers/conversations.ts`. Tests green.
3. Move wiki handlers → `handlers/wiki.ts`. Tests green.
4. Move tab/badge/context helpers → `handlers/tabContext.ts`. Tests green.
5. Move data/settings handlers → `handlers/data.ts`. Tests green.
6. Slim `index.ts` to listeners only.

## Done when

- `index.ts` is listeners only (< 120 LOC).
- Each handler module is single-domain; no cross-domain imports between handlers
  except via shared storage/parser modules.
- Step 1 router tests pass **unchanged** (update only the import path).
