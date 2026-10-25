# Live Gemini repair, 2026-10-24

Two independent failures were verified.

1. Production at https://fork-hacktx.vercel.app returned HTTP 200 with aiAvailable false for a valid synthetic demo request. Ishaan's agent explicitly confirmed that production was deliberately key-unset while testing offline behavior. The deployment owner must add GEMINI_API_KEY and GEMINI_MODEL as server-only Vercel environment variables and redeploy. Never copy a key into a message, commit or NEXT_PUBLIC variable.
2. The bounded JSON schema introduced in the adversarial hardening pass validated in local mocks but was rejected by the real Gemini provider. On gemini-3.5-flash-lite, a plaintext request succeeded while the structured demo returned HTTP 400. Removing only minLength/maxLength/minItems/maxItems from the provider wire schema made the same demo succeed in one generation, with all three correct proposed events. This fixes provider grammar compatibility, not local validation.

## Change

`toProviderSchema(schema: Record<string, unknown>): Record<string, unknown>` in ai/providerSchema.ts makes a new transport schema without string/array length constraints. It preserves types, required keys, exact user-quote enums, object shape and additionalProperties. The original Zod schema still enforces the 8,000-character quote limit, 32-item count, assumption limits, numeric evidence, timing validation and the confirmation gate after generation. No public contracts or UI code changed. There is no automatic model switching or retry storm.

## Real-provider evidence

Synthetic demo: moving to Denver next year, 20,000 annual miles, second child in 2029. Session date 2026-10-24.

- gemini-3.5-flash-lite with adapted schema: one generation, 1.135 seconds, correct events at months 12, 0 and 32.
- Existing local gemini-3.1-flash-lite with adapted schema: two generations, 7.035 seconds, same correct events. Keep the tested configured model unless the deployment owner deliberately changes it.
- Through the actual local HTTP /api/interpret route after the fix: HTTP 200, aiAvailable true, correct relocation/mileage/family events, 4.81 seconds.
- Through actual local HTTP /api/explain using the synthetic Dev 4 fixture: HTTP 200, usedFallback false, nonempty AI prose, 3.30 seconds.

These are successful smoke calls, not a latency guarantee or a clean rerun of all historical live cases. Before the fix, an isolated plaintext3.1 call timed out and2.5-flash-lite returned404 despite appearing in model metadata; do not select a model based on listing alone. No API key, raw credential or private user input was logged.

## Regression checks

ai/providerSchema.test.ts proves transport conversion is immutable, preserves quote enums/property names, omits incompatible wire constraints on both attempts, and still rejects oversized extractions/quotes/assumptions locally. Existing adversarial and contract checks remain active.

Commands: `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

After the deployment owner adds server environment variables and redeploys the fixed source, verify the same valid demo through the deployed route and confirm aiAvailable true. A working local result must not be described as a verified production repair.

Verification after the repair: all 1,073 tests across 72 files pass, including the three new provider-schema regressions; lint, standalone type checking and the production build pass. No credentials or environment files are committed.
