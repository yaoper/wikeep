# Step 1 — Data model & `pages` store

**Files:** `src/shared/types.ts`, `src/shared/constants.ts`, `src/storage/db.ts`

Additive only. Existing `conversations`/`messages` stores and data are untouched;
the new `pages` store is created on the version‑**3** upgrade.

> ⚠️ Repo‑accurate note (verified): `DB_VERSION` is **already `2`** in
> `src/shared/constants.ts`, and the current `db.ts` upgrade only has an
> `oldVersion < 1` branch (creates `conversations` + `messages`). So we bump
> `2 → 3` and add an `oldVersion < 3` branch. See
> [step-00-corrections.md](step-00-corrections.md).

---

## 1.1 Types — `src/shared/types.ts`

Append these to the existing file.

```ts
// ── Wiki pages (static DeepWiki pages) ─────────────────────────────

/** A saved DeepWiki wiki page (repo overview or a numbered section). */
export interface WikiPage {
  id: string;                 // `wiki:{owner}/{repo}` or `wiki:{owner}/{repo}/{sectionPath}`
  source: 'deepwiki-wiki';
  owner: string;
  repo: string;               // repo name only, e.g. "react"
  repoFullName: string;       // `${owner}/${repo}`, e.g. "facebook/react" — indexed (avoids name collisions)
  sectionPath?: string;       // e.g. "1.1-repository-structure-and-packages"; undefined => repo overview
  hasDiagrams?: boolean;      // true when Mermaid source was recovered (see step-12)
  title: string;
  url: string;
  markdown: string;           // Turndown output (saved body, without front-matter)
  contentHash: string;        // stableHash(cleaned prose text) — change detection
  indexedCommit?: string;     // repo commit SHA parsed from GitHub citations
  relatedSections?: string[]; // TOC hrefs (for future "save whole wiki")
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  lastCheckedAt: number;      // last freshness check
  isStale?: boolean;          // newer content detected but not yet refreshed
  schemaVersion: number;
}

/** Snapshot produced by the content script before persistence. */
export interface WikiPageSnapshot {
  url: string;
  owner: string;
  repo: string;
  sectionPath?: string;
  title: string;
  markdown: string;
  contentHash: string;
  indexedCommit?: string;
  relatedSections?: string[];
  wordCount: number;
  hasDiagrams?: boolean;
  capturedAt: number;
}

/** Lightweight fingerprint sent on every wiki page load for freshness checks. */
export interface WikiPageFingerprint {
  url: string;
  contentHash: string;
  indexedCommit?: string;
}

export type WikiPageState =
  | 'not_saved'
  | 'saved_fresh'
  | 'saved_stale'   // saved but newer content available
  | 'updated';      // just auto-refreshed
```

Extend `Settings` with the auto‑refresh toggle (default `false`):

```ts
export interface Settings {
  autoCaptureEnabled: boolean;
  preferredPanel: 'sidePanel' | 'popup';
  hasSeenPrivacyNotice: boolean;
  autoRefreshWikiPages: boolean;   // ← add
  schemaVersion: number;
}
```

Add a route discriminator to `ActiveTabContext` so the side panel knows whether
the active tab is a session, a wiki page, or neither (the current code only sets
`supported` from a `queryId`):

```ts
export type DeepWikiRouteKind = 'session' | 'wiki' | 'other';

/**
 * Active-tab wiki state. Defined here (not in messages.ts) so types.ts has no
 * dependency on the message layer. messages.ts re-exports it as the payload.
 */
export interface WikiPageTabState {
  url: string;
  state: WikiPageState;
  pageId?: string;
  title?: string;
}

export interface ActiveTabContext {
  tabId?: number;
  title?: string;
  url?: string;
  supported: boolean;
  routeKind?: DeepWikiRouteKind;   // ← add
  queryId?: string;
  status?: CaptureStatus;
  wikiState?: WikiPageTabState;    // ← add (active-tab wiki state)
}
```

Extend `BackupData` so backup/restore includes pages:

```ts
export interface BackupData {
  version: number;
  exportedAt: number;
  conversations: Conversation[];
  messages: Message[];
  pages?: WikiPage[];   // ← add (optional for backward-compatible imports)
}
```

> Wherever `Settings` defaults are created (e.g. `ensureSettings` in the
> background), set `autoRefreshWikiPages: false`.

---

## 1.2 Constants — `src/shared/constants.ts`

Bump the DB version **2 → 3** (it is already `2` in the repo) and add the wiki
settings default. `getSettings()` merges stored settings over `DEFAULT_SETTINGS`,
so adding the key here back‑fills existing users.

```ts
// current repo value is 2 → bump to 3
export const DB_VERSION = 3;

// Optional: keep URL logic in one place (also used by Step 3).
export const DEEPWIKI_HOST = 'deepwiki.com';

// add the new flag to the existing DEFAULT_SETTINGS (keep schemaVersion as-is = 1)
export const DEFAULT_SETTINGS: Settings = {
  autoCaptureEnabled: true,
  preferredPanel: 'sidePanel',
  hasSeenPrivacyNotice: false,
  autoRefreshWikiPages: false,   // ← add
  schemaVersion: 1
};
```

---

## 1.3 Store + upgrade — `src/storage/db.ts`

Add the `pages` store to the schema interface and the upgrade function.

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Conversation, Message, WikiPage } from '../shared/types';
import { DB_NAME, DB_VERSION } from '../shared/constants';

interface WikeepDBSchema extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      'by-updatedAt': number;
      'by-sourceUrl': string;
      'by-sourceSessionId': string;
    };
  };
  messages: {
    key: string;
    value: Message;
    indexes: {
      'by-conversationId': string;
      'by-conversationId-order': [string, number];
    };
  };
  // ── new ──
  pages: {
    key: string;
    value: WikiPage;
    indexes: {
      'by-updatedAt': number;
      'by-url': string;          // unique
      'by-repoFullName': string; // group by `${owner}/${repo}` (collision-safe)
    };
  };
}

let databasePromise: Promise<IDBPDatabase<WikeepDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<WikeepDBSchema>> {
  if (!databasePromise) {
    databasePromise = openDB<WikeepDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const conversations = database.createObjectStore('conversations', { keyPath: 'id' });
          conversations.createIndex('by-updatedAt', 'updatedAt');
          conversations.createIndex('by-sourceUrl', 'sourceUrl', { unique: true });
          conversations.createIndex('by-sourceSessionId', 'sourceSessionId', { unique: false });

          const messages = database.createObjectStore('messages', { keyPath: 'id' });
          messages.createIndex('by-conversationId', 'conversationId');
          messages.createIndex('by-conversationId-order', ['conversationId', 'order']);
        }

        // ── new in v3 (repo currently ships DB_VERSION = 2 with no v2 changes) ──
        if (oldVersion < 3) {
          const pages = database.createObjectStore('pages', { keyPath: 'id' });
          pages.createIndex('by-updatedAt', 'updatedAt');
          pages.createIndex('by-url', 'url', { unique: true });
          pages.createIndex('by-repoFullName', 'repoFullName');
        }
      }
    });
  }

  return databasePromise;
}
```

> The `idb` `upgrade` callback runs each missing version block in order, so
> existing v1 users get only the `pages` block; new users get both. No data
> migration required.

---

## Checklist

- [ ] `WikiPage` (incl. `repoFullName`, `hasDiagrams`), `WikiPageSnapshot`, `WikiPageFingerprint`, `WikiPageState` added.
- [ ] `Settings.autoRefreshWikiPages` added; `DEFAULT_SETTINGS` updated to default it `false`.
- [ ] `ActiveTabContext.routeKind` + `wikiState` added.
- [ ] `BackupData.pages?` added.
- [ ] `DB_VERSION = 3`.
- [ ] `pages` store + `by-repoFullName` index created in the **v3** upgrade.
- [ ] `npm run typecheck` passes.
