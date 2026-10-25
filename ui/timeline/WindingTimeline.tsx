"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, GitBranch } from "lucide-react";
import type { Source, VehicleConfig } from "@/contracts";
import { cn } from "@/lib/utils";
import type { Tradeoff, Leader } from "@/ui/compare/tradeoff";
import { useTradeoff } from "@/ui/compare/useTradeoff";
import { data, sim } from "@/ui/mocks";
import { customerText } from "@/ui/profile/customerText";
import { monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { IconButton } from "@/ui/shell/IconButton";
import { specsFor } from "@/ui/store/selectors";
import { MONTH_MAX } from "@/ui/store/months";
import { useForkStore } from "@/ui/store/useForkStore";
import { decisionsOf, pointAt } from "./layout";
import { effectPhrase } from "./roadMath";
import { buildForkOptions, buildSteps, numberedCount, pad2, swapOf, type ForkOption, type Step, type Swap } from "./steps";
import { useDecisionEffects } from "./useDecisionEffects";
import { useElementSize } from "./useElementSize";
import { ENDPOINT_GAP, ENDPOINT_H, ENDPOINT_W, MIN_HEIGHT, NODE_R, layoutWinding } from "./windingMath";

const LABEL_GAP = 12;

/** How tall the path is. Expanded gives it the page. */
export const timelineHeight = (expanded: boolean): string => (expanded ? "clamp(400px, calc(100dvh - 30rem), 640px)" : `${MIN_HEIGHT}px`);

/**
 * The event area never changes height, whatever step is open, so the page stays still while you move along the path.
 * The area is at least this tall; the text inside has a fixed box of its own and scrolls if it ever outgrows it.
 */
export const DETAIL_MIN_HEIGHT = "min-h-[340px]";
const DETAIL_BODY_HEIGHT = "h-[22rem] md:h-[15.5rem]";

/**
 * Your next five years as a winding path: one numbered step for each thing you told Fork, in order, and then a choice
 * (keep or switch). The route is only events and choices. Everything about an event, what it does and why, is in the
 * area under it, which is the one home for details.
 */
export function WindingTimeline({ expanded = false }: { expanded?: boolean }) {
  const twin = useForkStore((s) => s.twin);
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const results = useForkStore((s) => s.results);
  const activeId = useForkStore((s) => s.activeScenarioId);
  const comparison = useForkStore((s) => s.comparison);
  const replacement = useForkStore((s) => s.replacementVehicle);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const busy = useForkStore((s) => s.ui.busy);
  const { setActiveScenario, openReplaceComparison } = useForkStore((s) => s.actions);
  const tradeoff = useTradeoff();

  const [setNode, size] = useElementSize<HTMLDivElement>({ width: 960, height: MIN_HEIGHT });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const stepRefs = useRef(new Map<string, HTMLButtonElement>());
  const samples = useMemo(() => data.listSampleVehicles(), []);

  // The life you described is the keep future. Once you compare, that is the one the path shows, whichever car you are viewing.
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];
  const keep = comparison ? scenarios.find((s) => s.id === comparison.keepId) : undefined;
  const scenario = comparison && keep && (activeId === comparison.keepId || activeId === comparison.replaceId) ? keep : active;
  const effects = useDecisionEffects(scenario);

  const vehicle = twin?.vehicle;
  const other = replacement ?? (vehicle ? samples.find((v) => v.id !== vehicle.id) : undefined);

  // When the swap happens in the switch future: the compared future's own date, else the date the model would pick.
  const swap = useMemo<Swap | null>(() => {
    if (!scenario) return null;
    const compared = comparison ? scenarios.find((s) => s.id === comparison.replaceId) : undefined;
    if (compared) return swapOf(compared);
    if (!other) return null;
    try {
      return swapOf(sim.makeReplaceScenario(scenario, other));
    } catch {
      return null; // no date is better than a guessed one
    }
  }, [scenario, comparison, scenarios, other]);

  const steps = useMemo(
    () => (vehicle && scenario ? buildSteps({ decisions: decisionsOf(scenario), effects, startTitle: `Your ${vehicle.year} ${vehicle.model}` }) : []),
    [vehicle, scenario, effects],
  );
  const options = useMemo(
    () => (vehicle && scenario ? buildForkOptions({ keepVehicle: vehicle, other, comparison, keepScenarioId: scenario.id, swapMonth: swap?.month }) : []),
    [vehicle, scenario, other, comparison, swap],
  );
  const total = numberedCount(steps);
  const layout = useMemo(() => layoutWinding(total, size), [total, size]);

  const index = Math.max(0, steps.findIndex((s) => s.key === selectedKey));
  const step = steps[index];

  // Keep the chosen step in view when the path is wider than the screen.
  const stepKey = step?.key;
  useEffect(() => {
    if (stepKey) stepRefs.current.get(stepKey)?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [stepKey]);

  if (!twin || !vehicle || !scenario || steps.length === 0 || !step) return null;

  const netCostSource = (scenarioId: string | undefined): Source | undefined => {
    const point = pointAt(results[scenarioId ?? ""], MONTH_MAX);
    return metricSource("netEconomicCost", profile, specsFor(point?.vehicleId ?? vehicle.id));
  };

  const choose = (key: string, focus = false) => {
    setSelectedKey(key);
    if (focus) stepRefs.current.get(key)?.focus();
  };
  const go = (to: number) => {
    const next = steps[Math.max(0, Math.min(steps.length - 1, to))];
    if (next) choose(next.key, true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? steps.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    go(to);
  };

  // Keeping always goes up and switching down, so the route never rearranges itself. The engine's pick is not drawn here.
  const [up, down] = options;
  const viewing = (o: ForkOption | undefined) => o !== undefined && o.scenarioId !== null && o.scenarioId === activeId;
  const pickOption = (o: ForkOption) => {
    if (o.scenarioId) setActiveScenario(o.scenarioId);
    else void openReplaceComparison();
  };
  const disabled = (o: ForkOption) => busy !== "idle" || (!o.scenarioId && !results[scenario.id]);

  const stroke = (o: ForkOption | undefined) =>
    o?.dashed ? { width: 2, dash: "5 8", cls: "stroke-ink/45" } : viewing(o) ? { width: 3, dash: undefined, cls: "stroke-ink" } : { width: 2, dash: undefined, cls: "stroke-ink/60" };
  const upStroke = stroke(up);
  const downStroke = stroke(down);

  return (
    <section aria-label="Your timeline" data-testid="winding-timeline" data-expanded={expanded}>
      <div ref={setNode} data-testid="winding-scroll" className="relative w-full overflow-x-auto overflow-y-hidden" style={{ height: timelineHeight(expanded) }}>
        <div className="relative" style={{ width: layout.contentWidth, height: layout.height }}>
          <svg aria-hidden="true" width={layout.contentWidth} height={layout.height} viewBox={`0 0 ${layout.contentWidth} ${layout.height}`} className="pointer-events-none absolute inset-0">
            {down && <path d={layout.downPath} data-testid="path-down" data-dashed={down.dashed} data-selected={viewing(down)} fill="none" strokeWidth={downStroke.width} strokeLinecap="round" strokeDasharray={downStroke.dash} className={downStroke.cls} />}
            {up && <path d={layout.upPath} data-testid="path-up" data-dashed={up.dashed} data-selected={viewing(up)} fill="none" strokeWidth={upStroke.width} strokeLinecap="round" strokeDasharray={upStroke.dash} className={upStroke.cls} />}
            <path d={layout.path} data-testid="path-main" pathLength={1} fill="none" strokeWidth={2} strokeLinecap="round" className="fork-draw stroke-ink" />
          </svg>

          <div
            aria-hidden="true"
            data-testid="fork-divider"
            className="pointer-events-none absolute w-px bg-ink/25"
            style={{ left: layout.divider.x, top: layout.divider.top, height: layout.divider.bottom - layout.divider.top }}
          />

          {steps.map((s, i) => {
            const fork = s.kind === "fork";
            const p = fork ? layout.fork : layout.steps[i];
            const selected = s.key === step.key;
            return (
              <div key={s.key}>
                <button
                  ref={(el) => {
                    if (el) stepRefs.current.set(s.key, el);
                    else stepRefs.current.delete(s.key);
                  }}
                  type="button"
                  data-testid="step"
                  data-step-key={s.key}
                  aria-current={selected ? "step" : undefined}
                  aria-label={fork ? "Your choice: keep or switch" : `Step ${s.number} of ${total}: ${s.title}, ${s.when.toLowerCase()}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(s.key)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={cn(
                    "absolute z-10 flex items-center justify-center rounded-full border text-sm tabular-nums transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    fork && "border-2",
                    selected ? "border-ink bg-ink text-canvas" : "border-ink/60 bg-canvas text-ink hover:border-ink",
                  )}
                  style={{ left: p.x - NODE_R, top: p.y - NODE_R, width: NODE_R * 2, height: NODE_R * 2 }}
                >
                  {fork ? <GitBranch aria-hidden="true" className="size-5" /> : pad2(s.number ?? 0)}
                </button>
                <StepLabel step={s} x={p.x} y={p.y} above={p.above} width={fork ? 140 : layout.dx - 24} />
              </div>
            );
          })}

          {up && <ForkEnd option={up} x={layout.upEnd.x} y={layout.upEnd.y} pressed={viewing(up)} disabled={disabled(up)} onPick={() => pickOption(up)} />}
          {down && <ForkEnd option={down} x={layout.downEnd.x} y={layout.downEnd.y} pressed={viewing(down)} disabled={disabled(down)} onPick={() => pickOption(down)} />}
        </div>
      </div>

      <StepDetail
        step={step}
        total={total}
        effectSource={netCostSource(scenario.id)}
        keepName={vehicle.model}
        other={other}
        carName={`${vehicle.year} ${vehicle.model}`}
        tradeoff={tradeoff}
        swap={swap}
        onPrev={() => go(index - 1)}
        onNext={() => go(index + 1)}
        hasPrev={index > 0}
        hasNext={index < steps.length - 1}
      />
    </section>
  );
}

/** What the route says about a step: when, and what. Nothing else; the rest is in the event area. */
function StepLabel({ step, x, y, above, width }: { step: Step; x: number; y: number; above: boolean; width: number }) {
  return (
    <div
      data-testid="step-label"
      className="pointer-events-none absolute text-left"
      style={{ left: x - NODE_R, width, top: above ? y - NODE_R - LABEL_GAP : y + NODE_R + LABEL_GAP, transform: above ? "translateY(-100%)" : undefined }}
    >
      {step.kind === "fork" ? (
        <p className="text-lg leading-tight font-medium text-ink">{step.when}</p>
      ) : (
        <>
          <p className="text-xs text-ink/60">{step.when}</p>
          <p className="mt-0.5 line-clamp-2 text-lg leading-tight font-medium text-ink">{step.title}</p>
        </>
      )}
    </div>
  );
}

/** Both ends of the fork are this one control: same size, border, padding and type. Only the pressed state differs. */
function ForkEnd({ option, x, y, pressed, disabled, onPick }: { option: ForkOption; x: number; y: number; pressed: boolean; disabled: boolean; onPick(): void }) {
  return (
    <button
      type="button"
      data-testid="fork-end"
      data-option={option.id}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "absolute z-10 flex cursor-pointer flex-col justify-center gap-1 rounded-lg border border-line px-4 py-3 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-60",
        pressed ? "bg-ink text-canvas" : "text-ink hover:bg-ink/10",
      )}
      style={{ left: x + ENDPOINT_GAP, top: y - ENDPOINT_H / 2, width: ENDPOINT_W, height: ENDPOINT_H }}
    >
      <span className="line-clamp-2 text-lg leading-tight font-medium">{option.title}</span>
      {option.timing && <span className="text-sm opacity-70">{option.timing}</span>}
    </button>
  );
}

const LEADER_ROWS: Record<Leader, (keepName: string, switchName: string) => string> = {
  keep: (keepName) => `Keeping the ${keepName}`,
  switch: (_keepName, switchName) => `The ${switchName}`,
  level: () => "Level",
};

function Section({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={testId} className="min-w-0">
      <p id={id} className="text-sm text-ink/60">
        {label}
      </p>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-6 text-ink/70">{children}</div>
    </section>
  );
}

function StepDetail(p: {
  step: Step;
  total: number;
  effectSource: Source | undefined;
  keepName: string;
  other: VehicleConfig | undefined;
  carName: string;
  tradeoff: Tradeoff | null;
  swap: Swap | null;
  onPrev(): void;
  onNext(): void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const { step, tradeoff, swap } = p;
  const effect = step.effect;
  const span = monthLabel(MONTH_MAX);
  const switchName = p.other?.model ?? "other car";
  const said = step.event?.quote;
  const assumptions = step.event?.assumptions ?? [];
  const inferred = step.event?.certainty === "inferred";

  return (
    <div data-testid="step-detail" aria-live="polite" className={cn("mt-6 flex flex-col border-t border-line pt-8", DETAIL_MIN_HEIGHT)}>
      <div data-testid="step-detail-body" className={cn("overflow-y-auto", DETAIL_BODY_HEIGHT)}>
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div aria-hidden="true" className="text-[56px] leading-none font-light tracking-tight text-ink/90 tabular-nums">
            {step.kind === "fork" ? <GitBranch className="size-14" strokeWidth={1} /> : pad2(step.number ?? 0)}
          </div>

          <Section label="Selected event" testId="detail-event">
            <p className="text-sm text-ink/60">{step.when}</p>
            <h3 data-testid="step-title" className="-mt-1 text-[28px] leading-tight font-medium tracking-tight text-ink">
              {step.title}
            </h3>
          </Section>

          <Section label="Effect" testId="detail-effect">
            {step.kind === "decision" && (
              <>
                {effect ? (
                  Math.round(effect.costDelta) !== 0 ? (
                    <p data-testid="step-effect" className="flex flex-wrap items-center gap-2 text-ink">
                      {effectPhrase(effect.costDelta, usd)} over {span}
                      <SourceBadge compact source={p.effectSource} />
                    </p>
                  ) : (
                    <p data-testid="step-effect" className="text-ink">
                      No change to cost.
                    </p>
                  )
                ) : (
                  <p data-testid="step-effect" className="text-ink">
                    Not worked out yet.
                  </p>
                )}
                {effect?.fitNote && <p>{effect.fitNote}.</p>}
              </>
            )}
            {step.kind === "start" && (
              <p data-testid="step-effect" className="text-ink">
                Where you start
              </p>
            )}
            {step.kind === "fork" &&
              (tradeoff ? (
                <ul data-testid="tradeoff-rows" className="divide-y divide-line">
                  {tradeoff.rows.map((r) => (
                    <li key={r.key} data-factor={r.key} data-leader={r.leader} className="flex items-baseline justify-between gap-4 py-1.5 first:pt-0">
                      <span>{customerText(r.label)}</span>
                      <span className="text-right text-ink">{LEADER_ROWS[r.leader](p.keepName, switchName)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p data-testid="tradeoff-empty" className="text-ink">
                  Compare with the {switchName} to see the tradeoff.
                </p>
              ))}
          </Section>

          <Section label="Explanation" testId="detail-explanation">
            {step.kind === "decision" && (
              <>
                {said && <p className="italic text-ink/60">&ldquo;{said}&rdquo;</p>}
                {assumptions.length > 0 && (
                  <ul data-testid="step-assumptions" className="flex flex-col gap-1">
                    {assumptions.map((a) => (
                      <li key={a}>{customerText(a)}</li>
                    ))}
                  </ul>
                )}
                {inferred && <p>Fork worked this out from what you said.</p>}
                {!said && assumptions.length === 0 && !inferred && <p>Nothing to add.</p>}
              </>
            )}
            {step.kind === "start" && <p>Everything after this is what you have told Fork is changing.</p>}
            {step.kind === "fork" && (
              <>
                {tradeoff?.sentence && <p data-testid="tradeoff-sentence">{customerText(tradeoff.sentence)}</p>}
                {swap ? (
                  <p data-testid="swap-timing" className="flex flex-wrap items-center gap-2">
                    The swap is modeled in {monthLabel(swap.month)} in the Switch future.
                    <SourceBadge compact source={swap.source} />
                  </p>
                ) : (
                  !tradeoff?.sentence && <p>Keep your {p.carName}, or explore a switch.</p>
                )}
              </>
            )}
          </Section>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-ink/60" data-testid="step-count">
          {step.number === null ? "Your choice" : `${step.number} of ${p.total}`}
        </p>
        <div className="flex items-center gap-2">
          <IconButton label="Previous step" onClick={p.onPrev} disabled={!p.hasPrev} className="disabled:opacity-30">
            <ChevronLeft />
          </IconButton>
          <IconButton label="Next step" onClick={p.onNext} disabled={!p.hasNext} className="disabled:opacity-30">
            <ChevronRight />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
