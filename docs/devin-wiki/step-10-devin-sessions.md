# Step 10 — Save Devin sessions (`app.devin.ai/search/*`)

## Goal

Capture Ask/search conversations on `app.devin.ai/search/<queryId>`, the same
way DeepWiki sessions are captured.

## Findings (verified live)

- The page loads its session from **`https://app.devin.ai/api/ada/query/<queryId>`**
  (not DeepWiki's public `api.devin.ai/ada/query/...`).
- The response shape is **identical** to `DeepWikiQuerySession` (`title`,
  `queries[]` with `user_query`, `repo_names`, `response[]` chunk/reference/
  thoughts events, `state`), so the existing parser
  `buildCapturePayloadFromDeepWikiSession` works unchanged.
- The endpoint is **authenticated**: it needs `Authorization: Bearer <token>`
  and `x-cog-org-id: <orgId>`. Both are in the page's `localStorage`:
  - token: `JSON.parse(localStorage["auth1_session"]).token`
  - orgId: first `org-<32hex>` found across localStorage keys/values.
- A fetch with those headers returned `200` from the page context.

## Changes

| File | Change |
|---|---|
| `src/api/deepwikiApi.ts` | `extractQueryIdFromUrl` accepts `app.devin.ai` too. New `fetchDevinSession(queryId, {token, orgId})` → `app.devin.ai/api/ada/query/<id>` with auth headers. |
| `src/content/index.ts` | `readDevinAuth()` reads token/org from localStorage; `captureDevinSession()` fetches + builds the snapshot and persists via `CAPTURE_DOM_SNAPSHOT`. `captureSession` branches on host. |
| `public/manifest.json` | Add `https://app.devin.ai/search/*` to the `content.js` matches. |
| `src/shared/utils.ts` | Session filename is source-aware: `wikeep-devin-session-…` for Devin, `wikeep-deepwiki-session-…` otherwise. |

## Why fetch in the content script (not the background)

The token lives in the page's `localStorage`, which the background worker can't
read. The content script can (localStorage is shared with the isolated world),
the request is same-origin (`app.devin.ai` → `app.devin.ai/api`), and
`app.devin.ai/*` is already in `host_permissions`. The built snapshot is handed
to the existing `captureViaDom` path for storage — no new storage code.

## Result

- Source citations render via Step 9's `**Sources:**` block (Devin returns the
  same `reference` events).
- Export name: `wikeep-devin-session-drunkod_nix-config-1-please-create-arch-…-<date>.md`.

## Verify

- `npm run build`, reload, open an `app.devin.ai/search/...` page.
- Panel should show the session as supported (no longer "Not a DeepWiki page").
- Capture; confirm the conversation, mermaid diagram, and Sources are saved.
