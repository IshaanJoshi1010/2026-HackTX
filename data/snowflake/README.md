# Gemini answers, Snowflake vehicle facts

Gemini generates explanation prose. Snowflake stores the public vehicle knowledge documents and retrieves them by supported vehicle ID. TypeScript still calculates costs, scenarios and verdicts. The interpreter extracts only the user's quoted facts; database records must never become new user life events.

`POST /api/explain` now retrieves records for vehicle IDs appearing in the validated simulation results, then passes those records and computed results to Gemini. It preserves the existing request/response contract. No frontend changes are required for the Why explanation to use this data after deployment. This does not add an unrestricted chatbot or change the deterministic simulation's fixture inputs.

## Current connection state

No Snowflake settings were present when this integration was built. The adapter and seed are implemented, but no live Snowflake storage or retrieval has been verified. Until configured, `x-fork-data-source: local-fixture` and `x-fork-data-status: unconfigured` report the local path honestly. An outage or invalid result uses `local-fixture` / `unavailable`. Only validated database retrieval reports `snowflake` / `ready`. These headers identify retrieval, independently from `x-fork-ai-status` and `aiAvailable`.

## Connect an existing Snowflake account

1. Select the intended database and schema in Snowsight. Review and run `data/snowflake/seed.sql` there. It creates `VEHICLE_KNOWLEDGE` and merges the two validated public demo documents. Re-running updates those same records; do not run against a table with unrelated schema. If using a different table name, update the SQL to match your environment setting.
2. Configure an application role with USAGE on the selected warehouse/database/schema and SELECT on this table. The web app does not need CREATE, INSERT, UPDATE or ownership permissions. Use a separate authorized role for seeding. An admin must configure authentication and any required network policy; a token alone does not bypass those requirements.
3. Add these server-only settings to the ignored `.env.local` and the hosting provider's environment settings. Never paste tokens in chat or commit them. Use the organization-account identifier, without a URL or domain, for `SNOWFLAKE_ACCOUNT`.

```
SNOWFLAKE_ACCOUNT=yourorg-youraccount
SNOWFLAKE_TOKEN=<store privately>
SNOWFLAKE_TOKEN_TYPE=PROGRAMMATIC_ACCESS_TOKEN
SNOWFLAKE_DATABASE=FORK
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_WAREHOUSE=FORK_WH
SNOWFLAKE_ROLE=FORK_READ
SNOWFLAKE_TABLE=VEHICLE_KNOWLEDGE
GEMINI_API_KEY=<store privately>
GEMINI_MODEL=gemini-3.1-flash-lite
```

`SNOWFLAKE_TABLE` defaults to `VEHICLE_KNOWLEDGE`; token type defaults to `PROGRAMMATIC_ACCESS_TOKEN`. `OAUTH` is also supported, but this adapter does not renew expired OAuth tokens. All object identifiers must be ordinary unquoted SQL identifiers. Hosts using PrivateLink, non-.com domains, or legacy locator formats require a separately reviewed configuration extension.

4. Restart locally or redeploy after configuring the hosting environment. Run a normal comparison and request Why. Confirm response headers `x-fork-data-source: snowflake`, `x-fork-data-status: ready`, `x-fork-ai-status: ready` and response `usedFallback: false`. Verify both VIN starting paths. A successful Gemini response with `local-fixture` still does not prove Snowflake works. A missing Gemini key must still return a clean deterministic explanation.

## Data and safety boundaries

Only model identity, seats, cargo capacity, combined MPG and illustrative MSRP are stored. Each numeric field includes its source and reference. Identities remain synthetic and visual matches representative. Physical car-seat and packing fit remain unverified. No driver VIN, household, finance, account, API credential or chat history is seeded or stored.

The SQL is fixed, read-only and parameterized, and retrieves only the two supported IDs. Gemini never writes SQL. Result keys, identity, schema, row count, partitions and size are validated. Unknown IDs are not queried. The client cannot submit its own vehicle knowledge object. The model's numeric output is checked against supplied records and computed results; this is a numeric-membership safeguard, not proof every prose claim is true. The model must preserve source labels and the computed verdict.

The retrieval has a three-second network deadline and a two-second database statement timeout. Async SQL responses are polled within that deadline. Tokens never follow redirects or response-provided URLs. Concurrent lookups share one request per process; successful public records cache for sixty seconds and outages for five seconds. These caches are per process, not a distributed warehouse quota. At larger traffic volumes add shared caching/rate limits and warehouse monitoring. Cached reads may be up to sixty seconds old.

## Exports and verification

- `getLocalVehicleKnowledge(): VehicleKnowledge[]`
- `readSnowflakeConfig(env?: Record<string, string | undefined>): SnowflakeConfig | undefined`
- `createVehicleKnowledgeRepository(configure?, fetcher?, now?): (ids: readonly string[], signal?: AbortSignal) => Promise<VehicleKnowledgeResult>`
- `retrieveVehicleKnowledge(ids: readonly string[], signal?: AbortSignal): Promise<VehicleKnowledgeResult>`
- `buildVehicleKnowledgeSeedSql(): string`
- `createExplainer(generate?, retrieve?)`: existing callable signature, optional internal `ExplanationOptions.onKnowledge` callback; public `explain(evaluation, results)` unchanged.

Created files: this guide, `documents.ts`, `repository.ts`, `repository.test.ts`, `seed.ts`, `seed.sql`, all in `data/snowflake/`. Existing explanation, system prompt, API route and explanation tests updated. No UI or frozen contract edits.

Test command: `npm test -- ai data/snowflake --maxWorkers=2`. Also run `npx tsc --noEmit`, `npm run lint`, and `npm run build` before integrating.

Primary implementation references: [SQL API requests and bindings](https://docs.snowflake.com/en/developer-guide/sql-api/submitting-requests), [asynchronous responses](https://docs.snowflake.com/en/developer-guide/sql-api/handling-responses), [PAT authentication](https://docs.snowflake.com/en/user-guide/programmatic-access-tokens). Secrets and provider error bodies are never returned to the browser.

Verification on 2026-10-25: 310 tests across AI and Snowflake adapter passed; TypeScript, lint and production build passed. A local HTTP explanation returned 200 with honest local-fixture/unconfigured provenance and a Gemini timeout fallback. The Snowflake retrieval and successful Gemini generation were tested together with an injected generator/SQL response; live Snowflake remains unverified without account settings.
