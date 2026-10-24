# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | | | |
| Dev 3 (Paarth) | C0-C3 plus C7 validated twin orchestration, structured profile adapter and minimal synthetic odometer history; see data/C7-HANDOFF.md | buildTwin/buildTwinWithDetails from data/twin; getSpecs from data/specs; identifyVehicle from data/decode; npm test | Full C4 service history, C5 prose normalization/gap checks and C6 providers pending; finance defaults synthetic/illustrative; assets/fit unverified; shared-type review pending |
| Dev 4 (Anirudh) | S0 sim mocks; S1 real simulate (mileage, fuel, maintenance, depreciation, insurance, loan/lease) and applyEvents; see sim/ECONOMICS.md | simulate(twin, scenario, ctx) and applyEvents(twin, scenario) from sim; mocks from contracts/mocks/sim; npx vitest run sim contracts/mocks | Vehicle replacement economics (S2), fork/move/edit/delete (S3), suitability placeholder until S4; evaluate, breakEven, sensitivity, nextAction still mocks |
