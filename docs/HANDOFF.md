# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | | | |
| Dev 3 (Paarth) | C0-C5 plus C7; deterministic normalization/defaults/gap checks/tradeoffs/finance now wired into twin; see data/C5-HANDOFF.md | normalizeProfile/normalizeOnboarding from data/normalize; applyDefaults from data/defaults; gapCheck, mapTradeoffs, resolveFinance from their data modules; buildTwin from data/twin; npm test | Listings/history synthetic; finance estimated or synthetic; C8a extraction/20-dump harness and C6 providers pending; assets/fit unverified; contract review pending |
| Dev 4 (Anirudh) | S0 sim mocks; S1 real simulate (mileage, fuel, maintenance, depreciation, insurance, loan/lease) and applyEvents; see sim/ECONOMICS.md | simulate(twin, scenario, ctx) and applyEvents(twin, scenario) from sim; mocks from contracts/mocks/sim; npx vitest run sim contracts/mocks | Vehicle replacement economics (S2), fork/move/edit/delete (S3), suitability placeholder until S4; evaluate, breakEven, sensitivity, nextAction still mocks |
