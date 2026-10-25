# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | B1: Fork theme (ui/theme/tokens.css), app shell (collapsible panels, bottom dock, stage controls, header), useForkStore with fork:v1 persistence, SourceBadge, MOCK banner, ui/mocks facade with one USE_MOCKS flag per module | Nothing others depend on. npm run dev, npm test. Flip flags in ui/mocks/index.ts when a module lands | All five flags are true: car (local stub, waiting on Kareem's CarStageStub), data (contracts/mocks plus local validateVin, identifyVehicle, mapTradeoffs, getHistory), ai (mockInterpret), sim and decision (local stand-ins until Anirudh lands) |
| Dev 3 (Paarth) | First live Gemini diagnostic: all 20 cases attempted, latest 15 match and five require revalidation after service errors; future-date grounding/query handling fixed with captured regressions; see ai/LIVE-EVALUATION.md | Existing interpret/explain signatures; model tested gemini-3.1-flash-lite; npm test | Five live cases remain unverified; no 20/20 claim; preserve manual mode/confirmation; demo preset UI wiring and assets remain integration work |
| Dev 4 (Anirudh) | S0-S9 complete; demo story A pinned (decision/__tests__/demoStory.test.ts: inconclusive, 14,434 mi/yr, keep below); sim/DEMO.md; docs/PITCH.md drafted | sim/index.ts, decision/index.ts; wiring guide in sim/README.md; npx vitest run sim decision | Nothing mocked on the Dev 4 side. UI still on USE_MOCKS for sim/decision (review sent to Ishaan). INTERFACES.md nextAction 4th arg: Paarth OK, awaiting Ishaan, Paarth applies |
