# Fork hosting handoff: Gemini + Snowflake

Paarth has authorized Ishaan's agent to integrate, push and deploy these changes. Branch: `dev3-ai-integration`. Include the website AI repair (`d26b195`), Snowflake grounding (`935084b`), and live connection documentation (`f5dd091`), along with the two-VIN/six-case demo commits already in this branch. Merge into the current integration branch; do not restore discarded audit ancestry or force-push shared history.

## Verified locally

- `FORK.VEHICLES.VEHICLE_KNOWLEDGE` contains the Camry and RAV4 public demo documents.
- A dedicated `FORK_APP` service user has only the `FORK_READ` application role (plus standard PUBLIC access). `FORK_READ` has warehouse/database/schema USAGE and table SELECT; no application writes are needed.
- The real SQL API and actual `retrieveVehicleKnowledge` adapter both retrieved two validated records. The real explanation pipeline reported `source: snowflake`, `status: ready`.
- The Gemini generation in that combined check timed out and used the deterministic fallback. Snowflake success does not prove live Gemini success.
- The current app token expires within seven days. Rotate it privately before expiry.
- AI/adapter tests: 310 passed; TypeScript, lint and production build passed for the code commit. A prior full-repo run found one old UI test expecting next summer to be rejected; Ishaan owns the UI test update. Do not claim the full suite green without re-running it.

## Hosting environment

Open the existing Vercel project serving `fork-hacktx.vercel.app`, Settings > Environment Variables. Add these to Production and to the specific integration Preview environment used for verification:

```env
SNOWFLAKE_ACCOUNT=UGWPJAS-WZ85322
SNOWFLAKE_DATABASE=FORK
SNOWFLAKE_SCHEMA=VEHICLES
SNOWFLAKE_WAREHOUSE=SNOWFLAKE_LEARNING_WH
SNOWFLAKE_ROLE=FORK_READ
SNOWFLAKE_TABLE=VEHICLE_KNOWLEDGE
SNOWFLAKE_TOKEN_TYPE=PROGRAMMATIC_ACCESS_TOKEN
GEMINI_MODEL=gemini-3.1-flash-lite
```

Required private settings: `SNOWFLAKE_TOKEN` (new FORK_APP token, not the old personal token), and `GEMINI_API_KEY`. Preserve valid existing provider settings unless checking them identifies a problem. Optional `GEMINI_REQUESTS_PER_MINUTE` configures the per-process request gate.

Secrets remain only in Paarth's ignored local `.env.local` or an authorized secret store. They were not transmitted through Coordigent or committed. If the deployment agent has no authorized access to them, prepare all other settings, then have Paarth or the Vercel project owner paste them directly into the Vercel fields. Do not request secrets in chat, commit an env file, publish a secret-bearing artifact, or log command arguments containing secrets.

The app's user-scoped PAT-only policy removes the requirement to have an IP allowlist while continuing to enforce any network policy assigned later. It requires role-restricted tokens and caps expiry at seven days. This policy is applied only to FORK_APP; personal login policies were not changed. Do not add a universal allow-all account network policy to work around authentication errors.

## Integration and release

1. Fetch and merge `origin/dev3-ai-integration` into the current agreed integration branch. Preserve concurrent UI work. Resolve lane conflicts with the responsible agent. No UI edits were made by Paarth; the requests are in `docs/polish/paarth.md`.
2. Update the stale next-summer UI assertion to expect an inferred, confirm-gated representative season month with its assumption shown. Display retrieval source independently from model availability.
3. Run `npm ci`, `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Fix relevant failures before release. Push the integration commit using the existing team release process.
4. Deploy a Preview containing the merge and the environment settings. Changing env variables requires a new deployment. Existing deployments retain old values.
5. With both demo VINs, complete input > proposal > confirmation > branch > comparison > Why. Inspect `/api/explain`: require `x-fork-data-source: snowflake`, `x-fork-data-status: ready`. Separately require `x-fork-ai-status: ready`, `usedFallback: false`, `aiAvailable: true` to prove Gemini generation. No invented numbers, false exact match, or unlabeled synthetic data.
6. Verify `/api/interpret` on daily mileage, pregnancy/season, job commute, and all six demo cases. Check partial-warning/assumption rendering and stale-response protection.
7. Test missing-key and provider failure in Preview only: return clean fallback, preserve computed verdict, and show honest status. Restore Preview settings afterward; do not remove production keys to run failure tests.
8. If Gemini still fails, inspect safe provider status/quota/model configuration and report the exact classified cause without dumping credentials. Do not present deterministic fallback as live AI.
9. Release through the agreed production branch and Vercel process, then repeat the live checks on `https://fork-hacktx.vercel.app/`. Report deployed commit SHA, URL, test summary, and separate Snowflake/Gemini status to Paarth's agent.

New file: `ai/SNOWFLAKE-DEPLOY.md`. Documentation only; no exported functions. Runtime exports and test commands are listed in `data/snowflake/README.md`.
