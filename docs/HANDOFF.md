# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | B1: Fork theme (ui/theme/tokens.css), app shell (collapsible panels, bottom dock, stage controls, header), useForkStore with fork:v1 persistence, SourceBadge, MOCK banner, ui/mocks facade with one USE_MOCKS flag per module | Nothing others depend on. npm run dev, npm test. Flip flags in ui/mocks/index.ts when a module lands | All five flags are true: car (local stub, waiting on Kareem's CarStageStub), data (contracts/mocks plus local validateVin, identifyVehicle, mapTradeoffs, getHistory), ai (mockInterpret), sim and decision (local stand-ins until Anirudh lands) |
| Dev 3 (Paarth) | Synced merged main; four synthetic snapshots verified/paint sent to Kareem; mileage provenance in real/mock twins; contracts review awaits Ishaan; source-grounded three-phrasing live equivalence across retries; no-key HTTP fallbacks pass; see ai/POST-MERGE-CHECKS.md | Exact calls in ai/INTEGRATION.md; npm test (633); hosting: server-only GEMINI_API_KEY plus GEMINI_MODEL=gemini-3.1-flash-lite | Contract freeze/nextAction doc edit pending Ishaan OK; UI real-module wiring and representative asset handoff owned by peers; retain manual mode, confirmation and synthetic disclosures |
| Dev 4 (Anirudh) | S0-S7 complete plus the Dev 4 part of S9: black-box scenarios, 100-rerun determinism, import/purity scans, dollar provenance audit, sim/README.md (every export, offline guarantee, pitch disclosures) | See sim/README.md "How Dev 2 wires it". sim/index.ts and decision/index.ts. npx vitest run sim decision (116 tests) | Nothing mocked. officialLink always omitted (no verified links). Cross-team S9 items (Gemini key removed, AI confirm audit, /ai/README.md) belong to Dev 3 and the post-merge run |
