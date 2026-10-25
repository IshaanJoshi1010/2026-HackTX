# Dev 3 integration calls

This is the Dev 2 wiring note for the merged app. Dev 3 code never imports sim or decision; the store passes their computed results into explanation. Do not import server-only ai/interpret.ts or ai/explain.ts from a client component.

## Offline identification and Alex demo

```ts
import { identifyVehicle } from "@/data/decode";
import { demoVins } from "@/data/registry";
import { buildDemoTwin, demoBrainDump, demoTodayISO } from "@/data/demo";

const identified = await identifyVehicle(demoVins.camry.primary, { offline: true });
if (identified.status !== "ok") throw new Error("Saved demo car unavailable");
const built = await buildDemoTwin("camry-2022-se");
if (!built.ok) throw new Error(built.error);
const twin = built.twin;
const context = {
  vehicle: { make: twin.vehicle.make, model: twin.vehicle.model,
    year: twin.vehicle.year, trim: twin.vehicle.trim },
  profile: twin.driver, existingEvents: [], todayISO: demoTodayISO,
};
```

The primary sample VINs are exported as demoVins.camry.primary and demoVins.rav4.primary; backup is available on each too. buildDemoTwin() defaults to the Camry; buildDemoTwin("rav4-2024-hybrid-xle") loads the other synthetic preset. All use saved data offline. The explicit preset loads Alex's household 3 / child 1 / cargo low / carSeats 0 / equal priorities. Generic buildTwin({ vehicle, raw, provider? }) does not silently load Alex. Read odometer provenance at twin.driver.provenance["mileage"].

## Interpretation: server call or client route

From server code:

```ts
import { interpret } from "@/ai/interpret";
const draft = await interpret(demoBrainDump, context);
```

From the browser:

```ts
const response = await fetch("/api/interpret", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: demoBrainDump, context }),
});
if (!response.ok) throw new Error("Interpret request rejected");
const draft = await response.json();
```

No key/network failure returns { aiAvailable: false }. Show the manual form in that state. A schema/grounding failure after one retry returns CLARIFY with no actions. On success stage draft.proposals/draft.profilePatches for review; only explicit user confirmation applies them. No future child value goes directly into the current profile. Keep the fixed demo date for the scripted snapshot; use an explicit appropriate date for ordinary user scenarios.

## Explanation: computed inputs only

After Dev 2 computes evaluation/results with Dev 4's modules, including optional sensitivity and a refreshed next action:

```ts
// Server code only:
import { explain } from "@/ai/explain";
const explanation = await explain(evaluation, results);
// Returns { text, usedFallback }.
```

```ts
// Browser code:
const response = await fetch("/api/explain", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ evaluation, results }),
});
if (!response.ok) throw new Error("Explain request rejected");
const explanation = await response.json();
```

The route returns text and usedFallback. With no configured GEMINI_API_KEY it additionally returns aiAvailable: false. This is an additive route signal; the canonical explain() signature stays unchanged. With a configured key the availability field is omitted, so do not assume a successful model response from its absence; usedFallback is the rendering signal. Provider failures, invented numbers and rejected output produce deterministic explanation text. Invalid/mismatched scenario sets return HTTP 400. The UI should also discard stale async responses after scenario edits, even if the scenario IDs stay the same.

Explanation copies deterministic facts; it never computes a financial amount, confidence percentage, verdict or threshold. numberCheck rejects numeric values absent from the supplied payload, and unsupported percentage claims fall back. Numeric membership is not proof of every semantic claim; keep computed comparison values and provenance authoritative.

## Hosting variables

Set server-side GEMINI_API_KEY in the host's secret settings. Set GEMINI_MODEL=gemini-3.1-flash-lite to reproduce the locally tested model selection; leaving it unset uses the code's existing gemini-3.8-flash default, which timed out in the initial smoke checks. No NEXT_PUBLIC_ secret, no client-side SDK key, no credential in a URL or committed file. Local credentials stay only in ignored .env.local. The model name is public configuration; the key is secret.

No key is required for saved VINs, synthetic providers, deterministic comparison or manual entry. Live evaluation remains 15 latest matching cases across bounded runs with five requiring revalidation, not a 20/20 production accuracy claim. Mocked three-phrasing equivalence and offline route tests are distinct from live-model reliability. See ai/LIVE-EVALUATION.md.
