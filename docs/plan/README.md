# Save DeepWiki static pages — implementation steps

This folder breaks the feature plan in
[`../PLAN_SAVE_STATIC_PAGES.md`](../PLAN_SAVE_STATIC_PAGES.md) into ordered,
self‑contained steps. Each step lists the files it touches and gives **full code**
(new files) or **precise diffs/snippets** (edits to existing files).

## Goal recap

Save DeepWiki **wiki pages** (e.g. `deepwiki.com/facebook/react` and
`/facebook/react/1.1-repository-structure-and-packages`) to a new local `pages`
store and export them as Markdown. Manual "Save this page" plus auto‑refresh when
the page content changes (DeepWiki re‑indexes after the repo changes).
HTML→Markdown via **Turndown + turndown-plugin-gfm**.

This is additive — the existing `/search/*` session capture is untouched.

## Build order

| Step | File | What it delivers |
|---|---|---|
| 0 | [step-00-corrections.md](step-00-corrections.md) | **Read first** — repo‑accurate fixes from review + revised order |
| 1 | [step-01-data-model.md](step-01-data-model.md) | `WikiPage` types, `DB_VERSION` 2→3, `pages` store + v3 upgrade |
| 2 | [step-02-page-repository.md](step-02-page-repository.md) | `pageRepository.ts` CRUD + freshness |
| 3 | [step-03-url-and-markdown.md](step-03-url-and-markdown.md) | Wiki URL helpers + Turndown converter + deps |
| 4 | [step-04-wiki-parser.md](step-04-wiki-parser.md) | `deepwikiWikiParser.ts` (prose → snapshot) |
| 5 | [step-05-messages.md](step-05-messages.md) | New runtime commands + payload types |
| 6 | [step-06-content-script.md](step-06-content-script.md) | Route branch + wiki capture mode |
| 7 | [step-07-background.md](step-07-background.md) | Background handlers + tab status |
| 8 | [step-08-sidepanel-ui.md](step-08-sidepanel-ui.md) | Save button, Wiki Pages view, settings toggle |
| 9 | [step-09-manifest-build.md](step-09-manifest-build.md) | Manifest matches, deps, build notes |
| 10 | [step-10-tests.md](step-10-tests.md) | Unit tests + HTML fixture |
| 11 | [step-11-verification.md](step-11-verification.md) | Live DevTools‑MCP verification checklist |
| 12 | [step-12-diagrams.md](step-12-diagrams.md) | Save diagrams (Mermaid source) for sessions **and** wiki pages |

## Phasing

- **Phase 1 (steps 0–5, 6 + 12 partial, 8 partial, 9, 10):** manual Save + Markdown export with real diagrams.
- **Phase 2 (rest of 6, 7, 8):** auto‑refresh on content change.
- **Phase 3 (later):** "Save entire wiki", inline‑SVG diagrams, bulk export.

> Start with **[step-00-corrections.md](step-00-corrections.md)** — it lists the
> repo‑accurate fixes (DB version, MAIN‑world RSC probe, live diagram measuring,
> router style, route‑aware context) and the recommended order.

## Conventions

- All new user‑facing strings are **English**.
- Reuse existing helpers: `stableHash`, `normalizeText`, `sanitizeFilename`,
  `sendRuntimeMessage`.
- Commit `package-lock.json` after adding deps (keeps `npm ci` / the Nix flake
  reproducible).
