import { z } from "zod";

// Toyota dealer lookup through SerpApi's Google Maps engine, with a saved-snapshot fallback.
// Server-side only: the API key travels in the request URL, so the URL is never logged or returned.
// Shows names, addresses, ratings, phones and links only. No inventory, pricing or booking claims.

export interface Dealer { name: string; address: string; rating?: number; phone?: string; link?: string }
export interface DealerResult { city: string; source: "live" | "snapshot"; label: string; dealers: Dealer[] }
export interface DealerSnapshot { city: string; capturedOn: string; dealers: Dealer[] }

export const LIVE_LABEL = "Google Maps via SerpApi";
export const MAX_DEALERS = 5;
export const TIMEOUT_MS = 3000;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // live results per city
export const FAILURE_TTL_MS = 60 * 1000;           // brief: keeps an offline demo snappy without hiding recovery
export const SERPAPI_URL = "https://serpapi.com/search";

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Pick<Response, "ok" | "status" | "json">>;
export type SnapshotLoader = (slug: string) => Promise<DealerSnapshot | null>;

export interface LookupDeps {
  fetch: FetchLike;
  apiKey?: string;
  loadSnapshot: SnapshotLoader;
  now?: () => number;
  timeoutMs?: number;
}

const CITY_PATTERN = /^[\p{L}][\p{L} .,'-]*$/u;

/** Trimmed, single-spaced city text, or null when it is empty, too long or has odd characters. */
export function cleanCity(input: string | null | undefined): string | null {
  const city = (input ?? "").trim().replace(/\s+/g, " ");
  return city.length >= 2 && city.length <= 80 && CITY_PATTERN.test(city) ? city : null;
}

/** Snapshot file key: the part before the first comma, slugified. "San Antonio, TX" -> "san-antonio". */
export function citySlug(city: string): string {
  return city.split(",")[0].toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

const SnapshotSchema = z.object({
  city: z.string().min(1),
  capturedOn: z.iso.date(),
  dealers: z.array(z.object({
    name: z.string().min(1), address: z.string().min(1), rating: z.number().min(0).max(5).optional(),
    phone: z.string().min(1).optional(), link: z.url().optional(),
  }).strict()).max(MAX_DEALERS),
}).strict();

export function parseSnapshot(raw: unknown): DealerSnapshot | null {
  const parsed = SnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const LocalResult = z.object({
  title: z.string().optional(), address: z.string().optional(), rating: z.number().optional(),
  phone: z.string().optional(), website: z.string().optional(), place_id: z.string().optional(),
  type: z.string().optional(),
}).passthrough();
const SerpApiBody = z.object({
  error: z.string().optional(),
  search_metadata: z.object({ status: z.string().optional() }).passthrough().optional(),
  local_results: z.array(z.unknown()).optional(),
}).passthrough();

const NOT_A_DEALERSHIP = /\b(drop lot|service center|service department|parts (center|department|store)|collision|body shop|car wash)\b/i;

function safeLink(website: string | undefined, placeId: string | undefined): string | undefined {
  if (website) {
    try {
      const u = new URL(website);
      for (const key of [...u.searchParams.keys()]) if (/^utm_/i.test(key)) u.searchParams.delete(key);
      if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
    } catch { /* fall through to the Maps link */ }
  }
  return placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}` : undefined;
}

/**
 * Maps a SerpApi google_maps body to at most MAX_DEALERS Toyota dealers. Returns null when the body is an error
 * or not the expected shape. Keeps Toyota dealerships only: Toyota in the name or primary category, a dealer
 * category, not a service, parts or drop-lot listing, and one result per address.
 */
export function parseSerpApi(body: unknown): Dealer[] | null {
  const parsed = SerpApiBody.safeParse(body);
  if (!parsed.success || parsed.data.error || parsed.data.search_metadata?.status === "Error") return null;
  const dealers: Dealer[] = [];
  const seen = new Set<string>();
  for (const item of parsed.data.local_results ?? []) {
    const r = LocalResult.safeParse(item);
    if (!r.success) continue;
    const { title, address, rating, phone, website, place_id, type } = r.data;
    const name = title?.trim(), addr = address?.trim();
    if (!name || !addr) continue;
    if (!/toyota/i.test(`${name} ${type ?? ""}`)) continue;
    if (type && !/dealer/i.test(type)) continue;   // e.g. a dealership's "Auto repair shop" service listing
    if (NOT_A_DEALERSHIP.test(name)) continue;      // listings Google still files under "Toyota dealer"
    const place = addr.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(place)) continue;
    seen.add(place);
    const d: Dealer = { name: name.slice(0, 120), address: addr.slice(0, 200) };
    if (rating !== undefined && rating >= 0 && rating <= 5) d.rating = rating;
    if (phone?.trim()) d.phone = phone.trim().slice(0, 40);
    const link = safeLink(website, place_id);
    if (link) d.link = link;
    dealers.push(d);
    if (dealers.length === MAX_DEALERS) break;
  }
  return dealers;
}

export const snapshotLabel = (s: DealerSnapshot | null): string => s
  ? `Saved snapshot of Google Maps via SerpApi results, captured ${s.capturedOn}. Shown because live lookup is unavailable; details may have changed.`
  : "No saved snapshot for this city. Live lookup is unavailable right now.";

export function serpApiUrl(city: string, apiKey: string): string {
  const q = new URLSearchParams({ engine: "google_maps", type: "search", q: `Toyota dealer ${city}`, api_key: apiKey });
  return `${SERPAPI_URL}?${q.toString()}`;
}

/** One live call with a hard timeout. Throws on any failure; the caller falls back. */
async function fetchLive(deps: LookupDeps, city: string): Promise<Dealer[]> {
  if (!deps.apiKey) throw new Error("no_key");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, deps.timeoutMs ?? TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([deps.fetch(serpApiUrl(city, deps.apiKey), { signal: controller.signal }), timeout]);
    if (!res.ok) throw new Error(`http_${res.status}`);
    const body = await Promise.race([res.json(), timeout]);
    const dealers = parseSerpApi(body);
    if (!dealers) throw new Error("malformed");
    return dealers;
  } finally {
    clearTimeout(timer);
  }
}

/** Creates a lookup with its own per-city memory cache. */
export function createDealerLookup(deps: LookupDeps) {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { result: DealerResult; expires: number }>();

  async function fallback(city: string): Promise<DealerResult> {
    let snap: DealerSnapshot | null = null;
    try { snap = await deps.loadSnapshot(citySlug(city)); } catch { snap = null; }
    return { city, source: "snapshot", label: snapshotLabel(snap), dealers: snap?.dealers ?? [] };
  }

  return async function lookup(cityInput: string): Promise<DealerResult> {
    const city = cleanCity(cityInput);
    if (!city) throw new Error("invalid_city");
    const key = city.toLowerCase();
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return structuredClone(hit.result);
    try {
      const dealers = await fetchLive(deps, city);
      const result: DealerResult = { city, source: "live", label: LIVE_LABEL, dealers };
      cache.set(key, { result, expires: now() + CACHE_TTL_MS });
      return structuredClone(result);
    } catch {
      const result = await fallback(city);
      // Cache the fallback briefly so an offline demo stays fast; live lookup is retried after a minute.
      cache.set(key, { result, expires: now() + FAILURE_TTL_MS });
      return structuredClone(result);
    }
  };
}
