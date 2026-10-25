# Toyota dealer lookup (SerpApi track)

Owner: Anirudh (a one-time lane carve-out agreed with Paarth). It's independent of `/sim`, `/decision` and `/contracts`: it doesn't import them, and they don't import it.

## Route

`GET /api/dealers?city=Austin, TX`

```ts
{ city: string; source: "live" | "snapshot"; label: string;
  dealers: { name: string; address: string; rating?: number; phone?: string; link?: string }[] }  // at most 5
```

- **Live:** SerpApi's Google Maps engine, query `Toyota dealer <city>`, labeled `Google Maps via SerpApi`. 3000 ms timeout.
- **Snapshot:** used for no key, a timeout, a quota or HTTP error, malformed JSON, or a network failure. The label gives the capture date and says details may have changed.
- **City with no snapshot:** `source: "snapshot"`, an empty `dealers` list, and a label saying so.
- **Status codes:** always 200 for a valid city. 400 only for a missing or invalid `city`.
- **Cache:** per city, in memory. Live results stay 6 hours; failures stay 1 minute, so an offline demo stays fast.
- **Filtering:** results are Toyota dealerships only, one per address. Service centers, parts counters and drop lots are dropped. `utm_*` tracking is stripped from links. When a dealer has no website, the link is its Google Maps place page.
- **What it shows:** names, addresses, ratings, phones and links only. No inventory, pricing or booking claims.

## Add a city

```bash
npx tsx --env-file=.env.local data/dealers/capture.ts "San Antonio, TX"
```

This runs one real search and writes `data/fixtures/dealers-san-antonio.json`, the slug being the part before the comma. No code changes are needed: the route discovers every `dealers-*.json`. Commit the new file.

## Key and quota

- Put `SERPAPI_API_KEY` in `.env.local`, which is ignored. Never commit it.
- The key goes in the request URL, so the code never logs or returns that URL. Snapshots store only the five fields above.
- The free plan allows 250 searches a month and 50 an hour. Cached, errored and failed searches don't count.

## Tests

`npx vitest run data/dealers app/api/dealers` covers success, timeout, quota error, malformed JSON, no key, unknown city, caching, input validation, the fully offline route, and a check that nothing claims inventory, pricing or booking.
