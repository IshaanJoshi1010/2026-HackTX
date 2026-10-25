# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | B1: Fork theme (ui/theme/tokens.css), app shell (collapsible panels, bottom dock, stage controls, header), useForkStore with fork:v1 persistence, SourceBadge, MOCK banner, ui/mocks facade with one USE_MOCKS flag per module | Nothing others depend on. npm run dev, npm test. Flip flags in ui/mocks/index.ts when a module lands | All five flags are true: car (local stub, waiting on Kareem's CarStageStub), data (contracts/mocks plus local validateVin, identifyVehicle, mapTradeoffs, getHistory), ai (mockInterpret), sim and decision (local stand-ins until Anirudh lands) |
| Dev 3 (Paarth) | Input grounding/date/negation hardening; shared safe offline parser; manual event and financial-term draft helpers; API body caps and Gemini quota/cooldown gate; contracts frozen with all approvals; UI requests in docs/polish/paarth.md | ai/INPUT-UPGRADES.md and ai/INTEGRATION.md; npm test; server-only GEMINI_API_KEY and GEMINI_MODEL=gemini-3.1-flash-lite | Ishaan integrates new helpers and stale-response guards; no UI edits here; last live run remains15/20 with five service errors; dealer lookup stays Ani-owned |
| Dev 4 (Anirudh) | S0-S7 complete plus the Dev 4 part of S9: black-box scenarios, 100-rerun determinism, import/purity scans, dollar provenance audit, sim/README.md (every export, offline guarantee, pitch disclosures) | See sim/README.md "How Dev 2 wires it". sim/index.ts and decision/index.ts. npx vitest run sim decision (116 tests) | Nothing mocked. officialLink always omitted (no verified links). Cross-team S9 items (Gemini key removed, AI confirm audit, /ai/README.md) belong to Dev 3 and the post-merge run |
