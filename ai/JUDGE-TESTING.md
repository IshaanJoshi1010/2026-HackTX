# Judge adversarial test pass

This pass adds reproducible break attempts in the data, AI and API lane. No UI, simulation, decision or dealer implementation was edited. The branch was fast-forwarded to merged main e4e386a before integration checks, retaining the teammates' existing implementation.

## Run it

Focused adversarial suite:

```sh
npm test -- ai/judge-adversarial.test.ts data/judge-adversarial.test.ts app/api/judge-adversarial.test.ts --maxWorkers=2
```

Full integrated suite: `npm test -- --maxWorkers=2`. Also run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

All provider responses in the new API/concurrency tests are mocked. The tests do not call Google, spend API quota, or perform production load testing. Existing last-live results remain in FULL-LIVE-RUN.md; they are not superseded by mock tests.

## What is challenged

- Curly and modifier apostrophes in negative statements, invisible Unicode formatting, and fullwidth/Arabic question marks. These must not become definite changes. Quotes remain exact user text; normalization is used only for classification.
- Contradictory mileage, independent event timing, unsupported seasonal timing, negative dates, oversized dumps, and repeated identical submissions. Draft output is deterministic and does not mutate input state.
- Malformed JSON, extra keys, invented values, invented statuses, invalid intents, oversized model text and excessive extraction items. Invalid extraction gets at most one retry; a provider outage gets no retry loop. One untrusted item withholds the complete result rather than applying a partial answer.
- Unicode numerical claims, invisible separators, leading decimals, non-finite values, huge exponents and overflowing literal numbers. Supplied formatting remains allowed. Identifier separators in camry-2022-se do not turn the year into a negative amount; genuine negative monetary values remain signed.
- Invalid VIN types/characters/check digits; valid unknown VINs stay unsupported offline, with no network. No universal vehicle coverage is claimed.
- Unknown/profile pollution keys, unit mismatches, contradictory explicit household and finance values, huge numeric text and unsafe numeric magnitudes. One-way commute is never silently accepted as yearly driving. No half-built twin is returned on invalid odometer/provider data.
- Zero mileage, children, budget and fuel remain valid explicit inputs. Zero fuel can represent a user-entered free-fuel scenario; it must not be silently replaced with a default. Children cannot exceed an explicitly stated household size. Skipped financial fields do not create undefined or NaN assumptions.
- 500 seeded financial-input cases preserve finite values and original input, and all 27 priority-selection combinations preserve normalized, deterministic weights under reversed entry order.
- Missing, invalid, duplicate and mismatched API payloads, forged small Content-Length, oversized bodies, broken streams, malformed UTF-8, byte-split multibyte characters, and no-key fallback. Invalid requests do not call the mocked provider or return its key/error details.
- 10,000 immediate admission attempts admit at most two concurrent generations; 1,000 rolling-time attempts stay within ten starts/minute. A 50-request mixed interpret/explain route burst produces at most two concurrent mocked provider calls and valid responses/fallbacks. These are boundedness assertions, not requests-per-second benchmarks.

## Fixes made with the tests

- Normalized negation punctuation and question-mark detection without rewriting quotes.
- Strengthened numerical claim checking for Unicode, decimals, identifier signs and non-finite/overflow text.
- Added a documented engineering ceiling of 1,000,000,000 for user-supplied numeric profile/finance/event inputs and odometers, and 200 characters for numeric form text. These are overflow guards, not real-world estimates. Oversized values are rejected, never clamped. Canonical shared contracts remain unchanged.
- Added explicit unit and finance/household consistency checks, retained zero values, and removed unreachable provider-conflict checks from the synthetic fallback branch.
- Omitted explicitly undefined financial terms from draft assumptions.
- Capped extraction output at 64,000 characters, 32 items, and ten 500-character assumptions per item. Each quote remains limited to the 8,000-character prompt maximum.
- Replaced the body reader's retained-chunk array with a bounded growing byte buffer. Tiny chunks cannot create a retained object per byte. Existing request byte caps and cancellation behavior remain intact.

## Remaining scope and honest scalability claims

This is not proof that the app is unbreakable. UI/3D behavior, real browser memory and graphics performance, deployed multi-instance rate limits, provider availability, network-tail latency and the separate audit-fixes branch need their owners' integration/rehearsal checks. The generation gate is process-local: several server instances can collectively exceed one provider's quota, so shared edge/platform enforcement is required before claiming distributed quota protection. The in-memory gate stores at most ten recent admitted starts; denied requests are not queued.

The app still supports the two declared Toyota configurations and a five-year scenario window. Unsupported vehicles/times require clarification rather than invented results. Synthetic assumptions remain synthetic. AI interpretations remain proposed and need explicit confirmation. These tests do not justify calling illustrative prices, forecasts or physical car-seat fit verified facts.

Ishaan's audit-fixes work owns its separate date/offline-pattern fixes, service-gate/API-route changes, and priority tie-breaking audit. Merge and rerun the full suite after that branch; this pass does not claim to have completed those independent changes.

## Verified result

All 1,070 tests across 71 files pass on this branch, including 150 new adversarial test cases. Lint, standalone type checking and the production build pass. These counts exclude the individual iterations inside generated-input and admission tests. No public function signatures or shared contracts changed. New files are the three judge-adversarial.test.ts suites, this report, and data/inputLimits.ts.
