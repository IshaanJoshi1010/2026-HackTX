# Handoff

End each working stretch with three lines per developer: what was built, what to call, what is still mock.

| Developer | Built | How to call | Still mock |
| --- | --- | --- | --- |
| Dev 1 (Kareem) | | | |
| Dev 2 (Ishaan) | | | |
| Dev 3 (Paarth) | C0-C5/C7 plus C8a strict extraction schema, pure dates, proposed-only mapper and 20-case offline corpus/harness; see ai/C8A-HANDOFF.md | ExtractionSchema from ai/schema; mapExtraction from ai/mapper; resolveEventMonth from ai/dates; runExtractionCases from ai/testHarness; existing data exports unchanged; npm test | Fake extractor only; real model accuracy untested; C8b Gemini/routes/explanation guard and C6 providers pending; data synthetic/estimated; assets/fit unverified |
| Dev 4 (Anirudh) | | | |
