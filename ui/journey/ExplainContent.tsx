"use client";

import type { ReactNode } from "react";
import type { Source } from "@/contracts";
import { customerText } from "@/ui/profile/customerText";
import { usd } from "@/ui/profile/format";
import { metricSource, type MetricKey } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { inferredDateNote, isDateAssumption, plainAssumption } from "./explain";
import { momentWhere, type EventImpact } from "./impact";
import type { Journey, JourneyBranch, JourneyEvent } from "./types";
import { useEventImpact } from "./useEventImpact";

export interface ExplainContentProps {
  journey: Journey;
  /**
   * What the selected event changes. Left out, it is worked out from the store (useEventImpact). Pass it (or null)
   * to show a result already in hand.
   */
  impact?: EventImpact | null;
}

const dollars = (n: number): string => usd(Math.abs(Math.round(n)));
const miles = (n: number): string => Math.abs(Math.round(n)).toLocaleString("en-US");

function Section({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-ink/60">{label}</h4>
      <div className="flex flex-col gap-2 text-base text-ink/85">{children}</div>
    </section>
  );
}

/** A line of the drawer that carries a figure: the words, then where the figure comes from. */
function Fact({ testId, children, source }: { testId: string; children: ReactNode; source: Source | undefined }) {
  return (
    <li data-testid={testId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{children}</span>
      <SourceBadge compact source={source} />
    </li>
  );
}

/** A line of the drawer with no figure in it. */
function Note({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <li data-testid={testId} className="text-ink/85">
      {children}
    </li>
  );
}

function ChangesList({ event, impact, branch, sources }: { event: JourneyEvent; impact: EventImpact; branch: JourneyBranch; sources: Record<MetricKey, Source | undefined> }) {
  const dollarsMoved = Math.round(impact.costDelta) !== 0;
  const adds = impact.costDelta > 0;
  const swap = event.kind === "swap" || event.type === "vehicle_replacement";

  return (
    <ul data-testid="changes-list" className="flex flex-col gap-2">
      {impact.changesCost && dollarsMoved ? (
        <Fact testId="change-cost" source={branch.costSource ?? sources.netEconomicCost}>
          {adds ? "Adds" : "Saves"} <span className="font-medium text-ink">{dollars(impact.costDelta)}</span> {adds ? "to" : "on"} your five-year cost
        </Fact>
      ) : impact.changesCost ? (
        <Note testId="change-cost">Costs shift along the way, but your five-year cost ends about the same.</Note>
      ) : (
        <Note testId="change-cost">No direct vehicle-cost change modeled.</Note>
      )}
      {swap && impact.carChangeMonth !== null && <Note testId="change-car">Changes your car in {customerText(event.dateLabel)}.</Note>}
      {impact.fuelDelta !== null && (
        <Fact testId="change-fuel" source={sources.fuelSpend}>
          {impact.fuelDelta > 0 ? "Adds" : "Saves"} <span className="font-medium text-ink">{dollars(impact.fuelDelta)}</span> in fuel over five years
        </Fact>
      )}
      {impact.milesDelta !== null && (
        <Fact testId="change-miles" source={sources.mileage}>
          {impact.milesDelta > 0 ? "Adds" : "Removes"} about <span className="font-medium text-ink">{miles(impact.milesDelta)}</span> miles over five years
        </Fact>
      )}
      {impact.fit.map((line) => (
        <Note key={line} testId="change-fit">
          {customerText(line)}.
        </Note>
      ))}
      {impact.constraints.map((line) => (
        <Note key={line} testId="change-constraint">
          {customerText(line)}.
        </Note>
      ))}
      {impact.warning && <Note testId="change-warning">{customerText(impact.warning)}</Note>}
    </ul>
  );
}

/** The drawer body: what the selected event changes, what was said, what Fork assumed, where it comes from. */
export function ExplainContent({ journey, impact: given }: ExplainContentProps) {
  const event = journey.events.find((e) => e.id === journey.selectedEventId) ?? null;
  const worked = useEventImpact(given === undefined && event ? event.id : null, { future: journey.selectedFuture });
  const impact = given === undefined ? worked : given;

  // The swap only exists in the switch future; a life event is read in the future you are looking at.
  const isSwap = event?.kind === "swap" || event?.type === "vehicle_replacement";
  const branch = (isSwap || journey.selectedFuture === "switch") && journey.switch ? journey.switch : journey.keep;

  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const spec = specsFor((branch.endVehicle ?? journey.vehicleNow).vehicleId);
  const sources: Record<MetricKey, Source | undefined> = {
    mileage: metricSource("mileage", profile, spec),
    fuelSpend: metricSource("fuelSpend", profile, spec),
    maintenanceSpend: metricSource("maintenanceSpend", profile, spec),
    vehicleValue: metricSource("vehicleValue", profile, spec),
    netEconomicCost: metricSource("netEconomicCost", profile, spec),
  };

  if (!event) return <MomentContent journey={journey} branch={branch} />;

  const assumed = [...new Set(event.assumptions.filter((a) => !isDateAssumption(a)).map(plainAssumption))].filter(Boolean);
  const dateNote = inferredDateNote(event);

  return (
    <div data-testid="explain-content" data-mode="event" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink/60">
          {customerText(event.dateLabel)} <span aria-hidden="true">&middot;</span> {customerText(event.whenLabel)}
        </p>
        <h3 data-testid="explain-title" className="text-2xl leading-tight font-medium tracking-tight text-ink">
          {customerText(event.title)}
        </h3>
        <p aria-live="polite" data-testid="explain-updating" className="text-xs text-ink/60">
          {journey.updating ? "Updating" : ""}
        </p>
      </header>

      <Section label="What changes" testId="explain-changes">
        {impact ? (
          <>
            <ChangesList event={event} impact={impact} branch={branch} sources={sources} />
            {!impact.modeled && (
              <p data-testid="not-modeled" className="text-sm text-ink/60">
                Fork does not put a number on this one yet, so it is not in your cost. It may still matter in ways Fork cannot measure.
              </p>
            )}
          </>
        ) : (
          <p data-testid="changes-pending" className="text-ink/60">
            {journey.updating ? "Updating what this changes." : "Working out what this changes."}
          </p>
        )}
      </Section>

      {event.quote && (
        <Section label="What you said" testId="explain-said">
          <blockquote className="border-l border-line-strong pl-4 text-ink">
            &ldquo;{customerText(event.quote)}&rdquo;
          </blockquote>
        </Section>
      )}

      <Section label="What Fork assumed" testId="explain-assumed">
        {assumed.length === 0 && !dateNote ? (
          <p data-testid="assumed-empty" className="text-ink/60">
            {event.quote ? "Nothing extra. Fork used what you said." : "Nothing extra was assumed."}
          </p>
        ) : (
          <ul data-testid="assumed-list" className="flex flex-col gap-2">
            {dateNote && (
              <li data-testid="assumed-date" className="text-ink">
                {dateNote}
              </li>
            )}
            {assumed.map((line) => (
              <li key={line} data-testid="assumed-line">
                {line}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Where this comes from" testId="explain-source">
        <p data-testid="source-line" className="text-ink/70">
          {event.kind === "swap"
            ? "Fork ran your future with the switch and without it, using both cars' price, fuel economy and upkeep, your yearly driving and your fuel price. The difference is what you see here."
            : "Fork ran your future with this and without it, using your car's price, fuel economy and upkeep, your yearly driving and your fuel price. The difference is what you see here."}
        </p>
      </Section>
    </div>
  );
}

/** With no event selected: where the selected month stands, from the same run as the road. */
function MomentContent({ journey, branch }: { journey: Journey; branch: JourneyBranch }) {
  const sofar = journey.events.filter((e) => e.kind === "life" && e.month <= journey.month && e.futures.includes(journey.selectedFuture));
  return (
    <div data-testid="explain-content" data-mode="moment" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink/60">{customerText(branch.title)}</p>
        <h3 data-testid="explain-title" className="text-2xl leading-tight font-medium tracking-tight text-ink">
          {customerText(journey.monthLabel)}
        </h3>
        <p data-testid="moment-sentence" className="text-base text-ink/80">
          {customerText(momentWhere(journey).replace(/^./, (c) => c.toUpperCase()))}
        </p>
      </header>

      <Section label="Changes so far" testId="explain-sofar">
        {sofar.length === 0 ? (
          <p data-testid="sofar-empty" className="text-ink/60">
            Nothing you told Fork has happened by this month.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sofar.map((e) => (
              <li key={e.id} data-testid="sofar-line" className="flex justify-between gap-4">
                <span>{customerText(e.title)}</span>
                <span className="text-ink/60">{customerText(e.dateLabel)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Cost" testId="explain-cost">
        {branch.priced && branch.fiveYearCost !== null ? (
          <ul className="flex flex-col gap-2">
            {branch.costThroughMonth !== null && (
              <Fact testId="cost-through" source={branch.costSource}>
                Net cost through {customerText(journey.monthLabel)}: <span className="font-medium text-ink">{usd(Math.round(branch.costThroughMonth))}</span>
              </Fact>
            )}
            <Fact testId="cost-five-year" source={branch.costSource}>
              Net cost over five years: <span className="font-medium text-ink">{usd(Math.round(branch.fiveYearCost))}</span>
            </Fact>
          </ul>
        ) : (
          <p data-testid="cost-empty" className="text-ink/60">
            Compare with the other car to see what this future costs.
          </p>
        )}
      </Section>

      <Section label="Where this comes from" testId="explain-source">
        <p data-testid="source-line" className="text-ink/70">
          The same five-year run as the road: your car, your yearly driving, your fuel price and the changes you told Fork about.
        </p>
      </Section>
    </div>
  );
}
