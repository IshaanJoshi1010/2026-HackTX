import { createDealerLookup } from "../../../data/dealers/lookup";
import { loadSnapshot } from "../../../data/dealers/snapshots";

// Runs on the Node runtime (the default) and is dynamic because it reads the request.
// One lookup per server process, so its per-city cache is shared across requests.
let lookup: ReturnType<typeof createDealerLookup> | null = null;
const getLookup = () => (lookup ??= createDealerLookup({
  fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
  apiKey: process.env.SERPAPI_API_KEY || undefined,
  loadSnapshot,
}));

/** GET /api/dealers?city=Austin, TX -> { city, source, label, dealers }. Always 200 for a valid city, live or snapshot. */
export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get("city");
  try {
    return Response.json(await getLookup()(city ?? ""));
  } catch {
    return Response.json({ error: "Give a city name, for example ?city=Austin, TX" }, { status: 400 });
  }
}
