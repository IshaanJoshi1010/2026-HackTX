# Developer 3 Prompt Pack (Data and AI)

How to use: one fresh Claude session per prompt. The root `CLAUDE.md`, `/contracts/INTERFACES.md`, and `/data/CLAUDE.md` (also copied to `/ai`) should already be in the repo. Paste ONE prompt at a time. When a prompt says "paste summary," paste the end-of-session summary from the session it depends on.

Every prompt ends the same way: Claude prints files created, exported signatures, and the test command.

Signatures are frozen in `/contracts/INTERFACES.md`. If a prompt seems to disagree with that file, the file wins.

---

## D3-00 Kickoff (run once)

```
You are helping Developer 3 on Fork, a HackTX 2026 project. Read CLAUDE.md at the repo root, /contracts/INTERFACES.md, and /data/CLAUDE.md fully.

Confirm back in 10 lines or fewer:
1. The folders I own (/data, /ai, /app/api) and the ones I must not touch (/sim, /decision, /ui).
2. What a VIN does and does NOT give us.
3. The hard rules for the AI layer (what the model may and may not do).
4. My task order (C0 to C9), the hours I owe Developers 2 and 4, and the cut line.

Then wait. Do not write code yet.
```

---

## D3-C0 Contracts and fixtures (hour 0 to 1)

```
Task: create the frozen shared contract and fixtures for Fork.

Context: read CLAUDE.md. The TypeScript contract is in the root CLAUDE.md. Do not change any field. If something seems wrong, tell me and stop.

Build:
1. /contracts/index.ts with every type from the root file. Fill in the types referenced but not defined (HistoryRecord, FinanceState, AccountData, VehicleSignals, SuitabilityResult) with minimal sensible shapes and list them for me to review with Developer 4 before freezing.
2. A Zod schema for every type in /contracts/schemas.ts, plus a validate helper that returns a typed result or a readable error.
3. /data/fixtures with:
   - Alex's synthetic DriverProfile (Austin TX, 12,000 mi/yr, household 2, children 0, cargoNeed low, fuelPrice local average, financeType loan, priorities weights summing to 1). Every provenance entry is "synthetic".
   - A VehicleConfig for the 2022 Camry SE and the 2024 RAV4 Hybrid XLE with placeholder paint and matchStatus "representative" until the real listing data lands.
   - A synthetic FinanceState (loan balance, payment, term).
   - Your mocks in /contracts/mocks: mockTwin, mockInterpret, mockQuestion, mockSpecs (Developer 4 writes the sim and decision mocks).
4. Vitest tests: every fixture passes its Zod schema; priority weights sum to 1; provenance exists for every driver field.

Acceptance: repo compiles, tests pass, fixtures validate.
End with the summary and the list of contract questions for review.
```

---

## D3-C1 VIN validation and decode (hour 1 to 4)

```
Task: build VIN validation and decoding.

Context: read CLAUDE.md. Paste the P2-D0 summary. I own /data.

Build:
1. validateVin(vin): 17 characters, letters and digits only, no I, O, or Q. Optional check-digit validation behind a flag. Returns a typed result with a clear reason on failure.
2. identifyVehicle(vin): 
   a. If the VIN is in the registry (sample VINs and backups), return the full VehicleConfig immediately with NO network call.
   b. Otherwise call NHTSA vPIC DecodeVinValues with a 3 second timeout, map results into a VehicleConfig, set matchStatus to "representative" or "unsupported", and tag each field's source.
   c. If the network fails, return what we can with an explicit "decode unavailable" state. Never invent fields.
3. Merge helper that fills mpg, seats, cargoCuFt, and msrp from the spec sheet by model, year, and trim when available, tagged with sources.
4. A mock fetch layer so tests run offline.

Rules: an invalid VIN never creates a twin. A VIN does not tell us paint, mileage, or history, so those fields stay empty or come from the registry or user confirmation.

Tests: valid and invalid VIN cases (including I, O, Q, length), registry hit with network disabled, NHTSA success with mocked response, NHTSA timeout, unsupported model.
End with the summary.
```

---

## D3-C2 Registry and match status (hour 3 to 6)

```
Task: build the supported vehicle registry and honest match logic.

Context: read CLAUDE.md. Paste the P2-D1 summary. I will give you the real listing data (VIN, trim, paint name and code, mileage, price) for the 2022 Camry SE and 2024 RAV4 Hybrid XLE, plus one backup VIN each, and the asset filenames and paint hex from Developer 1's manifest.json. If something is missing, use a clearly marked TODO and keep the status "representative".

Build:
1. /data/registry.ts with entries: vin, make, model, year, trim, powertrain, paint, paintCode, mpg, seats, cargoCuFt, msrp, modelAsset, matchStatus, specSources, plus listingSnapshot (date captured and fields) so provenance reads "listing".
2. matchStatus(config, asset) returning exact only if model, year, trim, paint, and geometry are ALL verified (take explicit booleans from the registry entry). Otherwise representative or unsupported.
3. The unsupported-VIN path: decoded specs plus a function that accepts a user-confirmed paint swatch and returns a representative config.
4. A JSON schema for listing snapshots so we can add backup VINs quickly.

Tests: both sample VINs resolve to exact only when all verification flags are true; flipping any flag downgrades to representative; unsupported VIN never returns exact.
End with the summary.
```

---

## D3-C3 Spec sheet and life-stage data (hour 3 to 6, real SpecSheets to Developer 4 at hour 6)

```
Task: build the Toyota spec sheet and maintenance data used by the simulation and suitability engines.

Context: read CLAUDE.md. Paste the P2-D2 summary. Every number needs a source label and a source string. If you cannot verify a value from a source I give you, mark it "illustrative" or "needs verification". Do not invent specs.

Build /data/specs.ts for the 2022 Camry SE and 2024 RAV4 Hybrid XLE with:
- Seats, rear seat dimensions if available, cargo volume (cu ft), curb weight
- MPG city, highway, combined, and powertrain
- MSRP
- Scheduled maintenance milestones by mileage (for example every 5,000 miles oil/tire rotation, larger services at 30k, 60k, 90k), each with an illustrative cost labeled "illustrative"
- Depreciation assumptions (annual percent curve and mileage adjustment) labeled "illustrative"
- Official Toyota resource links, ONLY ones I confirm are real
- Car seat compatibility and packing fit flags set to "needs verification" unless I provide data

Also export a requiredFields list the Developer 4 sim and suitability engines depend on.
Tests: every numeric field has a source label; no field is missing for either car.
End with the summary.
```

---

## D3-C4 Ownership history (hour 6 to 8)

```
Task: build the demo ownership history.

Context: read CLAUDE.md. Everything here is fictional and must be labeled "synthetic".

Build /data/history.ts and getHistory(vehicleId): HistoryRecord[] with:
- Odometer readings over time consistent with 48,000 miles and 12,000 mi/yr for the Camry
- Routine maintenance (oil changes, tire rotations) at plausible mileage
- Previous service events
- Ownership milestones (purchase, first service)
Each record: date, type, description, mileage, source "synthetic", provenance note.

Rules: never invent anything presented as real. Keep historical facts separate from simulated events. The most recent odometer reading must equal the twin's current mileage.
Tests: dates ascending, mileage non-decreasing, all records labeled synthetic, last reading matches twin mileage.
End with the summary.
```

---

## D3-C5 Normalizer, defaults, gap check, trade-off mapping (hour 8 to 11)

```
Task: build the onboarding data logic.

Context: read CLAUDE.md. Paste the P2-D3 summary (fields) and any Developer 4 note on required fields. I own /data. The UI will ask at most ONE question at a time, only if it changes a visible number.

Build:
1. normalizeProfile(raw): turns loose structured input like { commute: "30 miles each way, 4 days" } or already-extracted fields into a clean DriverProfile with provenance per field. Compute commute-based annual miles (miles each way * 2 * days * 52) and add a labeled estimate for non-commute driving. Reject nonsense values with a typed error.
2. /data/defaults.ts implementing the defaults table from /data/CLAUDE.md and /ai/CLAUDE.md: each field's default, source label (estimated or illustrative), and "upgradeQuestion" text.
3. applyDefaults(profile): fills only missing fields and tags them "estimated" or "illustrative".
4. gapCheck(profile): returns { missing: [], questionToAsk: field | null } where questionToAsk is the single highest-impact missing field, chosen deterministically, and null if every visible number is already backed. Never ask about a field that does not change any output.
5. mapTradeoffs(picks): deterministic map from A vs B picks (cost vs cargo, longevity vs fuel, etc.) to weights for cost, family, longevity, fuel, comfort. Weights always sum to 1. Same picks give the same weights.
6. mergeContradiction(existing, incoming): returns { newValue, oldValue, needsConfirm: true } so the UI can show the change.
7. Finance rules: paid_off needs no more questions; loan asks payment else estimates from price, age, typical term, labeled "estimated"; lease asks payment and end date, same fallback; unknown estimates and flags the next action as "get a payoff quote".

Tests: 10 messy inputs ("30 miles each way, 4 days", "like 20k a year", "no idea"); defaults only fill missing fields; gapCheck never returns a field that has no impact; mapTradeoffs sums to 1 and is deterministic; skipping every optional question still produces a valid profile.
End with the summary.
```

---

## D3-C8a Extraction schema and test dumps (hour 8 to 11, DO THIS FIRST)

```
Task: design the AI extraction schema and a test set BEFORE writing any model calls.

Context: read CLAUDE.md. The pipeline is: user dump, AI extracts fixed slots, Zod validates, proposals go to draftChanges as "proposed", UI confirms. The model never calculates and never writes to the profile.

Build in /ai:
1. A Zod schema for the model's structured output: { intent: CREATE_SCENARIO | COMPARE_SCENARIOS | EXPLAIN_RESULT | RECOMMEND_ACTION | FIND_BREAK_EVEN | CLARIFY, items: [{ field, value, certainty: clear|inferred|vague, quote, month?, assumptions[] }], clarifyingQuestion?: { field, question, options[] including "I'm not sure" }, unsupported?: reason }.
2. A mapper from items to LifeEvent[] (status "proposed") and to DriverProfile patches. Months are relative to today (for example "next year" is month 12; "in 2029" is computed from the current year). Put the date logic in one pure helper.
3. A file of 20 messy test dumps with the expected extraction for each, including: the demo sentence ("I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029"); a contradiction ("I drive like 20k a year, well maybe 15"); vague timing ("in a couple years"); a vague commute ("commute is gonna be way longer"); an inferred item ("wife's pregnant" means +1 child, flag as inferred); several events in one sentence; an unsupported question ("will my transmission fail?"); a message with no useful data ("hi"); casual shorthand; a budget mention only; and a pure question about the RAV4.
4. A test harness that runs each dump through a function (real or fake) and diffs against the expected structure.

Rules: if the user did not say it, no item is created for it. Vague items carry no invented value. Unsupported requests set "unsupported" and create no events.
Tests: the mapper and date helper are fully unit tested with no model needed.
End with the summary.
```

---

## D3-C8b Gemini route, interpret, explain (hour 11 to 14)

```
Task: build the Gemini integration.

Context: read CLAUDE.md. Paste the P3-S8a summary. The API key must stay server-side (Next.js route handler, env var, never sent to the client, never committed).

Build:
1. /app/api/interpret route and interpret(prompt, context): sends the dump plus MINIMAL context (vehicle model, year, current relevant profile fields, existing event summaries; no unnecessary personal details) to Gemini with structured JSON output. Validate with the S8a Zod schema. On validation failure retry once, then return a CLARIFY result. On network or key failure return { aiAvailable: false } so the UI uses manual forms.
2. Restrict actions to the defined intents. No code execution. AI output can never modify historical records or confirmed data.
3. One-question rule: at most one clarifyingQuestion, only if the missing item changes a visible number (call your gapCheck), always including "I'm not sure."
4. explain(evaluation, results): the model receives the computed numbers and writes a plain explanation. It may NOT add numbers. Add a post-check that extracts every number from the model's text and rejects the output if any number is not present in the input data (allow harmless ones like list indexes and years that appear in the input). On rejection, fall back to a deterministic template explanation.
5. Unsupported questions get a clear, friendly refusal and no events.
6. Return-visit helper: given a confirmed profile, produce the one-question prompt ("Still commuting 4 days a week?" with Yes and Update).
7. A manual-form schema (field list and Zod) Developer 2 can render so the app works with no key.

Tests: run the 20 dumps with a mocked Gemini; garbage output falls back safely; missing key returns aiAvailable false; three phrasings of one scenario yield equivalent events (use the mock to simulate); explain rejects an invented number.
End with the summary and a short usage note for Developer 2.
```

---

## D3-C6 Connection layer (hour 14 to 18)

```
Task: build the connection provider layer.

Context: read CLAUDE.md. The ConnectionProvider interface is in the contract. Real Toyota Financial Services data is NOT assumed. Swapping providers must change data only, never UI code.

Build:
1. SyntheticProvider (default): getAccount() returns Alex's synthetic account (financeType, payment, balance, term or lease end) and getVehicleSignals() returns synthetic mileage and basic signals. Label everything "synthetic".
2. SimulatedSmartcarProvider: only if Toyota is supported by Smartcar's simulated vehicles for the signals we need. First write a short note on what Smartcar docs say about Toyota compatibility and which signals we can read. If incompatible or unclear, implement it as a clearly labeled simulation with the same shape and say so.
3. TFSProvider: a stub that throws a clear "not configured" error and documents the sandbox request process (api_services@toyota.com, requires approval, OAuth2). Leave it unimplemented.
4. A provider factory and a provider registry so the UI picks by config.
5. Mapping from provider output into the DriverProfile and FinanceState with source labels.

Tests: swapping SyntheticProvider for the simulated one changes the data and the labels but not the shape; TFSProvider fails cleanly.
End with the summary.
```

---

## D3-C7 Twin builder (hour 5 to 6, after C1 to C3)

```
Task: build buildTwin.

Context: read CLAUDE.md. Paste summaries from P2-D1 through P2-D6.

Build buildTwin(vehicle, input) that returns a validated VehicleTwin:
- vehicle: VehicleConfig from identifyVehicle or from model/year/trim pickers
- mileage: from input, provider signals, or listing snapshot (with source label)
- history: from getHistory for sample vehicles, otherwise empty with an explicit "no history available" state
- driver: normalizeProfile + applyDefaults
- finance: from the provider or defaults, labeled

Handle three paths: (1) sample VIN, (2) try-your-own VIN (decoded, representative or unsupported), (3) model/year/trim pickers. The output must pass the Zod schema before returning. Invalid input returns a typed error and never a half-built twin.

Tests: all three paths; invalid VIN yields no twin; twin passes Zod; unsupported VIN is never exact; offline works.
End with the summary and a one-paragraph integration note for Developer 2 on how to call it.
```

---

## D3-C9 Full test pass (hour 18 to 21)

```
Task: run the full Developer 3 test and audit pass.

Context: read CLAUDE.md. All D-workstreams are built.

Do:
1. Run all tests and fix failures in /data only.
2. Black-box checks: Camry sample VIN returns correct year, trim, color, asset; RAV4 sample VIN likewise; an invalid VIN produces no twin; a valid but unsupported VIN is labeled honestly; everything works with the network disabled.
3. Audit every field in both twins for a source label. List any missing.
4. Audit every number in /data/specs.ts for a source or an "illustrative" label.
5. Verify the registry snapshots still match the saved listing screenshots and JSON (list any mismatch).
6. Write /data/README.md documenting each export, its inputs and outputs, and the offline guarantee.

End with a pass/fail table and a list of anything still synthetic that the pitch should disclose.
```
