# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | | | |
| Dev 3 (Paarth) | C0-C5 plus C7; deterministic normalization/defaults/gap checks/tradeoffs/finance now wired into twin; see data/C5-HANDOFF.md | normalizeProfile/normalizeOnboarding from data/normalize; applyDefaults from data/defaults; gapCheck, mapTradeoffs, resolveFinance from their data modules; buildTwin from data/twin; npm test | Listings/history synthetic; finance estimated or synthetic; C8a extraction/20-dump harness and C6 providers pending; assets/fit unverified; contract review pending |
| Dev 4 (Anirudh) | S0-S7 complete plus the Dev 4 part of S9: black-box scenarios, 100-rerun determinism, import/purity scans, dollar provenance audit, sim/README.md (every export, offline guarantee, pitch disclosures) | See sim/README.md "How Dev 2 wires it". sim/index.ts and decision/index.ts. npx vitest run sim decision (116 tests) | Nothing mocked. officialLink always omitted (no verified links). Cross-team S9 items (Gemini key removed, AI confirm audit, /ai/README.md) belong to Dev 3 and the post-merge run |
