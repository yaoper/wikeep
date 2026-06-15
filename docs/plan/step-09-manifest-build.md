# Step 9 — Manifest, permissions & build

**Files:** `public/manifest.json`, `package.json` / `package-lock.json`

---

## 9.1 Manifest — broaden the content-script match

The content script must also run on wiki pages. It self‑filters by route
(Step 6), so widening the match is safe. We also register a **second content
script in the page's MAIN world** to read `window.__next_f` for diagram/Markdown
recovery (Step 12) — an isolated‑world script cannot see page globals.

```json
"content_scripts": [
  {
    "matches": [
      "https://deepwiki.com/search/*",
      "https://deepwiki.com/*"
    ],
    "js": ["content.js"],
    "run_at": "document_end"
  },
  {
    "matches": ["https://deepwiki.com/*"],
    "js": ["pageWorldProbe.js"],
    "run_at": "document_start",
    "world": "MAIN"
  }
]
```

The MAIN‑world probe runs at `document_start` so it can observe the RSC stream as
it arrives, and bridges data to the isolated `content.js` via `window.postMessage`
(Step 12 §2). The `world` field requires Chrome 111+ / MV3 (the extension is
already MV3).

> `https://deepwiki.com/*` subsumes `/search/*`; both are listed for clarity.
> The route branch no‑ops on non‑wiki pages, and the probe only posts when
> `__next_f` exists.

No permission changes: `host_permissions` already include
`https://deepwiki.com/*`, and wiki extraction is DOM/RSC‑only (no new API host).

MV3 invariants used by the Nix flake checks (`manifest_version`,
`background.service_worker`, `side_panel.default_path`) are unchanged, so
`wikeep-check` / `wikeep-build` still pass.

---

## 9.2 Dependencies

```bash
npm i turndown turndown-plugin-gfm
npm i -D @types/turndown
```

Commit `package.json` **and** `package-lock.json`.

---

## 9.3 Build

One small build‑script addition: the MAIN‑world probe is a **second IIFE bundle**.

- The side panel / background bundle is built by the first Vite pass; the new
  modules (`pageRepository`, `wikiMarkdown`, `wikiUrl`) are imported normally.
- The content script is the second pass (IIFE from `src/content/index.ts`).
  Turndown + the wiki parser bundle into `content.js` via the existing
  `inlineDynamicImports: true`.
- **Add a third pass** in `scripts/build.mjs` to emit `pageWorldProbe.js` (IIFE,
  no imports), mirroring the content‑script pass:

```js
await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: resolve(projectRoot, 'src/content/pageWorldProbe.ts'),
      name: 'WikeepPageWorldProbe',
      formats: ['iife'],
      fileName: () => 'pageWorldProbe.js'
    },
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
```

After building, sanity‑check the content bundle size (Turndown adds ~30–50 KB
minified). It remains well within content‑script limits.

```bash
nix develop --command wikeep-build
ls -la dist/content.js          # eyeball the size
```

---

## Checklist

- [ ] Manifest `matches` widened to include wiki pages.
- [ ] MAIN‑world `pageWorldProbe.js` content script registered (`world: "MAIN"`, `document_start`).
- [ ] Build emits `dist/pageWorldProbe.js`.
- [ ] No new permissions added.
- [ ] Turndown deps installed; lockfile committed.
- [ ] `wikeep-build` succeeds; `dist/content.js` size acceptable.
