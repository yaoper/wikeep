# Step 2 — Manifest host permission + content-script match

**File:** `public/manifest.json` (MODIFY)

## Why

The content script (`content.js`) must be injected on Devin wiki pages, and the
extension needs host permission to message that tab. The MAIN-world
`pageWorldProbe.js` is **deliberately not** added — it only captures Next.js RSC
Flight records, which Devin does not expose, so on Devin it would be dead weight.

## Snippet — `host_permissions`

```jsonc
"host_permissions": [
  "https://deepwiki.com/*",
  "https://api.devin.ai/ada/query/*",
  "https://app.devin.ai/*"          // <-- add
],
```

## Snippet — `content_scripts`

Add `app.devin.ai` only to the `content.js` entry. Leave the `pageWorldProbe.js`
(`world: "MAIN"`) entry scoped to `deepwiki.com`.

```jsonc
"content_scripts": [
  {
    "matches": [
      "https://deepwiki.com/search/*",
      "https://deepwiki.com/*",
      "https://app.devin.ai/org/*/wiki/*"   // <-- add
    ],
    "js": ["content.js"],
    "run_at": "document_end"
  },
  {
    "matches": ["https://deepwiki.com/*"],   // <-- unchanged: no Devin here
    "js": ["pageWorldProbe.js"],
    "run_at": "document_start",
    "world": "MAIN"
  }
]
```

## Note on SPA navigation

Devin is a hash-routed SPA, so `content.js` is injected once at `document_end`
and persists across `#1.1 → #1.2` navigations. The existing `observeWikiPage`
MutationObserver keeps the fingerprint fresh as sections change. No
`webNavigation` permission is required.
