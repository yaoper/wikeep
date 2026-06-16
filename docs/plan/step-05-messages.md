# Step 5 — Runtime messages

**File:** `src/shared/messages.ts`

Add the wiki commands and their payload/result types alongside the existing
session commands.

---

## 5.1 Extend the command union

```ts
export type RuntimeCommand =
  | 'CAPTURE_DEEPWIKI_SESSION'
  | 'CAPTURE_DOM_SNAPSHOT'
  | 'LIST_CONVERSATIONS'
  | 'GET_CONVERSATION_DETAIL'
  | 'DELETE_CONVERSATION'
  | 'CLEAR_ALL_DATA'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'GET_ACTIVE_TAB_CONTEXT'
  | 'OPEN_SIDE_PANEL'
  | 'LOOKUP_CAPTURE_BY_QUERY_ID'
  | 'REPORT_PAGE_STATUS'
  | 'ACTIVE_TAB_CONTEXT_CHANGED'
  | 'GET_PAGE_STATUS'
  | 'TRIGGER_RECAPTURE'
  | 'EXPORT_DATA'
  | 'IMPORT_DATA'
  | 'EXPORT_CONVERSATION_MARKDOWN'
  // ── wiki pages ──
  | 'WIKI_PAGE_DETECTED'          // content → BG: fingerprint on load
  | 'SAVE_WIKI_PAGE'             // panel/content → BG: capture + store
  | 'GET_WIKI_PAGE_SNAPSHOT'     // BG → content: pull full snapshot from a tab
  | 'LIST_WIKI_PAGES'           // panel → BG
  | 'GET_WIKI_PAGE'             // panel → BG
  | 'DELETE_WIKI_PAGE'         // panel → BG
  | 'REFRESH_WIKI_PAGE'        // panel → BG: force re-capture
  | 'EXPORT_WIKI_PAGE_MARKDOWN'  // panel → BG: returns { markdown, filename }
  | 'WIKI_PAGE_STATE_CHANGED';   // BG → panel: savable/saved/stale/updated
```

---

## 5.2 Payload & result types

Append to `src/shared/messages.ts`:

```ts
import type {
  WikiPage,
  WikiPageFingerprint,
  WikiPageSnapshot,
  WikiPageTabState
} from './types';

// content → BG, on every wiki page load
export interface WikiPageDetectedPayload {
  fingerprint: WikiPageFingerprint;
  tabId?: number;
}

// panel → BG (uses active tab) OR content → BG (carries its own snapshot)
export interface SaveWikiPagePayload {
  tabId?: number;
  snapshot?: WikiPageSnapshot; // when the content script already parsed it
}

export interface SaveWikiPageResult {
  pageId: string;
  changed: boolean;
  created: boolean;
  title: string;
}

// BG → content
export interface GetWikiPageSnapshotResult {
  snapshot: WikiPageSnapshot | null;
}

export interface ListWikiPagesPayload {
  keyword?: string;
}

export interface GetWikiPagePayload {
  pageId: string;
}

export interface DeleteWikiPagePayload {
  pageId: string;
}

export interface RefreshWikiPagePayload {
  pageId?: string; // when omitted, refresh the active tab's page
  tabId?: number;
}

export interface ExportWikiPageMarkdownPayload {
  pageId: string;
}

export interface ExportWikiPageMarkdownResult {
  markdown: string;   // full document incl. front-matter
  filename: string;
}

// BG → panel (near-real-time status for the active tab).
// Shape lives in types.ts (WikiPageTabState) so types.ts stays message-free.
export interface WikiPageStateChangedPayload extends WikiPageTabState {}

export type ListWikiPagesResult = WikiPage[];
export type GetWikiPageResult = WikiPage | null;
```

---

## Checklist

- [ ] Command union extended with the 9 wiki commands.
- [ ] Payload/result interfaces added.
- [ ] `npm run typecheck` passes (no usages yet — just types).
