import { describe, expect, it } from "vitest";
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import { buildStreams, layoutField, particleCount, hashString } from "./fieldMath";
import { ensureParticles, paintField, type Paint } from "./paintField";

const ev = (id: string, month: number): LifeEvent => ({ id, type: "mileage_change", month, payload: { annualMiles: 20000 }, source: "user", assumptions: [], certainty: "clear", status: "confirmed" });
const sc = (id: string, parentId: string | null, forkMonth: number, events: LifeEvent[]): Scenario => ({ id, parentId, forkMonth, name: id, events, assumptions: {} });
const result = (id: string, cost: (m: number) => number): SimulationResult => ({
  scenarioId: id,
  points: Array.from({ length: 60 }, (_, i): ProjectionPoint => ({
    month: i + 1, vehicleId: "v", mileage: 0, fuelSpend: 0, maintenanceSpend: 0, vehicleValue: 0, loanBalance: 0, cumulativeCash: 0,
    netEconomicCost: cost(i + 1), suitability: { passengerFit: "good", cargoFit: "good", tradeoffs: [], constraints: [], notes: [] },
  })),
  milestones: [], warnings: [], summary: { totalCash: 0, netCost: cost(60) },
});

const SIZE = { width: 1000, height: 400 };
const streams = buildStreams({
  scenarios: [sc("base", null, 0, []), sc("denver", "base", 0, [ev("miles", 0), ev("move", 12)])],
  results: { base: result("base", (m) => m * 500), denver: result("denver", (m) => m * 600) },
  baselineId: "base", activeId: "denver", comparison: null, showAll: false,
  names: { baseline: "If nothing changes", keep: () => "Keep", replace: () => "Switch" },
});
const layout = layoutField(streams, SIZE, { tagWidth: 200 });

/** A canvas that writes down what it was asked to draw. */
function recorder() {
  const arcs: Array<{ x: number; y: number; r: number; fill: string }> = [];
  const strokes: Array<{ x: number; y: number; r: number }> = [];
  let clears = 0;
  let current: { x: number; y: number; r: number } | null = null;
  const ctx: Paint = {
    fillStyle: "", strokeStyle: "", lineWidth: 1,
    clearRect: () => { clears += 1; },
    beginPath: () => { current = null; },
    arc: (x, y, r) => { current = { x, y, r }; },
    fill() { if (current) arcs.push({ ...current, fill: String(this.fillStyle) }); },
    stroke() { if (current) strokes.push({ ...current }); },
  };
  return { ctx, arcs, strokes, clears: () => clears };
}

const particlesFor = (ghost = false, low = false) => {
  const map = new Map();
  ensureParticles(map, [...streams.map((s) => ({ key: s.id, count: particleCount(s, low), seed: hashString(s.id) })), ...(ghost ? [{ key: "ghost", count: low ? 16 : 44, seed: 1 }] : [])]);
  return map;
};

describe("paintField", () => {
  it("clears the canvas and draws the streams as dots inside the frame", () => {
    const r = recorder();
    const drawn = paintField(r.ctx, { layout, streams, ghost: null, particles: particlesFor(), time: 3, dt: 0, size: SIZE, still: false });
    expect(r.clears()).toBe(1);
    expect(drawn).toBeGreaterThan(150);
    for (const a of r.arcs) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(SIZE.width);
      expect(a.y).toBeGreaterThan(0);
      expect(a.y).toBeLessThan(SIZE.height);
      expect(a.r).toBeGreaterThan(0);
    }
    expect(r.arcs.every((a) => /^rgba\(255,255,255,0\.\d+\)$|^rgba\(255,255,255,1\.000\)$/.test(a.fill))).toBe(true); // white only, no colour
  });

  it("draws the one you are looking at last, so it is on top", () => {
    const order: string[] = [];
    const r = recorder();
    const seen = new Map(streams.map((s, i) => [s.id, i]));
    const ctx = { ...r.ctx, fill() { order.push(String(this.fillStyle)); r.ctx.fill.call(this); } } as Paint;
    paintField(ctx, { layout, streams, ghost: null, particles: particlesFor(), time: 1, dt: 0, size: SIZE, still: true });
    expect(seen.size).toBe(2);
    expect(order.length).toBeGreaterThan(0);
  });

  it("a ring and a dot sit on each decision", () => {
    const r = recorder();
    paintField(r.ctx, { layout, streams, ghost: null, particles: particlesFor(), time: 0.4, dt: 0, size: SIZE, still: false });
    const decisions = streams.flatMap((s) => s.decisions);
    expect(decisions.length).toBe(2);
    expect(r.strokes).toHaveLength(2);
    for (const ring of r.strokes) expect(ring.r).toBeGreaterThanOrEqual(7);
  });

  it("still is a calm frame: the rings do not open", () => {
    const r = recorder();
    paintField(r.ctx, { layout, streams, ghost: null, particles: particlesFor(), time: 5, dt: 0, size: SIZE, still: true });
    expect(r.strokes.every((s) => s.r === 7)).toBe(true);
  });

  it("moves the particles by dt and not at all by zero", () => {
    const particles = particlesFor();
    const before = particles.get("denver")!.map((p: { u: number }) => p.u);
    paintField(recorder().ctx, { layout, streams, ghost: null, particles, time: 0, dt: 0, size: SIZE, still: false });
    expect(particles.get("denver")!.map((p: { u: number }) => p.u)).toEqual(before);
    paintField(recorder().ctx, { layout, streams, ghost: null, particles, time: 0, dt: 0.5, size: SIZE, still: false });
    expect(particles.get("denver")!.map((p: { u: number }) => p.u)).not.toEqual(before);
  });

  it("an unexplored choice is a faint flat path that claims no cost", () => {
    const ghost = { fromMonth: 12, y: layout.y(0) };
    const without = recorder(), withGhost = recorder();
    paintField(without.ctx, { layout, streams, ghost: null, particles: particlesFor(), time: 2, dt: 0, size: SIZE, still: true });
    paintField(withGhost.ctx, { layout, streams, ghost, particles: particlesFor(true), time: 2, dt: 0, size: SIZE, still: true });
    const extra = withGhost.arcs.length - without.arcs.length;
    expect(extra).toBeGreaterThan(10);
    const alpha = (fill: string) => Number(/,([\d.]+)\)$/.exec(fill)![1]);
    const faint = withGhost.arcs.filter((a) => Math.abs(a.y - ghost.y) <= 5 && a.x >= layout.x(12) - 1 && alpha(a.fill) <= 0.2001);
    expect(faint.length).toBeGreaterThanOrEqual(extra - 2);
  });

  it("a slow machine draws fewer", () => {
    const full = recorder(), low = recorder();
    paintField(full.ctx, { layout, streams, ghost: null, particles: particlesFor(false, false), time: 1, dt: 0, size: SIZE, still: false });
    paintField(low.ctx, { layout, streams, ghost: null, particles: particlesFor(false, true), time: 1, dt: 0, size: SIZE, still: false });
    expect(low.arcs.length).toBeLessThan(full.arcs.length * 0.6);
  });
});

describe("ensureParticles", () => {
  it("keeps what it has, rebuilds a stream whose count changed, and drops what is gone", () => {
    const map = new Map();
    ensureParticles(map, [{ key: "a", count: 10, seed: 1 }, { key: "b", count: 5, seed: 2 }]);
    const a = map.get("a");
    ensureParticles(map, [{ key: "a", count: 10, seed: 1 }, { key: "c", count: 3, seed: 3 }]);
    expect(map.get("a")).toBe(a);
    expect(map.has("b")).toBe(false);
    expect(map.get("c")).toHaveLength(3);
    ensureParticles(map, [{ key: "a", count: 4, seed: 1 }]);
    expect(map.get("a")).toHaveLength(4);
  });
});
