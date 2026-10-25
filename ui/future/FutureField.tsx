"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { data, sim } from "@/ui/mocks";
import { monthLabel } from "@/ui/profile/format";
import { eventTitle } from "@/ui/store/eventLabels";
import { MONTH_MAX } from "@/ui/store/months";
import { useForkStore } from "@/ui/store/useForkStore";
import { EVENT_ICON } from "@/ui/timeline/EventMarkers";
import { useElementSize } from "@/ui/timeline/useElementSize";
import { YEAR_TICKS, yearLabel } from "@/ui/timeline/layout";
import { assignLevels, levelOffset, spreadLabels } from "@/ui/timeline/roadMath";
import { buildStreams, hashString, layoutField, particleCount, streamPoint, streamWords, valueAtMonth, type Particle, type Stream } from "./fieldMath";
import { ensureParticles, paintField, type Ghost } from "./paintField";

const TAG_WIDTH = 236;
/** Under this width the labels go under the streams instead of beside them. */
const WIDE = 760;

/**
 * Your future, as particles. Each stream is a possible future, drawn from the real projection: it runs along "if
 * nothing changes" until something you told Fork pulls it away, and then it splits. Tap a stream's name to look at that
 * future. The faint branch is a choice you have not looked at yet. No numbers on it; they are one button away.
 */
export function FutureField({ className }: { className?: string }) {
  const twin = useForkStore((s) => s.twin);
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const results = useForkStore((s) => s.results);
  const activeId = useForkStore((s) => s.activeScenarioId);
  const comparison = useForkStore((s) => s.comparison);
  const evaluation = useForkStore((s) => s.evaluation);
  const replacement = useForkStore((s) => s.replacementVehicle);
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);
  const lowPerformance = useForkStore((s) => s.ui.lowPerformance);
  const busy = useForkStore((s) => s.ui.busy);
  const { setActiveScenario, openReplaceComparison } = useForkStore((s) => s.actions);

  const [setNode, size] = useElementSize<HTMLDivElement>({ width: 960, height: 380 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef(new Map<string, Particle[]>());

  const model = twin?.vehicle.model ?? "car";
  const streams = useMemo(
    () =>
      buildStreams({
        scenarios,
        results,
        baselineId: "base",
        activeId,
        comparison,
        showAll: true, // every future stays on the field, so every option stays one tap away
        names: { baseline: "If nothing changes", keep: () => `Keep your ${model}`, replace: () => `Switch to the ${replacement?.model ?? "other car"}` },
      }),
    [scenarios, results, activeId, comparison, model, replacement],
  );

  const wide = size.width >= WIDE;
  const layout = useMemo(() => layoutField(streams, size, { tagWidth: wide ? TAG_WIDTH : 0 }), [streams, size, wide]);

  // The other car, offered as a faint branch until it has been looked at.
  const other = useMemo(() => (twin ? data.listSampleVehicles().find((v) => v.id !== twin.vehicle.id) : undefined), [twin]);
  // The choice branches off the future you are looking at, even if that is "if nothing changes".
  const from = streams.find((s) => s.active) ?? streams.find((s) => s.kind === "yours") ?? streams[0];
  const offer = !comparison && other && from ? other : undefined;
  const ghost: Ghost | null = useMemo(() => {
    if (!offer || !from) return null;
    const parent = scenarios.find((s) => s.id === from.id);
    let fromMonth = 12;
    try {
      if (parent) fromMonth = sim.makeReplaceScenario(parent, offer).events.find((e) => e.type === "vehicle_replacement")?.month ?? 12;
    } catch {
      /* the default month stands */
    }
    return { fromMonth, y: layout.y(valueAtMonth(from.series, fromMonth)) };
  }, [offer, from, scenarios, layout]);

  // Draw. Moving unless the person asked for less motion; a still frame is drawn again whenever anything changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ensureParticles(particles.current, [
      ...streams.map((s) => ({ key: s.id, count: particleCount(s, lowPerformance), seed: hashString(s.id) })),
      ...(ghost ? [{ key: "ghost", count: lowPerformance ? 16 : 44, seed: hashString("ghost") }] : []),
    ]);
    const input = { layout, streams, ghost, particles: particles.current, size, still: reducedMotion };
    if (reducedMotion) {
      paintField(ctx, { ...input, time: 0, dt: 0 });
      return;
    }
    let raf = 0;
    let last = 0;
    let start = 0;
    const frame = (now: number) => {
      if (!start) start = now;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      // A slow machine draws every other frame.
      if (!lowPerformance || !last || now - last >= 33) {
        paintField(ctx, { ...input, time: (now - start) / 1000, dt });
        last = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [streams, layout, ghost, size, reducedMotion, lowPerformance]);

  if (!twin || streams.length === 0) return null;

  // Names at the end of each stream, kept from overlapping. The offer sits under the stream it branches from.
  const preferred = evaluation?.preferredScenarioId;
  const endYs = [...streams.map((s) => streamPoint(layout, s, MONTH_MAX).y), ...(offer && from ? [streamPoint(layout, from, MONTH_MAX).y + 40] : [])];
  const tagYs = spreadLabels(endYs, 62, 30, Math.max(60, size.height - 46));

  // Decisions as small labels on their stream, kept from overlapping each other.
  const decisions = streams.flatMap((s) => s.decisions.map((e) => ({ s, e, ...streamPoint(layout, s, e.month) })));
  const levels = assignLevels(decisions.map((d) => ({ id: `${d.s.id}/${d.e.id}`, x: d.x })), 150);

  const summary = streams.map((s) => [s.name, streamWords(s, streams)].filter(Boolean).join(", ")).join(". ");

  return (
    <section aria-label="Your futures" data-testid="future-field" className={cn("relative w-full", className)}>
      <p className="sr-only">{summary}</p>
      <div ref={setNode} className="relative w-full select-none" style={{ height: "clamp(300px, 46vh, 460px)" }}>
        <canvas ref={canvasRef} aria-hidden="true" data-testid="future-canvas" className="pointer-events-none absolute inset-0 h-full w-full" style={{ width: "100%", height: "100%" }} />

        {/* time, along the bottom */}
        {YEAR_TICKS.map((m) => (
          <span key={m} aria-hidden="true" className="pointer-events-none absolute -translate-x-1/2 text-xs text-ink/55" style={{ left: layout.x(m), bottom: 6 }}>
            {yearLabel(m)}
          </span>
        ))}

        {/* what you told Fork, on the stream it bent */}
        {decisions.map(({ s, e, x, y }) => {
          const id = `${s.id}/${e.id}`;
          let off = levelOffset(levels.get(id) ?? 0, 30, 40);
          if (off < 0 && y + off < 6) off = -off;
          if (off > 0 && y + off > size.height - 56) off = -off;
          const Icon = EVENT_ICON[e.type];
          return (
            <div
              key={id}
              data-testid="field-decision"
              className="pointer-events-none absolute z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-canvas/80 px-2.5 py-1 text-xs whitespace-nowrap text-ink backdrop-blur-sm"
              style={{ left: Math.min(Math.max(x, 96), size.width - (wide ? TAG_WIDTH : 0) - 40), top: y + off, transform: `translate(-50%, ${off < 0 ? "-100%" : "0"})` }}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="font-medium">{eventTitle(e)}</span>
              <span className="text-ink/60">{e.month === 0 ? "now" : `in ${monthLabel(e.month)}`}</span>
            </div>
          );
        })}

        {/* the futures, named where they end */}
        <ul className={cn(wide ? "contents" : "absolute inset-x-0 bottom-7 flex flex-col gap-1 px-4")}>
          {streams.map((s, i) => (
            <li key={s.id} className={cn(wide && "absolute z-20")} style={wide ? { left: layout.plotLeft + layout.plotWidth + 16, top: tagYs[i], transform: "translateY(-50%)", width: TAG_WIDTH - 24 } : undefined}>
              <StreamTag stream={s} words={streamWords(s, streams)} pick={preferred === s.id} onSelect={() => setActiveScenario(s.id)} />
            </li>
          ))}
          {offer && from && (
            <li className={cn(wide && "absolute z-20")} style={wide ? { left: layout.plotLeft + layout.plotWidth + 16, top: tagYs[streams.length], transform: "translateY(-50%)", width: TAG_WIDTH - 24 } : undefined}>
              <button
                type="button"
                data-testid="field-offer"
                disabled={busy !== "idle"}
                onClick={() => void openReplaceComparison()}
                className="w-full cursor-pointer rounded-lg border border-dashed border-ink/40 px-3 py-2 text-left transition-colors hover:border-ink hover:bg-ink/10 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span className="block text-sm font-medium text-ink">
                  Switch to a {offer.year} {offer.model} {offer.trim}?
                </span>
                <span className="block text-xs text-ink/60">Tap to see how it compares</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

function StreamTag({ stream, words, pick, onSelect }: { stream: Stream; words: string | null; pick: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      data-testid="field-tag"
      data-stream-id={stream.id}
      aria-pressed={stream.active}
      onClick={onSelect}
      className={cn(
        "w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        stream.active ? "bg-ink/15" : "hover:bg-ink/10",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cn("text-sm font-medium", stream.active ? "text-ink" : "text-ink/80")}>{stream.name}</span>
        {pick && <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium whitespace-nowrap text-canvas">Fork&apos;s pick</span>}
      </span>
      {words && <span className="block text-xs text-ink/60">{words}</span>}
    </button>
  );
}
