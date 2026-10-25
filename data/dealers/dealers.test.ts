import { describe, expect, it, vi } from "vitest";
import {
  CACHE_TTL_MS, citySlug, cleanCity, createDealerLookup, type FetchLike, FAILURE_TTL_MS, LIVE_LABEL, parseSerpApi, serpApiUrl,
} from "./lookup";
import { loadSnapshot } from "./snapshots";

const KEY = "test-key-not-real";
const result = (over: Record<string, unknown>) => ({ type: "Toyota dealer", ...over });
const serpBody = {
  search_metadata: { status: "Success" },
  local_results: [
    result({ title: "Toyota of Somewhere", address: "1 Main St, Austin, TX", rating: 4.7, phone: "(512) 555-0100",
      website: "https://www.toyotaofsomewhere.com/?utm_source=GBP&utm_medium=organic&ref=keep" }),
    result({ title: "Toyota of Somewhere Service Center", address: "2 Main St, Austin, TX", type: "Auto repair shop" }),
    result({ title: "Toyota Drop Lot", address: "3 Main St, Austin, TX" }),
    result({ title: "Honda of Austin", address: "4 Main St, Austin, TX", type: "Honda dealer" }),
    result({ title: "Toyota Twin Listing", address: "1 Main St., Austin, TX" }), // same address as the first
    result({ title: "No Website Toyota", address: "5 Main St, Austin, TX", place_id: "ChIJabc", website: "javascript:alert(1)" }),
    result({ title: "Toyota Two", address: "6 Main St, Austin, TX" }),
    result({ title: "Toyota Three", address: "7 Main St, Austin, TX", rating: 9 }),
    result({ title: "Toyota Four", address: "8 Main St, Austin, TX" }),
    result({ title: "Toyota Five", address: "9 Main St, Austin, TX" }),
    { title: "Toyota Missing Address" },
    "not an object",
  ],
};
const ok = (body: unknown): Awaited<ReturnType<FetchLike>> => ({ ok: true, status: 200, json: async () => body });
const status = (code: number, body: unknown): Awaited<ReturnType<FetchLike>> => ({ ok: false, status: code, json: async () => body });

function setup(opts: { fetch?: FetchLike; apiKey?: string | null; timeoutMs?: number } = {}) {
  let t = 0;
  const fetch = vi.fn(opts.fetch ?? (async () => ok(serpBody)));
  const lookup = createDealerLookup({
    fetch, apiKey: opts.apiKey === null ? undefined : opts.apiKey ?? KEY, loadSnapshot, now: () => t, timeoutMs: opts.timeoutMs,
  });
  return { lookup, fetch, advance: (ms: number) => { t += ms; } };
}
const FORBIDDEN = /inventory|in stock|price|pricing|\$|book(ed|ing)?|appointment|reserve|test drive|financ|deal of/i;

describe("live lookup (mocked SerpApi)", () => {
  it("success: maps up to 5 Toyota dealerships in the exact shape, labeled live", async () => {
    const { lookup, fetch } = setup();
    const r = await lookup("Austin, TX");
    expect(Object.keys(r)).toEqual(["city", "source", "label", "dealers"]);
    expect(r).toMatchObject({ city: "Austin, TX", source: "live", label: LIVE_LABEL });
    expect(r.dealers.map(d => d.name)).toEqual(["Toyota of Somewhere", "No Website Toyota", "Toyota Two", "Toyota Three", "Toyota Four"]);
    expect(r.dealers[0]).toEqual({ name: "Toyota of Somewhere", address: "1 Main St, Austin, TX", rating: 4.7,
      phone: "(512) 555-0100", link: "https://www.toyotaofsomewhere.com/?ref=keep" });
    expect(r.dealers[1].link).toBe("https://www.google.com/maps/place/?q=place_id:ChIJabc"); // unsafe website replaced
    expect(r.dealers[3].rating).toBeUndefined(); // out-of-range rating dropped
    const url = new URL(fetch.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ engine: "google_maps", type: "search", q: "Toyota dealer Austin, TX", api_key: KEY });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("caches live results per city, case-insensitively, for the cache TTL", async () => {
    const { lookup, fetch, advance } = setup();
    await lookup("Austin, TX");
    await lookup("  austin,   tx ");
    expect(fetch).toHaveBeenCalledTimes(1);
    await lookup("Denver, CO");
    expect(fetch).toHaveBeenCalledTimes(2);
    advance(CACHE_TTL_MS + 1);
    await lookup("Austin, TX");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("a cached result cannot be mutated by the caller", async () => {
    const { lookup } = setup();
    (await lookup("Austin, TX")).dealers.length = 0;
    expect((await lookup("Austin, TX")).dealers).toHaveLength(5);
  });

  it("a live search with no Toyota dealerships is an honest empty live result", async () => {
    const { lookup } = setup({ fetch: async () => ok({ local_results: [result({ title: "Honda", address: "x", type: "Honda dealer" })] }) });
    expect(await lookup("Smallville, KS")).toEqual({ city: "Smallville, KS", source: "live", label: LIVE_LABEL, dealers: [] });
  });
});

describe("fallback to saved snapshots", () => {
  it("timeout: gives up at the timeout and returns the Austin snapshot", async () => {
    const hang: FetchLike = (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const { lookup } = setup({ fetch: hang, timeoutMs: 30 });
    const started = performance.now();
    const r = await lookup("Austin, TX");
    expect(performance.now() - started).toBeLessThan(1000);
    expect(r.source).toBe("snapshot");
    expect(r.dealers.length).toBeGreaterThan(0);
    expect(r.label).toMatch(/^Saved snapshot of Google Maps via SerpApi results, captured \d{4}-\d{2}-\d{2}\./);
  });

  it("a hanging JSON body also times out", async () => {
    const { lookup } = setup({ fetch: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }), timeoutMs: 30 });
    expect((await lookup("Denver, CO")).source).toBe("snapshot");
  });

  it("quota error (429 and an error body with HTTP 200) returns the snapshot", async () => {
    const quota = { error: "Your account has run out of searches." };
    expect((await setup({ fetch: async () => status(429, quota) }).lookup("Denver, CO")).source).toBe("snapshot");
    expect((await setup({ fetch: async () => ok(quota) }).lookup("Denver, CO")).source).toBe("snapshot");
    expect((await setup({ fetch: async () => ok({ search_metadata: { status: "Error" } }) }).lookup("Denver")).source).toBe("snapshot");
    for (const code of [401, 403, 500, 503]) {
      expect((await setup({ fetch: async () => status(code, {}) }).lookup("Austin")).source).toBe("snapshot");
    }
  });

  it("malformed JSON or an unexpected shape returns the snapshot", async () => {
    const bad = await setup({ fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } }) }).lookup("Austin, TX");
    expect(bad.source).toBe("snapshot");
    expect((await setup({ fetch: async () => ok({ local_results: "nope" }) }).lookup("Austin, TX")).source).toBe("snapshot");
    expect((await setup({ fetch: async () => ok("just a string") }).lookup("Austin, TX")).source).toBe("snapshot");
  });

  it("network error returns the snapshot", async () => {
    expect((await setup({ fetch: async () => { throw new TypeError("fetch failed"); } }).lookup("Denver, CO")).source).toBe("snapshot");
  });

  it("no key: never calls SerpApi and returns the snapshot", async () => {
    const { lookup, fetch } = setup({ apiKey: null });
    const r = await lookup("Austin, TX");
    expect(fetch).not.toHaveBeenCalled();
    expect(r.source).toBe("snapshot");
    expect(r.dealers.map(d => d.name)).toContain("Toyota of Cedar Park");
  });

  it("unknown city: empty dealers with a clear no-snapshot label", async () => {
    const r = await setup({ apiKey: null }).lookup("Boise, ID");
    expect(r).toEqual({ city: "Boise, ID", source: "snapshot", label: "No saved snapshot for this city. Live lookup is unavailable right now.", dealers: [] });
  });

  it("failures are cached briefly, then live lookup is retried", async () => {
    let fail = true;
    const { lookup, fetch, advance } = setup({ fetch: async () => (fail ? status(503, {}) : ok(serpBody)) });
    expect((await lookup("Austin, TX")).source).toBe("snapshot");
    expect((await lookup("Austin, TX")).source).toBe("snapshot");
    expect(fetch).toHaveBeenCalledTimes(1);
    fail = false;
    advance(FAILURE_TTL_MS + 1);
    expect((await lookup("Austin, TX")).source).toBe("live");
  });

  it("rejects invalid city input", async () => {
    const { lookup, fetch } = setup();
    for (const bad of ["", " ", "x", "<script>", "a".repeat(81), "Austin; DROP TABLE"]) await expect(lookup(bad)).rejects.toThrow("invalid_city");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("saved snapshots", () => {
  it("Austin and Denver snapshots load, validate and hold real dealerships only", async () => {
    for (const slug of ["austin", "denver"]) {
      const s = await loadSnapshot(slug);
      expect(s, slug).not.toBeNull();
      expect(s!.dealers.length).toBeGreaterThan(0);
      expect(s!.dealers.length).toBeLessThanOrEqual(5);
      for (const d of s!.dealers) {
        expect(d.name).toMatch(/toyota/i);
        expect(d.name).not.toMatch(/service center|drop lot/i);
        if (d.link) expect(d.link).not.toMatch(/utm_|api_key|serpapi\.com\/search/);
      }
    }
  });

  it("any spelling of a saved city finds its snapshot; adding a city is adding one file", () => {
    expect(["Austin", "austin", "Austin, TX", "AUSTIN, Texas"].map(c => citySlug(cleanCity(c)!))).toEqual(["austin", "austin", "austin", "austin"]);
    expect(citySlug("San Antonio, TX")).toBe("san-antonio");
    expect(citySlug("St. Louis, MO")).toBe("st-louis");
  });

  it("refuses path tricks in the snapshot key", async () => {
    for (const slug of ["../package", "austin/../../x", "", "AUSTIN"]) expect(await loadSnapshot(slug)).toBeNull();
  });

  it("never makes inventory, pricing or booking claims", async () => {
    const outputs = [await setup().lookup("Austin, TX"), await setup({ apiKey: null }).lookup("Denver, CO"), await setup({ apiKey: null }).lookup("Boise, ID")];
    for (const o of outputs) expect(`${o.label} ${o.dealers.map(d => d.name).join(" ")}`).not.toMatch(FORBIDDEN);
    expect(parseSerpApi({ local_results: [] })).toEqual([]);
    expect(serpApiUrl("Austin, TX", "k")).toContain("engine=google_maps");
  });
});
