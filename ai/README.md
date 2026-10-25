# Fork AI modules

AI extracts quoted user facts and explains supplied deterministic results. It does not calculate a cost, verdict, threshold, confidence percentage, or apply a proposal. Only the UI's explicit confirmation may apply changes.

See [INTEGRATION.md](./INTEGRATION.md) for exact server/client calls, both API routes and hosting variables. [POST-MERGE-CHECKS.md](./POST-MERGE-CHECKS.md) records the current merged checks and live three-phrasing evidence. [LIVE-EVALUATION.md](./LIVE-EVALUATION.md) preserves the earlier 20-case diagnostic limits.

Exports: interpret(prompt: string, context: InterpretContext): Promise<InterpretResult>; explain(evaluation: DecisionEvaluation, results: SimulationResult[]): Promise<{ text: string; usedFallback: boolean }>. createInterpreter and createExplainer accept optional injected generators for tests. numberCheck(text: string, input: unknown) returns { ok: boolean; invented: number[] }.

Missing key/network returns aiAvailable false for interpretation; explanation returns deterministic text with usedFallback true. The explanation HTTP route additionally reports aiAvailable false when the key is absent. Quotes are constrained to actual prompt text; model values still pass the mapper and date/value validation. One invalid-output retry is allowed, then CLARIFY without actions. Unknown facts stay unknown or receive explicit labeled defaults in the data layer.

Local secrets stay in ignored .env.local. Hosting variables: GEMINI_API_KEY (secret, server-only) and GEMINI_MODEL (tested gemini-3.1-flash-lite). Model choice does not prove free-tier eligibility or reliability. No new key provisioning, billing or subscription changes are made here.

Tests: npm test. Build checks: npx tsc --noEmit, npm run lint, npm run build. Unit/model-mock tests never require a key. Live tests use only synthetic authored prompts and must be reported separately from mocked equivalence.
