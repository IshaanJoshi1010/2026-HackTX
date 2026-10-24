# D3-C8a: extraction schema and offline proposal pipeline

Created ai/schema.ts, dates.ts, mapper.ts, testDumps.ts, testHarness.ts, extraction.test.ts and this handoff. Updated the Dev 3 handoff row. No shared contract changes, model calls, API keys, Gemini dependencies or routes.

## Exports

```ts
resolveEventMonth(phrase: string | undefined, todayISO: string, pregnancy?: boolean): EventTiming;
mapExtraction(input: unknown, context: InterpretContext, prompt: string): MappedExtraction;
runExtractionCases(extract: Extractor, cases?: readonly ExtractionCase[]): Promise<ExtractionCaseResult[]>;
createFixtureExtractor(cases?: readonly ExtractionCase[]): Extractor;
```

ExtractionSchema, ExtractionItemSchema, ExtractionQuestionSchema and ExtractionFieldSchema are Zod exports. Extraction, ExtractionItem and ExtractionField are the derived types. testDumps exports 20 fixture cases with expected structured output, mapped event summaries, patch fields and unresolved-item counts.

## Schema and timing

Output is `{ intent, items, clarifyingQuestion?, unsupported? }`. Items have a whitelisted field, value, certainty, verbatim quote, optional raw date phrase in month, and assumptions. Value is null for vague items and non-null for other certainties. Extra keys and unsupported-with-items outputs are rejected. A single optional question must include I'm not sure.

The extraction item's month is deliberately a raw quoted string, not a model-calculated offset. The shared LifeEvent.month stays a number. resolveEventMonth is pure and uses supplied todayISO (date only): next year = 12; in N years = 12N; in N months = N; next month = 1; now = 0. A bare year maps to June and marks timing inferred. Past/default-June and vague dates are unresolved. No date comes from the runtime clock. Pregnancy implies +1 child at month 9 with inferred certainty and an explicit confirmation assumption; negated or uncertain pregnancy wording is not accepted for that inference.

No timing means a month-0 proposal with a disclosed assumption, not a silently confirmed historical fact. This is a proposal convention the UI can change or reject at confirmation.

## Mapping and safeguards

mapExtraction parses the schema/context, checks that quotes are verbatim substrings of the original prompt, and requires a supplied date phrase to appear in that item's quote. Numeric values require matching numeric/ordinal evidence (including k shorthand), with the explicitly allowed pregnancy inference as the exception. C5 normalization validates profile-slot values. These checks cannot prove every sentence's semantics; human confirmation remains mandatory.

Items become LifeEvents only with source ai and status proposed. Future values never become present-profile patches. Month-0 profile patches are also proposals for the UI to confirm, never assignments into confirmedProfile. The mapper copies/reads context without mutating it. Read-only intents create no proposals or patches even if unexpected items are supplied. Unsupported requests always create none.

Simultaneous events group by type and resolved month. This keeps childrenDelta and an explicit householdSize in one family event so the sim does not infer an extra household increment. Conflicting values for the same field/resolved month are withheld, including aliases such as next year versus in 12 months. Unresolved fields remain available to the caller rather than receiving guessed values. Stable content-derived IDs make repeated mapping of the same extraction deterministic.

Payload keys were verified by reading origin/dev4-sim:sim/events.ts at 8181ea3 after a fetch; no simulation code was imported or merged. Supported mapped keys include annualMiles, commuteMilesOneWay, commuteDaysPerWeek, householdSize, children, carSeats, childrenDelta, fuelPricePerGal, monthlyBudget, cargoNeed, location and replacement vehicleId. Finance/payment/odometer slots use canonical profile patches at month 0 because they have no supported simulation payload equivalent; future versions remain unresolved.

A replacement name must explicitly identify the supported year/model/trim before code maps it to a registry ID. A bare RAV4 question never invents a replacement vehicle configuration. Current aliases are 2022 Camry SE and 2024 RAV4 Hybrid XLE. childrenDelta is limited to the explicit pregnancy +1 inference in this mapper; other changes use stated absolute counts until further rules are agreed.

## Shared contract limits

Location, vehicleId, childrenDelta and timing are not all canonical Question/ProfilePatch FieldKeys. They remain event fields or sidecar unresolved/clarification data. MappedExtraction has `{ result: InterpretResult, unresolved, clarification? }`; callers must preserve this sidecar when a timing/location clarification is needed. No new shared field was invented.

For canonical question fields, mapExtraction can carry the extraction's single chips question into InterpretResult. C8b must pass candidates through the C5 impact gate before displaying them; extraction questions alone are not permission to ask irrelevant questions. Do not show both sidecar and canonical questions. Numeric explanations and Gemini retry/fallback behavior belong to C8b.

## Twenty cases and evaluator

The corpus includes the demo sentence, contradiction, vague timing, vague commute, pregnancy inference, multiple events, unsupported diagnostics, greeting, shorthand, budget-only, pure RAV4 comparison, annual miles, commute slots, fuel price, child count, cargo, paid-off, finance payment, explicit replacement and break-even question.

runExtractionCases accepts a real or fake extractor function, validates each output and reports expected/actual/error per case. C8a uses createFixtureExtractor, an exact lookup of authored expected outputs. It is not an NLP parser or production fallback. Passing the fake checks the harness wiring; independent mapper/date/safeguard assertions test the actual transformation logic. Additional tests deliberately return changed/malformed/failed output so failures are observable. Real model extraction accuracy is untested until C8b.

## Validation and next step

npm test
npx tsc --noEmit
npx eslint ai/schema.ts ai/dates.ts ai/mapper.ts ai/testDumps.ts ai/testHarness.ts ai/extraction.test.ts
npm run build

Next: C8b Gemini integration, interpret/explain routes, one retry and safe fallback, manual-form path, and explanation number checking. Credentials must stay server-side; no credential setup occurred in C8a.
