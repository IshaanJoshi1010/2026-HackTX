"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Source } from "@/contracts";
import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";
import { monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { Stat } from "@/ui/profile/Stat";
import { IconButton } from "@/ui/shell/IconButton";
import { specsFor } from "@/ui/store/selectors";
import { MONTH_MAX } from "@/ui/store/months";
import { BASE_ID, useForkStore } from "@/ui/store/useForkStore";
import { decisionsOf, pointAt } from "./layout";
import { effectPhrase } from "./roadMath";
import { buildForkOptions, buildSteps, costWords, pad2, type ForkOption, type Step } from "./steps";
import { useDecisionEffects } from "./useDecisionEffects";
import { useElementSize } from "./useElementSize";
import { NODE_R, layoutWinding } from "./windingMath";

const LABEL_GAP = 12;

/** How tall the path is. Expanded gives it the page. */
export const timelineHeight = (expanded: boolean): string => (expanded ? "clamp(400px, calc(100dvh - 30rem), 640px)" : "340px");

/**
 * Your next five years as a winding path: one numbered step for each thing you told Fork, in order, and then a fork
 * where you choose. Tap a step for what it does. The path is the story; the cost behind it is on the card below, with
 * where it comes from. The month by month cost is one option away (Details).
 */
export function WindingTimeline({ expanded = false }: { expanded?: boolean }) {
  const twin = useForkStore((s) => s.twin);
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const results = useForkStore((s) => s.results);
  const activeId = useForkStore((s) => s.activeScenarioId);
  const comparison = useForkStore((s) => s.comparison);
  const evaluation = useForkStore((s) => s.evaluation);
  const replacement = useForkStore((s) => s.replacementVehicle);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const busy = useForkStore((s) => s.ui.busy);
  const { setActiveScenario, openReplaceComparison } = useForkStore((s) => s.actions);

  const [setNode, size] = useElementSize<HTMLDivElement>({ width: 960, height: 360 });
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

  const steps = useMemo(
    () => (vehicle && scenario ? buildSteps({ decisions: decisionsOf(scenario), effects, startTitle: `Your ${vehicle.year} ${vehicle.model}` }) : []),
    [vehicle, scenario, effects],
  );
  const options = useMemo(
    () => (vehicle && scenario ? buildForkOptions({ keepVehicle: vehicle, other, comparison, evaluation, keepScenarioId: scenario.id }) : []),
    [vehicle, scenario, other, comparison, evaluation],
  );
  const layout = useMemo(() => layoutWinding(steps.length, size), [steps.length, size]);

  const index = Math.max(0, steps.findIndex((s) => s.key === selectedKey));
  const step = steps[index];

  // Keep the chosen step in view when the path is wider than the screen.
  const stepKey = step?.key;
  useEffect(() => {
    if (stepKey) stepRefs.current.get(stepKey)?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [stepKey]);

  if (!twin || !vehicle || !scenario || steps.length === 0 || !step) return null;

  const costAt = (scenarioId: string | null | undefined): { value: number; source: Source | undefined } | null => {
    const point = scenarioId ? pointAt(results[scenarioId], MONTH_MAX) : undefined;
    return point ? { value: point.netEconomicCost, source: metricSource("netEconomicCost", profile, specsFor(point.vehicleId)) } : null;
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

  // The recommended way goes up. With no pick, keeping goes up and the other car goes down.
  const up = options.find((o) => o.tag === "Recommended") ?? options[0];
  const down = options.find((o) => o !== up);
  const pickOption = (o: ForkOption) => {
    if (o.scenarioId) setActiveScenario(o.scenarioId);
    else void openReplaceComparison();
  };

  return (
    <section aria-label="Your timeline" data-testid="winding-timeline" data-expanded={expanded}>
      <div ref={setNode} data-testid="winding-scroll" className="relative w-full overflow-x-auto overflow-y-hidden" style={{ height: timelineHeight(expanded) }}>
        <div className="relative" style={{ width: layout.contentWidth, height: layout.height }}>
          <svg aria-hidden="true" width={layout.contentWidth} height={layout.height} viewBox={`0 0 ${layout.contentWidth} ${layout.height}`} className="pointer-events-none absolute inset-0">
            {down && <path d={layout.downPath} data-testid="path-down" data-dashed={down.dashed} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={down.dashed ? "5 8" : undefined} className={down.dashed ? "stroke-ink/45" : "stroke-ink"} />}
            {up && <path d={layout.upPath} data-testid="path-up" data-dashed={up.dashed} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={up.dashed ? "5 8" : undefined} className={up.dashed ? "stroke-ink/45" : "stroke-ink"} />}
            <path d={layout.path} data-testid="path-main" pathLength={1} fill="none" strokeWidth={2} strokeLinecap="round" className="fork-draw stroke-ink" />
          </svg>

          {steps.map((s, i) => {
            const p = layout.steps[i];
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
                  aria-label={`Step ${s.number} of ${steps.length}: ${s.title}, ${s.when.toLowerCase()}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(s.key)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={cn(
                    "absolute z-10 flex items-center justify-center rounded-full border text-xs tabular-nums transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    selected ? "border-ink bg-ink text-canvas" : "border-ink/60 bg-canvas text-ink hover:border-ink",
                  )}
                  style={{ left: p.x - NODE_R, top: p.y - NODE_R, width: NODE_R * 2, height: NODE_R * 2 }}
                >
                  {pad2(s.number)}
                </button>
                <StepLabel step={s} x={p.x} y={p.y} above={p.above} width={layout.dx - 24} />
              </div>
            );
          })}

          {[up, down].map((o, i) =>
            o ? (
              <ForkEnd
                key={o.id}
                option={o}
                x={(i === 0 ? layout.upEnd : layout.downEnd).x}
                y={(i === 0 ? layout.upEnd : layout.downEnd).y}
                above={i === 0}
                pressed={o.scenarioId !== null && o.scenarioId === activeId}
                disabled={busy !== "idle" || (!o.scenarioId && !results[scenario.id])}
                onPick={() => pickOption(o)}
              />
            ) : null,
          )}
        </div>
      </div>

      <StepDetail
        step={step}
        total={steps.length}
        scenarioName={scenario.name}
        keepCost={costAt(scenario.id)}
        baseCost={costAt(BASE_ID)}
        options={options}
        costOf={costAt}
        carName={`${vehicle.year} ${vehicle.model}`}
        onPrev={() => go(index - 1)}
        onNext={() => go(index + 1)}
        hasPrev={index > 0}
        hasNext={index < steps.length - 1}
      />
    </section>
  );
}

function StepLabel({ step, x, y, above, width }: { step: Step; x: number; y: number; above: boolean; width: number }) {
  const sub =
    step.kind === "start" ? "Where you start"
    : step.kind === "fork" ? "Keep or switch"
    : step.effect ? costWords(step.effect.costDelta)
    : null;
  return (
    <div
      data-testid="step-label"
      className="pointer-events-none absolute text-left"
      style={{ left: x - NODE_R, width, top: above ? y - NODE_R - LABEL_GAP : y + NODE_R + LABEL_GAP, transform: above ? "translateY(-100%)" : undefined }}
    >
      <p className="text-xs text-ink/60">{step.when}</p>
      <p className="mt-0.5 text-base leading-tight font-medium text-ink">{step.title}</p>
      {sub && <p className="mt-1 text-xs text-ink/60">{sub}</p>}
    </div>
  );
}

function ForkEnd({ option, x, y, above, pressed, disabled, onPick }: { option: ForkOption; x: number; y: number; above: boolean; pressed: boolean; disabled: boolean; onPick(): void }) {
  return (
    <button
      type="button"
      data-testid="fork-end"
      data-option={option.id}
      aria-pressed={option.scenarioId ? pressed : undefined}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "absolute z-10 w-[200px] cursor-pointer rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink/10 disabled:cursor-default disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        pressed && "bg-ink/10",
      )}
      style={{ left: x + 8, top: above ? y - 12 : y + 12, transform: above ? "translateY(-100%)" : undefined }}
    >
      <span className="block text-base leading-tight font-medium text-ink">{option.title}</span>
      <span className={cn("mt-1 block text-xs", option.tag === "Recommended" ? "text-ink" : "text-ink/60")}>
        {option.tag ?? (option.scenarioId ? "Your plan" : "Tap to compare")}
      </span>
    </button>
  );
}

function StepDetail(p: {
  step: Step;
  total: number;
  scenarioName: string;
  keepCost: { value: number; source: Source | undefined } | null;
  baseCost: { value: number; source: Source | undefined } | null;
  options: ForkOption[];
  costOf(id: string | null | undefined): { value: number; source: Source | undefined } | null;
  carName: string;
  onPrev(): void;
  onNext(): void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const { step } = p;
  const effect = step.effect;
  const costs = effect ? Math.round(effect.costDelta) !== 0 : false;
  const keepOption = p.options.find((o) => o.id === "keep");
  const replaceOption = p.options.find((o) => o.id === "replace");
  const keepCost = p.costOf(keepOption?.scenarioId);
  const replaceCost = p.costOf(replaceOption?.scenarioId);
  const span = monthLabel(MONTH_MAX);

  return (
    <div data-testid="step-detail" aria-live="polite" className="mt-6 border-t border-line pt-8">
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-[auto_1fr_auto]">
        <p aria-hidden="true" className="text-[56px] leading-none font-light tracking-tight text-ink/90 tabular-nums">
          {pad2(step.number)}
        </p>

        <div className="min-w-0">
          <p className="text-sm text-ink/60">{step.when}</p>
          <h3 data-testid="step-title" className="mt-1 text-[28px] leading-tight font-medium tracking-tight text-ink">
            {step.title}
          </h3>

          {step.kind === "decision" && (
            <div className="mt-3 flex flex-col gap-2 text-sm leading-6 text-ink/70">
              {step.event?.quote && <p className="italic text-ink/60">&ldquo;{step.event.quote}&rdquo;</p>}
              {effect ? (
                costs ? (
                  <p data-testid="step-effect" className="flex flex-wrap items-center gap-2 text-ink">
                    {effectPhrase(effect.costDelta, usd)} over {span}
                    <SourceBadge compact source={p.keepCost?.source} />
                  </p>
                ) : (
                  <p data-testid="step-effect" className="text-ink">
                    No change to cost.
                  </p>
                )
              ) : null}
              {effect?.fitNote && <p>{effect.fitNote}.</p>}
              {step.event?.certainty === "inferred" && <p>Fork worked this out from what you said.</p>}
              {step.event?.assumptions.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </div>
          )}

          {step.kind === "start" && <p className="mt-3 text-sm leading-6 text-ink/70">Everything after this is what you have told Fork is changing.</p>}

          {step.kind === "fork" && (
            <div className="mt-3 flex flex-col gap-2 text-sm leading-6 text-ink/70">
              <p>
                Keep your {p.carName}
                {replaceOption ? `, or ${replaceOption.scenarioId ? "switch" : "explore a switch"}.` : "."}
                {replaceOption && !replaceOption.scenarioId && " Tap the dashed path to compare them."}
              </p>
              {keepCost && replaceCost && (
                <p data-testid="fork-difference" className="flex flex-wrap items-center gap-2 text-ink">
                  Switching {replaceCost.value - keepCost.value >= 0 ? "adds" : "saves"} {usd(Math.abs(Math.round(replaceCost.value - keepCost.value)))} over {span}
                  <SourceBadge compact source={replaceCost.source} />
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-start gap-10 md:justify-end">
          {step.kind === "fork" && keepOption && replaceOption?.scenarioId ? (
            <>
              {keepCost && <Stat size="md" label={`Keep, net cost over ${span}`} value={usd(keepCost.value)} source={keepCost.source} />}
              {replaceCost && <Stat size="md" label={`Switch, net cost over ${span}`} value={usd(replaceCost.value)} source={replaceCost.source} />}
            </>
          ) : (
            (() => {
              const c = step.kind === "start" ? p.baseCost : p.keepCost;
              return c ? <Stat size="md" label={step.kind === "start" ? `If nothing changes, over ${span}` : `Net cost over ${span}`} value={usd(c.value)} source={c.source} /> : null;
            })()
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm text-ink/60" data-testid="step-count">
          {step.number} of {p.total}
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
