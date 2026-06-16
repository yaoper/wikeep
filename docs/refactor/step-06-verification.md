# Step 6 — Final verification

**Goal:** confirm the refactor changed structure, not behavior.

## 6.1 Automated gates

```bash
npm run typecheck
npm test
npm run build        # scripts/build.mjs must produce a loadable extension
```

All three must pass. If `npm test` fails locally with a native rolldown/vitest
binding error, that's an environment/arch mismatch, not a code problem — run on a
matching platform or in CI.

## 6.2 Manual Chrome pass (integration gate)

There is no automated browser harness, so manually load the unpacked build
(`chrome://extensions` → Load unpacked → the build output) and verify each flow
behaves exactly as before:

- Save a single wiki page (`Save page`) → appears in history, badge/status updates.
- Save full wiki (`Save full wiki`) → all pages saved, Mermaid blocks preserved.
- History list loads, search/filter works.
- Export a conversation to markdown.
- Export backup, then Import backup → data round-trips.
- Settings toggles (auto-capture, auto-refresh) persist.
- Switch active tabs → context/status updates correctly.
- Refresh a saved wiki page → downgrade guard still prevents content loss.

## 6.3 Confirm the size targets

```bash
wc -l src/ui/sidepanel/SidePanelApp.tsx   # target < 200
wc -l src/background/index.ts             # target < 120
find src/background/handlers -name '*.ts' | xargs wc -l
find src/ui/hooks src/ui/sidepanel/views -name '*.ts*' | xargs wc -l
```

## 6.4 Optional: structure map

Use the graphify skill to regenerate the code graph and confirm the new module
boundaries (handlers, hooks, views, client) match this plan and there are no
unexpected cross-domain imports.

## Sign-off checklist

- [ ] typecheck, test, build all green
- [ ] manual Chrome pass complete, no behavior change observed
- [ ] `SidePanelApp.tsx` < 200 LOC, `background/index.ts` < 120 LOC
- [ ] no `chrome.runtime.sendMessage` calls inside components
- [ ] no `console.log`/`console.debug` in `src/`
- [ ] each commit is one concern and was green when committed
