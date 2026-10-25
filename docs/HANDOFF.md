# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | B6 done: data, sim, decision, AI and the real CarStage are wired, one flag at a time with the demo run after each. Demo story A runs end to end on the Future page (Close call, next step, break-even with reruns, Why) and matches sim/DEMO.md: $31,287 keep vs $35,862 replace, break-even 14,434 mi/yr. Works with no key and no network, manual form included. Layouts checked at four sizes. docs/DEMO_SCRIPT.md has the 90 second script. | Nothing others depend on. npm run dev, npm test (720 tests). The facade is ui/mocks/index.ts. | Nothing in the app is mocked. Tests keep a DOM stand-in for the 3D stage. Waiting on merges: Kareem dev1-3d (RAV4 manifest id, particle reveal, morph), Paarth 7524da7 (odometer source). Not built: assumptions editor, cost curves |
| Dev 3 (Paarth) | First live Gemini diagnostic: all 20 cases attempted, latest 15 match and five require revalidation after service errors; future-date grounding/query handling fixed with captured regressions; see ai/LIVE-EVALUATION.md | Existing interpret/explain signatures; model tested gemini-3.1-flash-lite; npm test | Five live cases remain unverified; no 20/20 claim; preserve manual mode/confirmation; demo preset UI wiring and assets remain integration work |
| Dev 4 (Anirudh) | S0-S7 complete plus the Dev 4 part of S9: black-box scenarios, 100-rerun determinism, import/purity scans, dollar provenance audit, sim/README.md (every export, offline guarantee, pitch disclosures) | See sim/README.md "How Dev 2 wires it". sim/index.ts and decision/index.ts. npx vitest run sim decision (116 tests) | Nothing mocked. officialLink always omitted (no verified links). Cross-team S9 items (Gemini key removed, AI confirm audit, /ai/README.md) belong to Dev 3 and the post-merge run |
