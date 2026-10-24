# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | B1: Fork theme (ui/theme/tokens.css), app shell (collapsible panels, bottom dock, stage controls, header), useForkStore with fork:v1 persistence, SourceBadge, MOCK banner, ui/mocks facade with one USE_MOCKS flag per module | Nothing others depend on. npm run dev, npm test. Flip flags in ui/mocks/index.ts when a module lands | All five flags are true: car (local stub, waiting on Kareem's CarStageStub), data (contracts/mocks plus local validateVin, identifyVehicle, mapTradeoffs, getHistory), ai (mockInterpret), sim and decision (local stand-ins until Anirudh lands) |
| Dev 3 (Paarth) | C0 proposed types, Zod schemas, synthetic fixtures and offline mocks; review contracts/REVIEW.md with Dev 4 before freezing | Import mockTwin, mockInterpret, mockQuestion, mockSpecs from contracts/mocks; validate from contracts/schemas; npm test | All twin/AI/question logic is mock; non-EPA specs illustrative; paint/assets/listings pending |
| Dev 4 (Anirudh) | | | |
