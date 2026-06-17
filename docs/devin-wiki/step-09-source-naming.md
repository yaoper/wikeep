# Step 9 — Source-aware naming (deepwiki vs devin)

## Goal

Saved/exported pages must make their origin obvious and never collide between
the two sites. DeepWiki section ids are title slugs (`1-react-repository-overview`);
Devin section ids are numeric (`5.2`) — that numeric form is kept as-is.

## Changes

| File | Change |
|---|---|
| `src/shared/wikiUrl.ts` | `WikiSource = "deepwiki" \| "devin"` + `wikiSourceFromUrl(url)` (Devin host → `"devin"`, else `"deepwiki"`). |
| `src/shared/types.ts` | `WikiPage.source: "deepwiki-wiki" \| "devin-wiki"`. |
| `src/storage/pageRepository.ts` | `buildWikiPageId` namespaces Devin (`wiki:devin:<owner>/<repo>/…`); DeepWiki stays unprefixed (`wiki:<owner>/<repo>/…`) for back-compat. `upsertWikiPage` stamps `source` from the URL. |
| `src/shared/utils.ts` | `buildWikiPageMarkdownFilename` prefixes the source label. |

## Resulting names

- **DeepWiki** id `wiki:facebook/react/1-react-repository-overview`
  → file `wikeep-deepwiki-facebook-react-1-react-repository-overview-2026-06-17.md`
- **Devin** id `wiki:devin:drunkod/nix-config-1/5.2`
  → file `wikeep-devin-drunkod-nix-config-1-5.2-2026-06-17.md`
- Full wikis: `…/__full-wiki` → `wikeep-{source}-{owner}-{repo}-__full-wiki-{date}.md`

## Why namespace the id, not just the filename

`buildWikiPageId` keys IndexedDB. Without a source prefix, a DeepWiki repo and a
Devin repo sharing `owner/repo` would overwrite each other. URL lookups use the
`by-url` index (full URL), so prefixing the id is safe and doesn't change
freshness/state matching. Existing DeepWiki ids are unchanged.

## Title parsing (copy-anchor artifact)

Devin headings embed a "copy link" `<button>`, so `h1.textContent` came out as
`"Getting Started & SetupLink copied!"` / `"OverviewLink copied!"`. Fixed in
`extractTitle` (`deepwikiWikiParser.ts`):

1. Prefer the **first Markdown heading** from the fiber/RSC source
   (`firstMarkdownHeading`) — cleanest, authoritative.
2. DOM fallback `cleanHeadingText` clones the `<h1>`, removes
   `a, button, svg, [role='button'], [aria-hidden='true']`, then strips a
   trailing `Link copied!` / `copied!` remnant.

Verified live: raw `"Getting Started & SetupLink copied!"` → `"Getting Started & Setup"`.

## Filename now includes the Devin page title

Because Devin section ids are bare numbers, `buildWikiPageMarkdownFilename`
inserts the (cleaned) title for Devin pages:

```
wikeep-devin-drunkod_nix-config-1-Getting Started & Setup-1.1-2026-06-17.md
wikeep-devin-drunkod_nix-config-1-Overview-1-2026-06-17.md
```

(`/` in `owner/repo` is sanitized to `_`.) DeepWiki filenames are unchanged
since their section slug already carries the title. Full-wiki exports omit the
per-page title.

## Note

Devin's numeric `sectionPath` already comes from `parseDevinSectionPath`, which
strips any `-slug` suffix (`#5.2-foo` → `5.2`). No change needed there.
