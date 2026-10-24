# D3-C8b: server-side Gemini and safe manual fallback

## Created/updated

Created ai/gemini.ts, interpret.ts, explain.ts, numberCheck.ts, manualForms.ts, returnVisit.ts, prompts/system.ts, integration.test.ts, app/api/interpret/route.ts, app/api/explain/route.ts and this handoff. Updated data/gapCheck.ts for explicitly uncertain impact fields, .env.example with the public model name, package files with @google/genai/server-only, and the Dev 3 row. Shared contracts and UI/simulation modules are unchanged.

## Exports

```ts
interpret(prompt: string, context: InterpretContext): Promise<InterpretResult>;
createInterpreter(generate?: Generator): typeof interpret;
explain(evaluation: DecisionEvaluation, results: SimulationResult[]): Promise<{ text: string; usedFallback: boolean }>;
createExplainer(generate?: Generator): typeof explain;
numberCheck(text: string, input: unknown): { ok: boolean; invented: number[] };
extractNumbers(text: string): number[];
prepareManualDraft(input: unknown): ManualDraftResult;
returnVisitQuestion(profile: DriverProfile): { field: "commuteDaysPerWeek" | "annualMiles"; text: string; options: ["Yes", "Update"] };
```

ManualDraftResult is the inferred tagged result of prepareManualDraft: on success, profile, mileage and financeInput; on failure, an error. ManualProfileSchema/manualFields are client-safe exports from manualForms.ts. Generator and GenerationRequest are server-side dependency-injection types in gemini.ts. POST handlers exist at /api/interpret and /api/explain.

## Gemini implementation

Google's current docs were checked on 2026-10-24. The installed SDK is @google/genai 2.31.0. Code uses its documented models.generateContent interface with responseMimeType application/json and responseJsonSchema for interpretation. The default model is gemini-3.8-flash; GEMINI_MODEL overrides it.

References:
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://ai.google.dev/gemini-api/docs/get-started
- https://github.com/googleapis/js-genai

The SDK is configured with a 15-second request timeout and one transport attempt. Only validation/grounding failures trigger one explicit retry. System prompts treat user/model-context strings as data. No tools, function execution, generated code, profile writes or history mutations exist. interpret and explain plus the transport use the server-only marker; client UI must call routes rather than import them.

## Interpret and questions

POST /api/interpret takes `{ prompt, context }`. The prompt is bounded to 8,000 characters. Request/context are validated before generation. The transport sends vehicle model/year, at most 50 existing event type/month summaries, todayISO and only keyword-relevant profile slots. Location, VIN, provenance, accounts and history are omitted from context; text the user explicitly includes in the dump is still sent as the prompt. A greeting sends no profile slots.

JSON/schema and quote-grounding failures retry once; repeated failure returns a CLARIFY result with empty proposals/patches. Key/network failures return aiAvailable false. Vague slots remain empty, no scenario mutation occurs, and successful proposals retain status proposed. Unsupported output receives a deterministic friendly refusal and no events. Model questions are replaced with a canonical C5 gap-check question only if the ambiguous field is impact-eligible; options include I'm not sure. Greetings/pure queries do not generate generic onboarding questions.

The C5 gate now accepts explicit uncertainFields for annual mileage, fuel price, household size, children, car seats and mileage; these affect visible outputs even when the old profile has a backed value. Canonical gapCheck arguments/results still work. It returns one question. Do not simultaneously display another finance/model question.

Timing/location ambiguities still cannot be expressed by every canonical Question FieldKey. They return safe CLARIFY/empty actions rather than inventing a shared field or a time. A user may rephrase with an explicit supported date. The app should expose a general rephrase/manual-edit state for CLARIFY without a question. The optional extraction-sidecar question is not treated as permission to alter the frozen contract.

## Explain and number check

POST /api/explain takes `{ evaluation, results }`; results are schema validated and capped at 20 scenarios. The model receives the computed evaluation plus each summary, milestones, warnings and final projection point, not the entire monthly timeline or a driver/account object.

Generated prose must contain only numeric values present in that transmitted payload. The guard handles digits, grouping commas, k/m/b notation, exponents, signed values, common cardinal/ordinal words and simple fractions. Consecutive list indexes are treated as formatting. Compound spelled-out decimals/fractions are rejected conservatively rather than misread as separate permitted values. New numbers, empty/oversized responses, links, key or network failures all use a deterministic number-free fallback. Percent transformations are not silently authorized: 0.1 in input does not authorize 10 in prose. This checks numeric membership, not truthfulness of every possible semantic claim; UI still displays the deterministic engine results and source disclosures.

## Manual form and return visit

ManualProfileSchema accepts optional structured driver fields, tradeoffPicks, mileage and finance input. manualFields describes number/text/chips/tradeoff controls. UI omits skipped or I'm-not-sure values before validation. prepareManualDraft uses C5 normalization/defaults and returns a draft, not an applied profile. Mileage stays outside DriverProfile and finance fields in their sidecar. Confirmation remains required. returnVisitQuestion accepts an already confirmed profile, preferring commute days with Yes/Update; it never applies an update.

## Setup and verified limits

No GEMINI_API_KEY or GEMINI_MODEL was configured when inspected, and no secret was read into tool output or written. .env.example contains only an empty key and public model name. To enable live testing, put a user-owned Gemini key in ignored .env.local as GEMINI_API_KEY; never use NEXT_PUBLIC_ or commit it, and never paste it into chat. No credential was provisioned and no live Gemini request was made in C8b.

The integration is implemented and tested with an injected/mock generator. All 20 authored dumps were run through that mocked Gemini path; three phrasings produce equivalent events. This does not measure real Gemini extraction accuracy or establish this account's model access/quota. Missing-key/manual behavior is verified separately. The full demo must keep its manual/seeded path.

## Dev 2 usage

From client code, POST JSON to /api/interpret with the dump and minimal InterpretContext. On aiAvailable false, render manualFields and validate with ManualProfileSchema/prepareManualDraft. On success show only proposed changes in draftChanges; an explicit confirm action alone can update the profile/scenario. On CLARIFY with no question, offer rephrase/manual edit. POST already-computed evaluation/results to /api/explain and show its text; usedFallback indicates the deterministic explanation was used. Keep the simulation's numeric display and provenance authoritative. Do not render any return-visit or manual draft as an automatic update.

## Checks and remaining work

npm test
npx tsc --noEmit
npx eslint ai app/api data/gapCheck.ts
npm run build

Tests cover the 20 mocked dumps, one retry, malformed output/network failures/no key, minimal context, impact-gated questions, three equivalent phrasings, number hallucination/fallback, manual defaults/priorities, return visit and both route handlers. Next: C6 connection providers, then C9 audits. Live Gemini evaluation remains pending key configuration.

Local production HTTP smoke check (Gemini key explicitly disabled for the temporary server): POST /api/interpret returned 200 with aiAvailable false, POST /api/explain returned 200 with usedFallback true, and malformed interpret input returned 400. The temporary server was stopped after verification.
