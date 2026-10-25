import { MONTH_MAX } from "@/ui/store/months";
import { advance, makeParticles, particleDot, streamPoint, type FieldLayout, type Particle, type Stream } from "./fieldMath";

/** The pieces of a canvas this draws with, so a test can hand in a stand-in. */
export interface Paint {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
}

/** A stream that has not been looked at yet: a faint path onward that claims no cost. */
export interface Ghost {
  fromMonth: number;
  /** Where it runs from and to, in pixels. */
  y: number;
}

export interface PaintInput {
  layout: FieldLayout;
  streams: Stream[];
  ghost: Ghost | null;
  particles: Map<string, Particle[]>;
  /** Seconds since the first frame. */
  time: number;
  /** Move particles by this many seconds before drawing. Zero for a still frame. */
  dt: number;
  size: { width: number; height: number };
  /** Skip the pulses on decisions (reduced motion). */
  still: boolean;
}

const white = (a: number) => `rgba(255,255,255,${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** Particles for every stream, kept between frames. Rebuilt when a stream appears or its size changes. */
export function ensureParticles(map: Map<string, Particle[]>, wanted: Array<{ key: string; count: number; seed: number }>): void {
  const keep = new Set(wanted.map((w) => w.key));
  for (const key of [...map.keys()]) if (!keep.has(key)) map.delete(key);
  for (const w of wanted) if (map.get(w.key)?.length !== w.count) map.set(w.key, makeParticles(w.count, w.seed));
}

export function paintField(ctx: Paint, input: PaintInput): number {
  const { layout, streams, ghost, particles, time, dt, size, still } = input;
  ctx.clearRect(0, 0, size.width, size.height);
  let drawn = 0;
  const dot = (x: number, y: number, r: number, a: number) => {
    if (a <= 0.004) return;
    ctx.fillStyle = white(a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    drawn += 1;
  };

  // Quiet ones first, so the one you are looking at is on top.
  for (const stream of [...streams].sort((a, b) => Number(a.active) - Number(b.active))) {
    const ps = particles.get(stream.id) ?? [];
    if (dt > 0) advance(ps, dt);
    for (const p of ps) {
      const d = particleDot(layout, stream, p, time);
      dot(d.x, d.y, d.r, d.alpha);
    }
  }

  if (ghost) {
    const ps = particles.get("ghost") ?? [];
    if (dt > 0) advance(ps, dt * 0.6);
    for (const p of ps) {
      const month = ghost.fromMonth + p.u * (MONTH_MAX - ghost.fromMonth);
      const edge = Math.min(1, p.u / 0.06) * Math.min(1, (1 - p.u) / 0.07);
      dot(layout.x(month), ghost.y + p.off * 5, 0.9, 0.2 * edge);
    }
  }

  // Each decision is a ring that opens on its stream and fades, once a second or so.
  for (const stream of streams) {
    for (const e of stream.decisions) {
      const { x, y } = streamPoint(layout, stream, e.month);
      const phase = still ? 0 : (time * 0.55 + (e.month % 7) / 7) % 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = white(still ? 0.4 : 0.55 * (1 - phase));
      ctx.beginPath();
      ctx.arc(x, y, 7 + (still ? 0 : phase * 14), 0, Math.PI * 2);
      ctx.stroke();
      dot(x, y, 3, stream.active ? 0.95 : 0.6);
    }
  }
  return drawn;
}
