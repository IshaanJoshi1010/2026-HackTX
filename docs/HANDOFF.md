# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | | | |
| Dev 3 (Paarth) | C0-C5 plus C7; deterministic normalization/defaults/gap checks/tradeoffs/finance now wired into twin; see data/C5-HANDOFF.md | normalizeProfile/normalizeOnboarding from data/normalize; applyDefaults from data/defaults; gapCheck, mapTradeoffs, resolveFinance from their data modules; buildTwin from data/twin; npm test | Listings/history synthetic; finance estimated or synthetic; C8a extraction/20-dump harness and C6 providers pending; assets/fit unverified; contract review pending |
| Dev 4 (Anirudh) | S0-S7 done: simulate, applyEvents, replacement economics, fork/move/edit/delete/makeReplaceScenario, assessSuitability, evaluate, findBreakEven (+ reproduceBreakEven, withParameter), sensitivity (+ withSensitivity), nextAction; see sim/ECONOMICS.md | sim/index.ts and decision/index.ts. Flow: simulate each scenario, evaluate(...) (nextAction already filled), findBreakEven({ twin, keep, replace, parameter, ctx, priorities }), sensitivity(...) then withSensitivity(e, s); nextAction(e, twin, be, results) to refresh the action with the break-even. npx vitest run sim decision | No sim mocks needed any more. officialLink always omitted (no verified links). S9 audit pending |
