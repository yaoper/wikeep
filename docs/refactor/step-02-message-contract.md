# Step 2 — Type-safe message contract

**Goal:** one source of truth mapping each command → payload → result, so the
router and UI client can be split without losing exhaustiveness.
**Risk:** low (types only, no runtime change). **Touches:** `shared/messages.ts`,
`background/index.ts`.

## Problem

Today the router casts `payload as XPayload` on every `case`, and the UI calls
`sendRuntimeMessage<TResult, TPayload>("CMD", ...)` with the generics supplied by
hand. Nothing checks that the command string, payload, and result line up.

```ts
// current router — unchecked casts everywhere
case "DELETE_CONVERSATION":
  return deleteConversation((payload as DeleteConversationPayload).conversationId);
```

## 2.1 Introduce a CommandMap

Add to `src/shared/messages.ts`:

```ts
// Each command maps to its request payload and response data.
export interface CommandMap {
  CAPTURE_DEEPWIKI_SESSION: { payload: CaptureDeepWikiSessionPayload; result: CaptureResult };
  LIST_CONVERSATIONS:       { payload: ListConversationsPayload | undefined; result: ConversationListItem[] };
  GET_CONVERSATION_DETAIL:  { payload: GetConversationDetailPayload; result: ConversationDetail | null };
  DELETE_CONVERSATION:      { payload: DeleteConversationPayload; result: void };
  CLEAR_ALL_DATA:           { payload: undefined; result: void };
  GET_SETTINGS:             { payload: undefined; result: Settings };
  UPDATE_SETTINGS:          { payload: UpdateSettingsPayload; result: Settings };
  SAVE_WIKI_PAGE:           { payload: SaveWikiPagePayload; result: SaveWikiPageResult };
  SAVE_FULL_WIKI:           { payload: SaveFullWikiPayload; result: SaveWikiPageResult };
  LIST_WIKI_PAGES:          { payload: ListWikiPagesPayload | undefined; result: WikiPage[] };
  EXPORT_DATA:              { payload: undefined; result: ExportDataResult };
  IMPORT_DATA:              { payload: ImportDataPayload; result: ImportDataResult };
  // ...one entry per RuntimeCommand
}

// Derive the union from the map so they can never drift apart.
export type RuntimeCommand = keyof CommandMap;

export type PayloadOf<C extends RuntimeCommand> = CommandMap[C]["payload"];
export type ResultOf<C extends RuntimeCommand> = CommandMap[C]["result"];
```

Delete the hand-maintained `RuntimeCommand` string union — it is now derived.

## 2.2 Type the request/response generics off the map

```ts
export interface RuntimeRequest<C extends RuntimeCommand = RuntimeCommand> {
  command: C;
  payload?: PayloadOf<C>;
}

export interface RuntimeResponse<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: RuntimeErrorPayload;
}
```

## 2.3 Make the router exhaustive

Add a `never` default so a missing command is a **compile** error:

```ts
async function handleRuntimeCommand<C extends RuntimeCommand>(
  command: C,
  payload: PayloadOf<C>,
  sender: chrome.runtime.MessageSender,
): Promise<ResultOf<C>> {
  switch (command) {
    // ...existing cases, now without `as XPayload` casts
    default: {
      const _exhaustive: never = command;
      throw new Error(`Unsupported runtime command: ${String(_exhaustive)}`);
    }
  }
}
```

## 2.4 (Sets up Step 4) typed client signature

The UI client built in Step 4 then becomes:

```ts
export function send<C extends RuntimeCommand>(
  command: C,
  payload?: PayloadOf<C>,
): Promise<ResultOf<C>> { /* ... */ }
```

## Done when

- `RuntimeCommand` is derived from `CommandMap` (no duplicated string union).
- The router compiles with a `never` exhaustiveness default.
- No runtime behavior change; `npm run typecheck && npm test` green.

```bash
git add -A && git commit -m "refactor(types): derive command/payload/result from CommandMap"
```
