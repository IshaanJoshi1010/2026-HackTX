// Adds or refreshes a city's saved snapshot with one real SerpApi search (one search of the free quota).
// Usage: npx tsx --env-file=.env.local data/dealers/capture.ts "San Antonio, TX"
// Writes data/fixtures/dealers-<slug>.json with only { city, capturedOn, dealers }. Never prints the key.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { citySlug, cleanCity, createDealerLookup, type DealerSnapshot, parseSnapshot } from "./lookup";

async function main() {
  const city = cleanCity(process.argv[2]);
  if (!city) throw new Error('Pass a city, for example: "Austin, TX"');
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("SERPAPI_API_KEY is not set. Run with --env-file=.env.local");

  const lookup = createDealerLookup({ fetch: (url, init) => fetch(url, init), apiKey, loadSnapshot: async () => null, timeoutMs: 15000 });
  const result = await lookup(city);
  if (result.source !== "live") throw new Error("Live lookup failed (quota, network or malformed response); no snapshot written");

  const snapshot: DealerSnapshot = { city, capturedOn: new Date().toISOString().slice(0, 10), dealers: result.dealers };
  if (!parseSnapshot(snapshot)) throw new Error("Snapshot failed validation; nothing written");
  const file = join(process.cwd(), "data", "fixtures", `dealers-${citySlug(city)}.json`);
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Saved ${result.dealers.length} dealers for ${city} to ${file}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : "Capture failed");
  process.exit(1);
});
