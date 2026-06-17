# Support saving wiki pages from Devin (`app.devin.ai`) — implementation steps

This folder breaks [`../../implementation_plan.md`](../../implementation_plan.md)
into ordered, self-contained steps. Each step lists the files it touches and gives
**full code** (new files) or **precise snippets** (edits to existing files).

Written against the **refactored** layout on `refactor/codebase-cleanup`
(target branch: `feature/devin-wiki-support`), where the content script is split
into `content/index.ts` (routing), `content/probe.ts` (snapshot orchestration +
RSC wait) and `content/observer.ts`, and background handling lives in
`background/handlers/wiki.ts`.

## Goal recap

Save Devin wiki **single pages** and **full wikis** from
`https://app.devin.ai/org/<org-slug>/wiki/<owner>/<repo>`. Devin exposes **no RSC
Flight stream**, so all Devin saves are DOM-based. Single pages reuse the existing
`parseWikiPage` (it already selects `.prose-main`); full wikis need a **new
DOM-traversal builder** because `parseFullWiki` is RSC-only and returns `null`
without `rscRaw`. Existing DeepWiki behavior is untouched.

## Build order

| Step | File | What it delivers |
|---|---|---|
| 1 | [step-01-url-matching.md](step-01-url-matching.md) | Devin matcher in `wikiUrl.ts` (hash-based `sectionPath`) |
| 2 | [step-02-manifest.md](step-02-manifest.md) | Host permission + `content.js` match (no MAIN-world probe) |
| 3 | [step-03-probe-single-page.md](step-03-probe-single-page.md) | Bypass `waitForRscRaw` on Devin in `content/probe.ts` |
| 4 | [step-04-devin-full-wiki-parser.md](step-04-devin-full-wiki-parser.md) | **New** `devinWikiParser.ts` DOM-traversal full-wiki builder |
| 5 | [step-05-wire-full-wiki.md](step-05-wire-full-wiki.md) | Branch `snapshotFullWiki()` to the new builder for Devin |
| 6 | [step-06-tests.md](step-06-tests.md) | URL unit tests + jsdom parser fixtures |
| 7 | [step-07-verification.md](step-07-verification.md) | Build + live verification checklist |
| 8 | [step-08-diagrams-fiber.md](step-08-diagrams-fiber.md) | Preserve Mermaid via MAIN-world React-fiber probe |
| 9 | [step-09-source-naming.md](step-09-source-naming.md) | Source-aware ids + export filenames (deepwiki/devin) |

## No-change confirmations

- `content/index.ts` — `main()` already routes via `isWikiPageUrl`; the message
  handlers already delegate to `snapshotCurrentPage()` / `snapshotFullWiki()`.
  Nothing to edit once `wikiUrl.ts` matches Devin.
- `background/handlers/wiki.ts` — `save`/`saveFull` request the snapshot from the
  content script and persist via `upsertWikiPage`. `isWikiPageUrl` already gates
  `detected` and the side-panel Save UI. Devin flows through unchanged.
