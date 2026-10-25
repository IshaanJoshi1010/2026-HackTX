import type { BreakEvenResult, Source } from "@/contracts";
import { cn } from "@/lib/utils";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import type { BreakEvenCheck } from "@/ui/store/useForkStore";
import { breakEvenCopy, formatParameter, fractionAlong, money, type BreakEvenNames } from "./breakEvenMath";

export interface BreakEvenVizProps extends BreakEvenNames {
  breakEven: BreakEvenResult;
  /** The engine's reruns just below and just above the threshold. Null when there is no threshold. */
  check: BreakEvenCheck | null;
  /** Where the numbers on the bar come from. Undefined shows the gap. */
  source: Source | undefined;
  /** Where the current yearly mileage (or fuel price) came from. */
  currentSource: Source | undefined;
}

/**
 * What would have to change for the answer to flip: one bar across the range the engine
 * tested, the threshold on it, and where you are today. Under it, the two reruns on either
 * side of the threshold, so anyone can type those numbers in and see the flip. The words
 * and the numbers all come from the engine's results.
 */
export function BreakEvenViz({ breakEven, check, source, currentSource, ...names }: BreakEvenVizProps) {
  const copy = breakEvenCopy({ breakEven, check, ...names });
  const bounds = breakEven.testedBounds;
  const at = (v: number) => `${(fractionAlong(v, bounds) * 100).toFixed(3)}%`;

  return (
    <section aria-label="What would change it" data-testid="break-even" className="mx-auto w-full max-w-3xl">
      <p className="mb-1 text-sm text-ink/50">What would change it</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p data-testid="break-even-headline" className="text-2xl font-medium text-ink">
          {copy.headline}
        </p>
        <SourceBadge compact source={source} />
      </div>

      {breakEven.found && (
        <>
          <div
            role="img"
            aria-label={`${copy.headline}. ${copy.today ?? ""}`}
            data-testid="break-even-track"
            className="relative mt-8 mb-14 h-10"
          >
            {/* the tested range, dotted */}
            <span aria-hidden="true" className="absolute inset-x-0 top-5 border-t border-dotted border-ink/40" />
            {/* the side where the other car leads, solid */}
            <span
              aria-hidden="true"
              data-testid="break-even-leads"
              className="absolute top-[18px] h-[5px] rounded-full bg-ink"
              style={
                breakEven.direction === "below"
                  ? { left: 0, width: at(breakEven.threshold) }
                  : { left: at(breakEven.threshold), right: 0 }
              }
            />
            {/* the threshold */}
            <span aria-hidden="true" className="absolute top-2 h-6 w-px bg-ink" style={{ left: at(breakEven.threshold) }} />
            <span
              data-testid="break-even-threshold"
              className="absolute -top-5 -translate-x-1/2 text-sm font-medium whitespace-nowrap text-ink"
              style={{ left: at(breakEven.threshold) }}
            >
              {formatParameter(breakEven.parameter, breakEven.threshold)}
            </span>
            {/* you, today */}
            <span
              aria-hidden="true"
              className="absolute top-[13px] size-[15px] -translate-x-1/2 rounded-full border-2 border-ink bg-canvas"
              style={{ left: at(breakEven.currentValue) }}
            />
            <span
              data-testid="break-even-today"
              className="absolute top-10 flex -translate-x-1/2 flex-col items-center gap-0.5 text-xs whitespace-nowrap text-ink/70"
              style={{ left: at(breakEven.currentValue) }}
            >
              <span>You</span>
              <SourceBadge compact source={currentSource} />
            </span>
            {/* the ends of what was tested */}
            <span className="absolute top-10 left-0 text-xs text-ink/55">{formatParameter(breakEven.parameter, bounds[0])}</span>
            <span className="absolute top-10 right-0 text-xs text-ink/55">{formatParameter(breakEven.parameter, bounds[1])}</span>
          </div>

          <p className="mb-2 text-sm text-ink/50">
            {copy.today}. Check it: run the numbers on either side of the line.
          </p>
          <ul className="divide-y divide-line border-y border-line">
            {copy.rows.map((row) => (
              <li key={row.side} data-testid="break-even-row" className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                <span className="text-base text-ink">
                  <span className="tabular-nums">{row.at}</span>
                  <span className="text-ink/50"> · {row.side === "below" ? "just below" : "just above"}</span>
                </span>
                <span className={cn("text-base", row.leads === "No clear winner" ? "text-ink/60" : "font-medium text-ink")}>{row.leads}</span>
                {row.keepNet !== null && row.replaceNet !== null && (
                  <span className="flex items-center gap-2 text-sm text-ink/60 tabular-nums">
                    Keep {money(row.keepNet)} · Replace {money(row.replaceNet)}
                    <SourceBadge compact source={source} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
