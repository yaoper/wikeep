# Step 7 — Build & live verification

## Build

```bash
nix develop --command npm run test     # all unit tests green (Step 6)
nix develop --command npm run build     # produces dist/
```

Load the unpacked extension from `dist/` in Chrome (`chrome://extensions` →
Developer mode → Load unpacked).

## Manual checklist

Open a Devin wiki page, e.g.:

```
https://app.devin.ai/org/<org-slug>/wiki/drunkod/nix-config-1?branch=master
```

- [ ] **Detection** — the side-panel shows the page as saveable (Save buttons
      enabled). Confirms `isWikiPageUrl` matches and `detected` fired.
- [ ] **Single page (latency)** — click *Save this page*. It should save
      effectively instantly (no ~2.5s pause), confirming the `waitForRscRaw`
      bypass.
- [ ] **Single page (content)** — saved record has the correct `h1` title,
      `markdownSource: "dom"`, body prose, and any diagrams as
      `data-wikeep-diagram` placeholders / mermaid.
- [ ] **Hash navigation** — navigate to `#1.2`, save again; the new record/section
      reflects the `#1.2` content and `sectionPath` is `1.2`.
- [ ] **Full wiki** — click *Save Full Wiki*. Watch the sidebar cycle through
      sections; on completion the original section is restored, and one
      `full-wiki` record is stored containing all sections joined by `---`.
- [ ] **Control exclusion** — the full-wiki markdown contains no "Settings",
      "Help", "Upgrade" etc. as sections.
- [ ] **DeepWiki regression** — repeat single + full save on a `deepwiki.com`
      page; behavior unchanged (still RSC-preferred).

## Optional DevTools-MCP spot check

If iterating on the settle heuristic, use the chrome-devtools tools to
`evaluate_script` against the live tab: click each outline button, log
`document.querySelector('.prose-main h1').innerText` and content length per tick
to tune `waitForSectionSettled`'s timing for diagram-heavy repos.
