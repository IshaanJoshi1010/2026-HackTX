# D3-C4: synthetic ownership history

Created data/history.test.ts and this handoff. Expanded data/history.ts, updated the twin's history disclosure in data/twin.ts, and updated the Dev 3 handoff row. No shared types changed.

## Export

```ts
getHistory(vehicleId: string): HistoryRecord[];
```

The signature stays unchanged. Each call returns a deep copy. Unknown IDs return an empty array.

## Dataset

Both primary demo vehicles have purchase/ownership milestones, quarterly odometer readings, a first-service milestone at 5,000 miles, tire rotation/inspection every 5,000 miles, oil/filter changes every 10,000 miles, and fictional prior service events. The Camry also has a 30,000-mile filter service and 36,000-mile battery replacement; the RAV4 has an 18,000-mile wiper service. These are fictional performed events, not official maintenance guidance, repair diagnoses, provider records or projections.

Every record has date, type, description, mileage, source synthetic, and a provenance note naming the fictional listing. Descriptions visibly start with Synthetic. There are no inferred real events and no simulated LifeEvent payloads or scenario changes.

The timeline is anchored to saved primary listing snapshots on 2026-10-24, never to the runtime clock. A fictional steady 1,000 miles per month produces:

- Camry: ownership begins 2022-10-24 at zero miles and ends at the saved 48,000-mile odometer four years later, consistent with 12,000 mi/year.
- RAV4: ownership begins 2024-10-24 at zero miles and ends at the saved 24,000-mile odometer two years later.

Same-day service and odometer records are allowed; sorting is deterministic and non-decreasing by date/mileage. The final record is the snapshot's current odometer. An assertion prevents a changed snapshot mileage from silently disagreeing with the seed timeline.

## Twin integration

The builder already calls getHistory for registered primary demo VINs. Their expanded histories attach only when the last reading matches the selected twin mileage. Changed input/provider odometers yield an empty history and the explicit no-history state, not an invented catch-up event. Backup listing VINs, custom VINs and picker selections do not inherit primary vehicle history, even if they share a model ID or mileage. History is always returned by copy so scenario exploration cannot alter the source records.

This completes the C4 history dataset for the primary demo vehicles. C5 structured/free-text normalization, gap checks and tradeoff mapping and C6 providers remain pending. Synthetic history does not imply access to a real service database.

## Checks

npm test
npx tsc --noEmit
npx eslint data/history.ts data/history.test.ts data/twin.ts
npm run build

Tests cover schema validity, synthetic labels/provenance, chronological dates, non-decreasing mileage, annual Camry readings, service milestones, no future events beyond the snapshot anchor, exact agreement with built-twin odometers, caller isolation, offline/time-independent operation and no primary-history leakage to backup/custom VINs or changed odometers.
