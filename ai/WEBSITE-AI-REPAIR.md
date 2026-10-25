# Website AI repair

Branch: dev3-ai-integration, based on the two clean demo commits through 9b4f345. No reverted audit history, UI implementation, simulation, decision or shared-contract edits were introduced here. Ishaan owns UI integration and deployment.

## Reproduced and fixed

The deployed browser rejected `im going to drive 100 miles a day next year in denver` with the generic no-change message. The local repaired website now proposes one inferred mileage change at month 12, confirms it into a real scenario branch, compares with the RAV4, and displays a computed explanation when live generation is unavailable. Driving in Denver does not establish a relocation.

Daily-unit conversion reads literal quoted miles/day and an optional explicit days/week schedule. Code calculates the annual estimate; the model's multiplied annual amount is ignored. The draft explains the 365-days/year or stated-days × 52-weeks/year assumption, remains inferred and requires confirmation. Unknown work schedules, short trips, negatives, contradictory rates and extreme values are not silently annualized.

Plain language now recognizes having/expecting/adding/welcoming a baby or child, rejects baby showers and unrelated expectations, and resolves an upcoming bare month with an explicit year assumption. A quoted job N miles away plus commute days/week is preserved as a linked change, with an inferred one-way-distance assumption. Seasons use representative US months (March, June, September, December), labeled inferred and correctable. No guessed date is presented as user-stated. Out-of-horizon and past dates remain unresolved.

A redundant childrenDelta alongside a total children count for the same quoted birth and resolved month is dropped. Distinct births at different dates remain separate. I am and I'm do not affect event semantics. Pure questions never create changes.

Schema/quote-scope failures get at most one retry. Semantic uncertainty does not repeat the same generation. Independent verified facts remain proposed alongside an unresolved-details message; linked facts are withheld together, so a commute distance cannot be applied now while its schedule is future-dated. An empty or invalid model answer can trigger the existing shared offline reader only when its supported clauses are covered; partial household/finance information does not silently disappear. Future-value clarifications do not use the current-profile answer path.

Retirement without driving/budget facts asks for those inputs; it never assumes the user stops driving.

## Latency, availability and configuration

Interpretation has one 10-second generation budget including validation retry. Explanation has a 7-second budget and returns deterministic computed text if generation fails, times out, or fails number/semantic validation. These budgets finish before the existing browser's 15-second request deadline, aside from network/cold-start overhead. AbortSignal is forwarded to the SDK when a browser request ends. This stops local waiting; Google may still bill for work already accepted remotely.

Default model is the live-tested gemini-3.1-flash-lite, preserving GEMINI_MODEL override. The prior unverified gemini-3.8-flash fallback was removed. Server-only hosting variables: GEMINI_API_KEY, optionally GEMINI_MODEL and GEMINI_REQUESTS_PER_MINUTE. Never put a key in a NEXT_PUBLIC variable or commit .env.local.

Per-process protection permits two active generations but only one background explanation. It limits explanations to four starts/minute and total starts to a configurable 20/minute by default, bounded to 1–60. Provider quotas still apply across server instances; this local guard is not a distributed quota guarantee. Low configured rates reserve capacity for interpretation by reducing explanation allowance.

Both API routes add `cache-control: no-store` and `x-fork-ai-status`:

- ready: verified response.
- busy: local limit or provider quota; Retry-After indicates the cooldown.
- timeout: request budget or provider deadline.
- cancelled: caller ended the request.
- unconfigured: no server key.
- provider-error: remote/network failure.
- invalid-response: empty, invalid or unsafe output; use the offline/computed path.

Frozen response contracts are unchanged. /api/explain additionally reports aiAvailable equal to !usedFallback, including failures with a configured key. Headers and messages never expose provider error bodies or credentials.

## UI handoff to Ishaan

Render every proposed event's assumptions BEFORE confirmation and provide correction for daily frequency/month estimates. The existing inferred badge alone is insufficient. Render unsupportedReason even when proposals are present: it is the existing field carrying a partial-result warning; no new shared note field was added. Retain the original input and offer retry/manual entry for failed or partial readings.

Read x-fork-ai-status and Retry-After to distinguish a busy request from an absent key. Preserve the existing stale-response guards. Do not apply a future AI clarification directly to today's confirmed profile. The current backend withholds that question path and asks the user to restate the future amount into a draft.

The UI-owned offlineReader test expecting next summer to produce no event needs updating to assert an inferred June 2027 proposal plus its explicit US-season assumption. The remaining future/past/out-of-horizon rejection checks must remain.

## Verification

`ai/fixtures/website-ai-live-check.json` records six actual local HTTP cases. Four returned ready/live Gemini proposals. Two provider/cooldown failures were recovered through the same shared offline reader the website uses. Every effective event matched the independently specified values and timing. These are finite smoke tests, not a guarantee of provider availability. The explanation route returned safe computed text and passed an independent numberCheck.

Actual browser: hosted failure reproduced, then local VIN → Camry → daily prompt → inferred draft → confirm → future branch → comparison → Why completed. UI assumptions still need Ishaan's rendering change. No deployment has been performed by this branch.

The six demo stories were rerun through the unchanged real engine: 54 scripted/nearby runs, all expected outcomes held in all nine fuel/depreciation checks. No demo outcome is selected by prompt matching.

Commands: `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. New targeted regressions are ai/daily-driving.test.ts, ai/plain-language.test.ts and ai/reliability.test.ts. Transport/header tests also live in ai/integration.test.ts.

New source files: ai/generationBudget.ts, ai/status.ts, data/drivingRate.ts, data/inputLimits.ts. New evidence: this guide and ai/fixtures/website-ai-live-check.json.

Exports: createGenerationBudget(generate: Generator, timeoutMs: number, parent?: AbortSignal), INTERPRET_BUDGET_MS, EXPLAIN_BUDGET_MS; AIUnavailable and AIRequestOptions/AIStatusInfo; deriveAnnualDriving(raw: string, evidence: string): AnnualDrivingEstimate | null; dailyMileagePattern; MAX_INPUT_NUMBER, MAX_NUMERIC_TEXT_LENGTH; pregnancyMention(quote: string): boolean; hasDateLanguage(text: string): boolean; hasOrphanTiming(text: string, quotes: string[]): boolean. Existing interpret/explain calls remain compatible, with optional internal request options for cancellation/status callbacks. Shared contracts were not edited.

Latest sealed checks: 291 AI tests across 10 files passed; TypeScript, lint and production build passed. The earlier full-repository run passed 1,050 tests and failed only the UI-owned assertion that next summer must be rejected. That assertion conflicts with the intentionally inferred seasonal-date feature and has been requested from Ishaan as a test-only update. No UI test was edited in this branch. The integration owner must align that assertion and rerun the complete suite before deployment.
