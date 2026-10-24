# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | | | |
| Dev 3 (Paarth) | C0-C5 plus C7; deterministic normalization/defaults/gap checks/tradeoffs/finance now wired into twin; see data/C5-HANDOFF.md | normalizeProfile/normalizeOnboarding from data/normalize; applyDefaults from data/defaults; gapCheck, mapTradeoffs, resolveFinance from their data modules; buildTwin from data/twin; npm test | Listings/history synthetic; finance estimated or synthetic; C8a extraction/20-dump harness and C6 providers pending; assets/fit unverified; contract review pending |
| Dev 4 (Anirudh) | S0 mocks; S1 simulate and applyEvents; S2 replacement economics (trade-in, payoff, purchase, new loan); S3 fork, moveEvent, editEvent, deleteEvent, makeReplaceScenario (Gate 1); see sim/ECONOMICS.md | Everything from sim/index.ts: simulate(twin, scenario, ctx), fork(parent, month, events, name), makeReplaceScenario(parent, vehicle, month?), moveEvent/editEvent/deleteEvent, canEditEvent; ctx.vehicles must include the RAV4; pass a listing price as payload.price on the replacement event; npx vitest run sim | Suitability placeholder until S4; evaluate, findBreakEven, sensitivity, nextAction still mocks in contracts/mocks/sim |
