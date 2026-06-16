# Wikeep Codebase Refactor — Index

Branch: `refactor/codebase-cleanup`

A step-by-step, **behavior-preserving** refactor. Each step is independently
shippable, has its own commit, and ends green
(`npm run typecheck && npm test`). Do the steps in order; 3 and 4 may run in
parallel once 0–2 land.

## Steps

| # | File | Focus | Risk |
| --- | --- | --- | --- |
| 0 | [step-00-hygiene.md](./step-00-hygiene.md) | Remove debug noise, add logger, fix RSC nits, formatting | Low |
| 1 | [step-01-characterization-tests.md](./step-01-characterization-tests.md) | Pin current behavior before big moves | Low |
| 2 | [step-02-message-contract.md](./step-02-message-contract.md) | Type-safe `CommandMap` for messages | Low |
| 3 | [step-03-background-split.md](./step-03-background-split.md) | Break up the 704-line service worker | High |
| 4 | [step-04-sidepanel-split.md](./step-04-sidepanel-split.md) | Break up the 1056-line `SidePanelApp` | High |
| 5 | [step-05-polish.md](./step-05-polish.md) | Repos, content script, parser docs/tests | Med |
| 6 | [step-06-verification.md](./step-06-verification.md) | Typecheck, test, manual Chrome pass | — |

## Baseline (branch point)

| File | LOC | Target |
| --- | --- | --- |
| `src/ui/sidepanel/SidePanelApp.tsx` | 1056 | < 200 |
| `src/background/index.ts` | 704 | < 120 |
| `src/storage/conversationRepository.ts` | 357 | split persistence/mapping |
| `src/parser/deepwikiRscSource.ts` | 289 | doc + multi-byte test |
| `src/content/index.ts` | 282 | split probe/messaging |

## Rules for every step

1. **No behavior change.** Refactor only.
2. **Green before commit:** `npm run typecheck && npm test`.
3. **One concern per commit.** Never mix a logic change with a move.
4. **Formatting churn is its own commit.**

## Sequencing

```
0 hygiene → 1 char-tests → 2 message-types
                                 │
                  ┌──────────────┴──────────────┐
                  ▼                              ▼
          3 background split            4 sidepanel split
                  └──────────────┬──────────────┘
                                 ▼
                       5 polish → 6 verify
```
