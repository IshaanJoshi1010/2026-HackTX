import { describe, expect, it } from "vitest";
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import { advance, buildStreams, compareWords, hashString, layoutField, makeParticles, mulberry32, particleCount, particleDot, streamPoint, streamWords, valueAtMonth, type FieldInput } from "./fieldMath";

const names = { baseline: "If nothing changes", keep: () => "Keep your Camry", replace: () => "Switch to the RAV4" };
const ev = (id: string, month: number): LifeEvent => ({ id, type: "mileage_change", month, payload: { annualMiles: 20000 }, source: "user", assumptions: [], certainty: "clear", status: "confirmed" });
const sc = (id: string, parentId: string | null, forkMonth: number, events: LifeEvent[], name = id): Scenario => ({ id, parentId, forkMonth, name, events, assumptions: {} });

/** A projection whose net cost at month m is `cost(m)`. */
const result = (id: string, cost: (m: number) => number): SimulationResult => ({
  scenarioId: id,
  points: Array.from({ length: 60 }, (_, i): ProjectionPoint => ({
    month: i + 1, vehicleId: "v", mileage: 0, fuelSpend: 0, maintenanceSpend: 0, vehicleValue: 0, loanBalance: 0, cumulativeCash: 0,
    netEconomicCost: cost(i + 1), suitability: { passengerFit: "good", cargoFit: "good", tradeoffs: [], constraints: [], notes: [] },
  })),
  milestones: [], warnings: [], summary: { totalCash: 0, netCost: cost(60) },
});

const base = sc("base", null, 0, [], "Keep the Camry");
const denver = sc("denver", "base", 0, [ev("miles", 0), ev("move", 12)], "Move to Denver");
const replace = sc("denver/replace", "denver", 12, [ev("miles", 0), ev("move", 12), ev("swap", 12)], "Replace with RAV4");
const results = {
  base: result("base", (m) => m * 500),
  denver: result("denver", (m) => m * 500 + m * 100), // costs 100 more a month from the start
  "denver/replace": result("denver/replace", (m) => (m < 12 ? m * 600 : m * 600 + (m - 11) * 40)), // same as denver until month 12, then more
};
const input = (over: Partial<FieldInput> = {}): FieldInput => ({
  scenarios: [base, denver, replace], results, baselineId: "base", activeId: "denver", comparison: null, showAll: false, names, ...over,
});

describe("which futures are drawn", () => {
  it("the baseline and the one you are looking at, and no more", () => {
    expect(buildStreams(input()).map((s) => s.id)).toEqual(["base", "denver"]);
  });

  it("adds both futures you compared, and the one they came from", () => {
    const out = buildStreams(input({ activeId: "denver/replace", comparison: { keepId: "denver", replaceId: "denver/replace" } }));
    expect(out.map((s) => [s.id, s.kind])).toEqual([["base", "baseline"], ["denver", "yours"], ["denver/replace", "replace"]]);
  });

  it("draws every future when asked", () => {
    expect(buildStreams(input({ showAll: true })).map((s) => s.id).sort()).toEqual(["base", "denver", "denver/replace"]);
  });

  it("draws the future an active future came from, so the split is visible", () => {
    expect(buildStreams(input({ activeId: "denver/replace" })).map((s) => s.id)).toEqual(["base", "denver", "denver/replace"]);
  });

  it("draws nothing without a baseline, and skips a future with no projection", () => {
    expect(buildStreams(input({ scenarios: [denver] }))).toEqual([]);
    expect(buildStreams(input({ results: { base: results.base } })).map((s) => s.id)).toEqual(["base"]);
  });
});

describe("the streams are the real projections", () => {
  it("each series is the drift from if nothing changes, and the end is the raw number", () => {
    const out = buildStreams(input());
    const denverStream = out.find((s) => s.id === "denver")!;
    expect(denverStream.series[0]).toEqual({ month: 0, delta: 0 });
    expect(denverStream.endDelta).toBe(60 * 100);
    expect(out.find((s) => s.id === "base")!.endDelta).toBe(0);
  });

  it("a future starts where it first differs from the one it came from", () => {
    const out = buildStreams(input({ activeId: "denver/replace" }));
    expect(out.find((s) => s.id === "base")!.fromMonth).toBe(0);
    expect(out.find((s) => s.id === "denver")!.fromMonth).toBe(0); // costs more from month 1: it joins one month before that
    expect(out.find((s) => s.id === "denver/replace")!.fromMonth).toBe(12); // never before its own fork month: the swap is the split
  });

  it("a future that costs exactly the same rides along from where it branched", () => {
    const same = sc("same", "base", 6, [ev("x", 6)]);
    const out = buildStreams({ ...input({ scenarios: [base, same], activeId: "same" }), results: { base: results.base, same: result("same", (m) => m * 500) } });
    const stream = out.find((s) => s.id === "same")!;
    expect(stream.fromMonth).toBe(6);
    expect(Math.round(stream.endDelta)).toBe(0);
  });

  it("decisions belong to the stream that made them, not to a copy of them", () => {
    const out = buildStreams(input({ activeId: "denver/replace" }));
    expect(out.find((s) => s.id === "denver")!.decisions.map((e) => e.id)).toEqual(["miles", "move"]);
    expect(out.find((s) => s.id === "denver/replace")!.decisions.map((e) => e.id)).toEqual(["swap"]); // miles and move are copies
    expect(out.find((s) => s.id === "base")!.decisions).toEqual([]);
  });

  it("does not change what it is given", () => {
    const before = JSON.stringify([base, denver, replace, results]);
    buildStreams(input({ showAll: true }));
    expect(JSON.stringify([base, denver, replace, results])).toBe(before);
  });
});

describe("what the streams say, without numbers", () => {
  it("compares in words, to the dollar", () => {
    expect(compareWords(1200, "keeping")).toBe("costs more than keeping");
    expect(compareWords(-1200, "keeping")).toBe("costs less than keeping");
    expect(compareWords(0.4, "keeping")).toBe("costs the same as keeping");
  });

  it("names each future against the right thing", () => {
    const solo = buildStreams(input());
    expect(streamWords(solo.find((s) => s.id === "base")!, solo)).toBeNull();
    expect(streamWords(solo.find((s) => s.id === "denver")!, solo)).toBe("costs more than if nothing changed");
    const both = buildStreams(input({ activeId: "denver/replace", comparison: { keepId: "denver", replaceId: "denver/replace" } }));
    expect(streamWords(both.find((s) => s.kind === "replace")!, both)).toBe("costs more than keeping");
    expect(streamWords(both.find((s) => s.kind === "yours")!, both)).toBe("costs less than switching");
  });

  it("when nothing has changed yet, the baseline is the one you keep, and says so", () => {
    const only = [base, sc("base/replace-rav4-12", "base", 12, [ev("swap", 12)], "Replace with RAV4")];
    const out = buildStreams({
      ...input({ scenarios: only, activeId: "base/replace-rav4-12", comparison: { keepId: "base", replaceId: "base/replace-rav4-12" } }),
      results: { base: results.base, "base/replace-rav4-12": result("base/replace-rav4-12", (m) => m * 500 + (m >= 12 ? 3000 : 0)) },
    });
    expect(out.map((s) => [s.name, s.kind, s.keep])).toEqual([["Keep your Camry", "baseline", true], ["Switch to the RAV4", "replace", false]]);
    expect(streamWords(out[1], out)).toBe("costs more than keeping");
    expect(streamWords(out[0], out)).toBe("costs less than switching");
  });

  it("uses the names it was given", () => {
    const both = buildStreams(input({ activeId: "denver/replace", comparison: { keepId: "denver", replaceId: "denver/replace" } }));
    expect(both.map((s) => s.name)).toEqual(["If nothing changes", "Keep your Camry", "Switch to the RAV4"]);
    expect(buildStreams(input()).map((s) => s.name)).toEqual(["If nothing changes", "Move to Denver"]);
  });
});

describe("layout", () => {
  const streams = buildStreams(input());
  const layout = layoutField(streams, { width: 1000, height: 400 }, { tagWidth: 200 });

  it("runs from the left margin to the tag column, and stays inside the frame", () => {
    expect(layout.x(0)).toBe(28);
    expect(layout.x(60)).toBe(28 + layout.plotWidth);
    expect(layout.x(60)).toBeLessThanOrEqual(1000 - 200);
    for (const s of streams) for (const p of s.series) {
      const y = layout.y(p.delta);
      expect(y).toBeGreaterThanOrEqual(layout.frame.padTop);
      expect(y).toBeLessThanOrEqual(400 - layout.frame.padBottom);
    }
  });

  it("costing more goes down, saving money goes up, nothing is the middle", () => {
    expect(layout.y(5000)).toBeGreaterThan(layout.y(0));
    expect(layout.y(-5000)).toBeLessThan(layout.y(0));
    expect(streamPoint(layout, streams[0], 30).y).toBe(layout.y(0));
    expect(streamPoint(layout, streams[1], 60).y).toBeGreaterThan(layout.y(0));
  });

  it("a tiny difference stays a gentle bend", () => {
    const flat = buildStreams({ ...input(), results: { ...results, denver: result("denver", (m) => m * 500 + 2) } });
    const l = layoutField(flat, { width: 1000, height: 400 });
    expect(Math.abs(l.y(2) - l.y(0))).toBeLessThan(2);
  });
});

describe("valueAtMonth", () => {
  const series = [{ month: 0, delta: 0 }, { month: 10, delta: 100 }, { month: 20, delta: 100 }];
  it("reads between the points, and holds at the ends", () => {
    expect(valueAtMonth(series, 5)).toBe(50);
    expect(valueAtMonth(series, 15)).toBe(100);
    expect(valueAtMonth(series, -3)).toBe(0);
    expect(valueAtMonth(series, 99)).toBe(100);
    expect(valueAtMonth([], 4)).toBe(0);
  });
});

describe("particles", () => {
  it("the same seed scatters the same way, a different one does not", () => {
    expect(makeParticles(50, 7)).toEqual(makeParticles(50, 7));
    expect(makeParticles(50, 7)).not.toEqual(makeParticles(50, 8));
    expect(mulberry32(1)()).toBe(mulberry32(1)());
    expect(hashString("denver")).toBe(hashString("denver"));
    expect(hashString("denver")).not.toBe(hashString("base"));
  });

  it("each is in range, and bunched toward the middle of the stream", () => {
    const ps = makeParticles(2000, 3);
    for (const p of ps) {
      expect(p.u).toBeGreaterThanOrEqual(0);
      expect(p.u).toBeLessThan(1);
      expect(Math.abs(p.off)).toBeLessThanOrEqual(1);
      expect(p.speed).toBeGreaterThan(0);
    }
    const near = ps.filter((p) => Math.abs(p.off) < 0.5).length;
    expect(near / ps.length).toBeGreaterThan(0.6);
  });

  it("move along, and start again at the beginning when they reach the end", () => {
    const ps = [{ u: 0.98, speed: 0.1, off: 0, size: 1, seed: 0.5 }];
    advance(ps, 1);
    expect(ps[0].u).toBeCloseTo(0.08, 5);
    advance(ps, 0);
    expect(ps[0].u).toBeCloseTo(0.08, 5);
  });

  it("the one you are looking at gets more, a short stream fewer, a slow machine fewer still", () => {
    const [b, d] = buildStreams(input());
    expect(particleCount(d)).toBeGreaterThan(particleCount(b));
    const late = { ...d, fromMonth: 48 };
    expect(particleCount(late)).toBeLessThan(particleCount(d));
    expect(particleCount(d, true)).toBeLessThan(particleCount(d));
  });

  it("a dot is on its stream, fades in at the start and out at the end, and never leaves the page", () => {
    const streams = buildStreams(input());
    const layout = layoutField(streams, { width: 1000, height: 400 }, { tagWidth: 200 });
    const stream = streams[1];
    const p = { u: 0.5, speed: 0.05, off: 0, size: 1, seed: 0 };
    const mid = particleDot(layout, stream, p, 0);
    expect(mid.x).toBeCloseTo(layout.x(30), 5);
    expect(mid.alpha).toBeGreaterThan(0.5);
    expect(particleDot(layout, stream, { ...p, u: 0 }, 0).alpha).toBe(0);
    expect(particleDot(layout, stream, { ...p, u: 0.999 }, 0).alpha).toBeLessThan(0.05);
    for (const dot of makeParticles(300, 9).map((q) => particleDot(layout, stream, q, 2.5))) {
      expect(dot.x).toBeGreaterThanOrEqual(layout.x(0) - 1);
      expect(dot.x).toBeLessThanOrEqual(layout.x(60) + 1);
      expect(dot.y).toBeGreaterThan(0);
      expect(dot.y).toBeLessThan(400);
      expect(dot.alpha).toBeGreaterThanOrEqual(0);
      expect(dot.alpha).toBeLessThanOrEqual(1);
    }
  });

  it("the one you are looking at is brighter than the baseline", () => {
    const streams = buildStreams(input());
    const layout = layoutField(streams, { width: 1000, height: 400 });
    const p = { u: 0.5, speed: 0.05, off: 0, size: 1, seed: 0 };
    expect(particleDot(layout, streams[1], p, 0).alpha).toBeGreaterThan(particleDot(layout, streams[0], p, 0).alpha);
  });
});
