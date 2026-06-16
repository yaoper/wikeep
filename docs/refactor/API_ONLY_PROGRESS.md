# API-only refactor progress

This branch was advanced through the GitHub API without local clone access or CI.

## Landed

- Step 0 hygiene: logger, background debug cleanup, RSC header constant.
- Step 1 characterization tests: background router and side panel smoke coverage.
- Step 2 message contract: `CommandMap`, derived `RuntimeCommand`, `PayloadOf`, `ResultOf`.
- Step 3 background split: listener entrypoint, router, and domain handlers.
- Step 4 groundwork: status helpers, icons, typed `send()` wrapper, status tests, `SettingsView`.
- Step 5 groundwork: conversation mapper, mapper tests, RSC multi-byte test, content `probe.ts`, content `observer.ts`.

## Still manual / not fully wired

- `SidePanelApp.tsx` still needs to import and use the extracted status helpers, icons, views, and future hooks.
- `src/content/index.ts` still needs to delegate wiki snapshot/fingerprint wiring to `probe.ts` and `observer.ts`.
- The remaining SidePanel shell split should be done in very small commits.
- Final typecheck, tests, build, and manual Chrome verification still need to run locally or in CI.
