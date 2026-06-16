# Step 5 — Polish remaining hotspots

**Goal:** clean the next tier once the two god files are tamed.
**Risk:** medium. **Touches:** `storage/conversationRepository.ts`,
`content/index.ts`, `parser/deepwikiRscSource.ts`.

## 5.1 Split conversation repository (357 LOC)

Separate persistence (CRUD against `db.ts`) from mapping/derivation. Keep the
public API identical so callers don't change.

```
src/storage/
  conversationRepository.ts   # CRUD: get/list/save/delete via getDb()
  conversationMapper.ts       # raw record <-> domain model, derivations
```

```ts
// conversationMapper.ts — pure, easy to unit test
export function toConversationListItem(c: Conversation): ConversationListItem {
  return {
    id: c.id,
    title: c.title,
    sourceUrl: c.sourceUrl,
    updatedAt: c.updatedAt,
    messageCount: c.messageCount,
  };
}
```

```ts
// conversationRepository.ts — persistence only
import { getDb } from "./db";
import { toConversationListItem } from "./conversationMapper";

export async function listConversations(keyword?: string): Promise<ConversationListItem[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("conversations", "by-updatedAt");
  const filtered = keyword ? all.filter((c) => matches(c, keyword)) : all;
  return filtered.reverse().map(toConversationListItem);
}
```

Add direct tests for `conversationMapper.ts`.

## 5.2 Split the content script (282 LOC)

Separate DOM probing/observation from messaging:

```
src/content/
  index.ts        # message listener + wiring only
  probe.ts        # DOM/RSC detection (move pageWorldProbe glue here)
  observer.ts     # MutationObserver / route-change detection
```

The listener stays thin:

```ts
// src/content/index.ts
chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  switch (req.command) {
    case "GET_WIKI_PAGE_SNAPSHOT":
      probe.snapshotCurrentPage().then((s) => sendResponse({ ok: true, data: { snapshot: s } }));
      return true;
    case "GET_FULL_WIKI_SNAPSHOT":
      probe.snapshotFullWiki().then((s) => sendResponse({ ok: true, data: { snapshot: s } }));
      return true;
    default:
      return false;
  }
});
```

## 5.3 RSC parser: docs + multi-byte test

The sequential record walker is dense and the current fixtures are ASCII-only,
so `endIndexFromUtf8ByteLength` (the whole reason byte lengths are computed) is
never exercised. Add a comment block to the walker and a multi-byte test.

```ts
// tests/deepwikiRscSource.test.ts — add to the existing describe
it("respects UTF-8 byte length with multi-byte content", () => {
  const body = "# Überblick — naïve café 🚀\n\nSome content with emoji 🎉.";
  // T length must be the UTF-8 BYTE length, not the char length.
  const byteLen = new TextEncoder().encode(body).length;
  const raw = `1:T${byteLen.toString(16)},1,${body}`;

  const md = extractWikiMarkdownFromRsc(raw);

  expect(md).toContain("# Überblick");
  expect(md).toContain("🚀");
});
```

Document the walker:

```ts
// extractRscTextRecords walks the RSC payload record by record.
// Each record header is "<token>:T<hexByteLength>,1," and the body is exactly
// <hexByteLength> UTF-8 bytes. We measure against the RAW (escaped) string so the
// declared byte length matches the wire format, then decode each record body.
```

## Done when

- `conversationMapper.ts` exists and is unit-tested; repository is persistence-only.
- Content script entry is a thin listener; probing/observation are separate.
- The RSC multi-byte test passes and the walker is documented.
- `npm run typecheck && npm test` green.
