"use client";

import type { ReactNode } from "react";
import type { DriverProfile } from "@/contracts";
import { ComparisonChange, useComparison } from "@/ui/compare/ComparisonSection";
import type { FactorKey, Leader, Tradeoff, TradeoffRow } from "@/ui/compare/tradeoff";
import { useTradeoff } from "@/ui/compare/useTradeoff";
import { robustnessLine, verdictHeadline } from "@/ui/compare/Verdict";
import { WhyPanel } from "@/ui/compare/WhyPanel";
import { customerText } from "@/ui/profile/customerText";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { useForkStore } from "@/ui/store/useForkStore";
import type { Journey } from "./types";

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** How the five priorities read in a sentence. The same words as the tradeoff rows, lower case. */
const PRIORITY_WORDS: Record<keyof DriverProfile["priorities"], string> = {
  cost: "cost",
  fuel: "fuel use",
  longevity: "life left",
  family: "family fit",
  comfort: "comfort",
};
const PRIORITY_ORDER: Array<keyof DriverProfile["priorities"]> = ["cost", "fuel", "longevity", "family", "comfort"];
/** Weights closer than this count as the same. */
const SAME = 0.02;

/**
 * The confirmed priority weights, said in words. Never a percentage: it names what matters most, and says so when
 * everything counts the same. Pure.
 */
export function prioritiesInWords(priorities: DriverProfile["priorities"]): string {
  const entries = PRIORITY_ORDER.map((key) => ({ key, weight: Number.isFinite(priorities[key]) ? priorities[key] : 0 }));
  const max = Math.max(...entries.map((e) => e.weight));
  const min = Math.min(...entries.map((e) => e.weight));
  if (max - min < SAME) return "You weighted all five equally.";

  const top = entries.filter((e) => max - e.weight < SAME);
  const rest = entries.filter((e) => max - e.weight >= SAME);
  const verb = (n: number) => (n === 1 ? "matters" : "matter");
  const names = (group: typeof entries) => cap(list(group.map((e) => PRIORITY_WORDS[e.key])));
  const first = `${names(top)} ${verb(top.length)} most.`;

  const low = rest.filter((e) => e.weight - min < SAME);
  // The least important ones are worth a line only when they are a few and there is something in between.
  if (low.length > 0 && low.length < rest.length && low.length <= 2) return `${first} ${names(low)} ${verb(low.length)} least.`;
  if (rest.length >= 2 && rest.every((e) => e.weight - min < SAME)) return `${first} The rest count about the same.`;
  return first;
}

/**
 * When one car costs less but the engine calls it a close call, the other things that balance it, taken from the
 * engine's own per priority rows. Null when there is nothing to say: no close call, no cost gap, or the dearer car is
 * not actually ahead on anything else (a reason is never made up).
 */
export function balanceSentence(a: {
  closeCall: boolean;
  /** Switching minus keeping, from the journey. Positive means keeping costs less. */
  differenceAmount: number | null;
  rows: TradeoffRow[];
  keepName: string;
  switchName: string;
}): string | null {
  const { closeCall, differenceAmount, rows, keepName, switchName } = a;
  if (!closeCall || differenceAmount === null || differenceAmount === 0) return null;
  const cheaper: Leader = differenceAmount > 0 ? "keep" : "switch";
  const dearer: Leader = cheaper === "keep" ? "switch" : "keep";
  const ahead = rows.filter((r) => r.key !== "cost" && r.leader === dearer).map((r) => r.label.toLowerCase());
  if (ahead.length === 0) return null;
  const cheapName = cheaper === "keep" ? keepName : switchName;
  const dearName = dearer === "keep" ? keepName : switchName;
  return `${cap(cheapName)} costs less over five years, but ${dearName} is ahead on ${list(ahead)}, so the other factors balance it out.`;
}

const ROW_ORDER: FactorKey[] = ["cost", "fuel", "longevity", "family", "comfort"];

function Section({ title, children, testId }: { title?: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="flex flex-col gap-3">
      {title && <h3 className="text-base font-medium text-ink">{title}</h3>}
      {children}
    </section>
  );
}

function TradeoffRows({ tradeoff, keepName, switchName }: { tradeoff: Tradeoff; keepName: string; switchName: string }) {
  const rows = [...tradeoff.rows].sort((a, b) => ROW_ORDER.indexOf(a.key) - ROW_ORDER.indexOf(b.key));
  const who = (leader: Leader) => (leader === "keep" ? `${cap(keepName)} is ahead` : leader === "switch" ? `${cap(switchName)} is ahead` : "About level");
  return (
    <ul data-testid="tradeoff-rows" className="border-t border-line">
      {rows.map((row) => (
        <li key={row.key} data-testid="tradeoff-row" data-factor={row.key} data-leader={row.leader} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
          <span className="text-base text-ink">{row.label}</span>
          <span className="text-base text-ink/70">{who(row.leader)}</span>
        </li>
      ))}
    </ul>
  );
}

const quietButton =
  "w-fit border-b border-ink/40 pb-0.5 text-base text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

/**
 * The body of the recommendation drawer: why the engine came out the way it did. All of it is the engine's own output
 * (the verdict, the per priority rows, the rationale, the break-even), in words. Nothing here is a new number and no
 * reason is invented.
 *
 * Without a comparison there is nothing to explain, so it says so in a line and offers to compare.
 */
export function RecommendationContent({ journey }: { journey: Journey }) {
  const c = useComparison();
  const tradeoff = useTradeoff();
  const priorities = useForkStore((s) => s.explore.confirmedProfile.priorities);
  const explanation = useForkStore((s) => s.explanation);
  const breakEven = useForkStore((s) => s.breakEven);
  const busy = useForkStore((s) => s.ui.busy);
  const { openReplaceComparison, runBreakEven } = useForkStore((s) => s.actions);

  if (!c) {
    const model = journey.switch?.endVehicle?.model;
    return (
      <div data-testid="recommendation-empty" className="flex flex-col items-start gap-4">
        <p className="text-base leading-7 text-ink/70">
          Compare the two cars and Fork weighs them on what matters to you, or calls it close.
        </p>
        {journey.switch && (
          <button
            type="button"
            disabled={busy !== "idle"}
            onClick={() => void openReplaceComparison()}
            className="h-10 rounded-full bg-ink px-5 text-base font-medium text-canvas transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            {model ? `Compare with the ${model}` : "Compare the two cars"}
          </button>
        )}
      </div>
    );
  }

  const { evaluation, source, names } = c;
  const { line } = verdictHeadline({
    evaluation,
    keepId: c.comparison.keepId,
    replaceId: c.comparison.replaceId,
    keepModel: c.twin.vehicle.model,
    replaceModel: c.replacement.model,
  });
  const robust = robustnessLine(evaluation);
  const rationale = evaluation.rationale.filter((l) => l !== robust);
  const diff = journey.difference;
  const balance = tradeoff
    ? balanceSentence({
        closeCall: tradeoff.closeCall,
        differenceAmount: diff?.amount ?? null,
        rows: tradeoff.rows,
        keepName: names.keepName,
        switchName: names.replaceName,
      })
    : null;

  return (
    <div data-testid="recommendation-content" className="flex flex-col gap-9">
      <Section testId="recommendation-lead">
        <p data-testid="recommendation-line" className="text-lg leading-7 text-ink">
          {customerText(line)}
        </p>
        {diff && (
          <p data-testid="recommendation-difference" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-ink/80">
            <span>{customerText(diff.phrase)} over five years.</span>
            <SourceBadge compact source={diff.source ?? source} />
          </p>
        )}
        {balance && (
          <p data-testid="recommendation-balance" className="text-base leading-7 text-ink/80">
            {balance}
          </p>
        )}
      </Section>

      {(tradeoff || robust) && (
        <Section title="Why it comes out this way" testId="recommendation-why">
          {tradeoff && (
            <>
              <TradeoffRows tradeoff={tradeoff} keepName={names.keepName} switchName={names.replaceName} />
              <p data-testid="tradeoff-sentence" className="text-base leading-7 text-ink/80">
                {customerText(tradeoff.sentence)}
              </p>
            </>
          )}
          {robust && (
            <p data-testid="recommendation-robustness" className="flex flex-wrap items-center gap-2 text-base text-ink">
              {customerText(robust)}
              <SourceBadge compact source={source} />
            </p>
          )}
        </Section>
      )}

      <Section title="What matters to you" testId="recommendation-priorities">
        <p data-testid="priorities-words" className="text-base leading-7 text-ink/80">
          {prioritiesInWords(priorities)}
        </p>
      </Section>

      <Section testId="recommendation-engine">
        <WhyPanel explanation={explanation} rationale={rationale} source={source} />
      </Section>

      <Section testId="recommendation-change">
        {breakEven ? (
          <ComparisonChange />
        ) : (
          <>
            <h3 className="text-base font-medium text-ink">What would change it</h3>
            <p className="text-base leading-7 text-ink/70">See how far your yearly miles would have to move before the answer flips.</p>
            <button type="button" disabled={busy !== "idle"} onClick={() => runBreakEven("annualMiles")} className={quietButton}>
              Show what would change it
            </button>
          </>
        )}
      </Section>
    </div>
  );
}
