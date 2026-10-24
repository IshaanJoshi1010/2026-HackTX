# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | | | |
| Dev 3 (Paarth) | C0-C5 plus C7; deterministic normalization/defaults/gap checks/tradeoffs/finance now wired into twin; see data/C5-HANDOFF.md | normalizeProfile/normalizeOnboarding from data/normalize; applyDefaults from data/defaults; gapCheck, mapTradeoffs, resolveFinance from their data modules; buildTwin from data/twin; npm test | Listings/history synthetic; finance estimated or synthetic; C8a extraction/20-dump harness and C6 providers pending; assets/fit unverified; contract review pending |
| Dev 4 (Anirudh) | S0 mocks; S1 simulate and applyEvents; S2 replacement economics; S3 fork/move/edit/delete/makeReplaceScenario (Gate 1); S4 assessSuitability (now on every ProjectionPoint); S5 evaluate with hard constraints, weighted scores and per-factor contributions; see sim/ECONOMICS.md | sim/index.ts: simulate, fork, makeReplaceScenario, moveEvent/editEvent/deleteEvent, canEditEvent. decision/index.ts: evaluate({ twin, scenarios, results, priorities, maxMonthlyBudget? }), evaluateDetailed (scores and contributions for charts), assessSuitability. npx vitest run sim decision | findBreakEven, sensitivity, nextAction still mocks (contracts/mocks/sim); evaluate returns sensitivity [] and a provisional nextAction until S6/S7 |
