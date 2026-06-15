# Step 0 — Repo‑accurate corrections (read first)

A review caught several places where the original plan assumed a different repo
state. Each item below was **verified against the current source**. The affected
step files have been updated; this page is the consolidated rationale + the
recommended build order.

---

## Verified facts & fixes

| # | Issue | Verified in repo | Fix (where) |
|---|---|---|---|
| 1 | DB version already `2` | `src/shared/constants.ts` → `DB_VERSION = 2`; `db.ts` only has an `oldVersion < 1` branch | Bump `2 → 3`; create `pages` in `oldVersion < 3`. **Step 1** |
| 2 | `window.__next_f` is unreachable from an isolated content script | Chrome content scripts run in an isolated world by default (`world` defaults to `ISOLATED`) | Add a `world: "MAIN"` probe + `postMessage` bridge. **Step 12 §2, Step 9** |
| 3 | Diagram SVG sizing ran on a detached clone (0×0 layout) | Original Step 4 cloned `root` then measured `getBoundingClientRect()` | Measure diagram indexes on the **live** root, apply to the clone by index. **Step 4** |
| 4 | Background router style mismatch | `src/background/index.ts` → `handleRuntimeCommand(cmd, payload, sender)`, each `case` **returns data**; wrapper builds `{ ok, data }`; no `respond()` | Handlers return/throw; `case` just `return fn(...)`. **Step 7** |
| 5 | Active‑tab context only supports `/search/*` | `getActiveTabContext()` → `supported: Boolean(queryId)` | Add `routeKind` + wiki support + `wikiState` cache. **Step 1, Step 7.3b** |
| 6 | `DEFAULT_SETTINGS` missing the new flag | `constants.ts` `DEFAULT_SETTINGS` has no `autoRefreshWikiPages` | Add `autoRefreshWikiPages: false` (keep `schemaVersion: 1`). Merge‑over‑defaults back‑fills users. **Step 1** |
| 7 | UI language consistency | **Already resolved** — the side panel was migrated to English in a prior change; `grep -P '[\x{4e00}-\x{9fff}]' src` returns nothing | New wiki strings stay English — consistent. No action. |

Extra correctness item from the review, also applied:

- **`by-repo` index could collide** (`facebook/react` vs another owner's `react`).
  Added `repoFullName: \`${owner}/${repo}\`` to `WikiPage` and index
  **`by-repoFullName`** instead of `by-repo`. **Step 1, Step 2**

---

## Recommended build order (revised)

1. **Step 0** (this page) — internalise the corrections.
2. **Step 1** — data model, `DB_VERSION = 3`, `DEFAULT_SETTINGS`, `BackupData`, `ActiveTabContext`.
3. **Step 2** — `pageRepository` (with `repoFullName`).
4. **Step 3** — URL helpers + Turndown converter (DOM fallback path).
5. **Step 4** — wiki parser (live‑measured diagram detection).
6. **Step 12 (early)** — MAIN‑world RSC probe + bridge **before** relying on `__next_f`.
7. **Step 5** — runtime messages.
8. **Step 6** — content‑script route branch + probe wiring.
9. **Step 7** — background handlers (return‑style) + route‑aware context.
10. **Step 8** — side panel UI (route‑aware status + Wiki Pages view).
11. **Step 9** — manifest (2 content scripts) + build (3rd IIFE pass) + deps.
12. **Steps 10–11** — tests + live verification.

> Why Step 12 moves early: the RSC probe is the difference between real Mermaid
> source and a lossy placeholder. Standing it up before the parser settles avoids
> reworking the snapshot path twice.

---

## Still‑valid strengths (unchanged)

- Additive design: `pages` store is separate; `/search/*` capture untouched.
- `host_permissions` already cover `https://deepwiki.com/*` — no new permission.
- Session diagrams already survive: `deepwikiApi.ts` concatenates `chunk` data and
  `normalizeText()` only normalises line endings / collapses blank runs, so fenced
  ```` ```mermaid ```` blocks pass through (watch for any `thoughts_start` /
  `thoughts_end` stripping — keep fenced blocks).
