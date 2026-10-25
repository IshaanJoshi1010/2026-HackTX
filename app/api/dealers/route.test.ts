import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route reads SERPAPI_API_KEY and keeps one cached lookup per process, so each test loads it fresh.
async function freshRoute(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = key;
  return import("./route");
}
const get = (route: Awaited<ReturnType<typeof freshRoute>>, query: string) => route.GET(new Request(`http://localhost/api/dealers${query}`));

describe("GET /api/dealers", () => {
  const saved = process.env.SERPAPI_API_KEY;
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); })); });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = saved;
  });

  it("fully offline with no key: Austin and Denver come from saved snapshots", async () => {
    const route = await freshRoute(undefined);
    for (const city of ["Austin, TX", "Denver"]) {
      const res = await get(route, `?city=${encodeURIComponent(city)}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source).toBe("snapshot");
      expect(body.dealers.length).toBeGreaterThan(0);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("offline with a key: the network failure falls back to the snapshot", async () => {
    const route = await freshRoute("test-key");
    const body = await (await get(route, "?city=Denver,%20CO")).json();
    expect(body).toMatchObject({ city: "Denver, CO", source: "snapshot" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("live success through the route returns the live shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      local_results: [{ title: "Toyota of Test", address: "1 Test Rd, Austin, TX", type: "Toyota dealer", rating: 4.5 }],
    })));
    const route = await freshRoute("test-key");
    expect(await (await get(route, "?city=Austin")).json()).toEqual({
      city: "Austin", source: "live", label: "Google Maps via SerpApi", dealers: [{ name: "Toyota of Test", address: "1 Test Rd, Austin, TX", rating: 4.5 }],
    });
  });

  it("unknown city: 200 with an empty list; missing or invalid city: 400", async () => {
    const route = await freshRoute(undefined);
    const unknown = await get(route, "?city=Boise,%20ID");
    expect(unknown.status).toBe(200);
    expect((await unknown.json()).dealers).toEqual([]);
    for (const q of ["", "?city=", "?city=%3Cscript%3E"]) expect((await get(route, q)).status).toBe(400);
  });
});
