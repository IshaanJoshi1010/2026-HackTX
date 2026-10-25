"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FinanceChips } from "@/ui/command/FinanceChips";
import { TradeoffCards } from "@/ui/command/TradeoffCards";
import { WeightsEditor } from "@/ui/command/WeightsEditor";
import { data } from "@/ui/mocks";
import { customerText } from "@/ui/profile/customerText";
import { DataRow } from "@/ui/profile/DataRow";
import { miles } from "@/ui/profile/format";
import { ProfileConfirmCard } from "@/ui/profile/ProfileConfirmCard";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { specsFor } from "@/ui/store/selectors";
import { useForkStore, type ViewMode } from "@/ui/store/useForkStore";

const VIEW_MODES: Array<{ mode: ViewMode; label: string }> = [
  { mode: "solid", label: "Solid" },
  { mode: "wireframe", label: "Wireframe" },
  { mode: "points", label: "Points" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8 last:mb-0">
      <h3 className="mb-2 text-sm text-ink/50">{title}</h3>
      {children}
    </section>
  );
}

const pill =
  "h-9 rounded px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

/**
 * Everything that is not the car or the timeline lives here, behind one button:
 * the profile and finance, what matters to you, history, display, and starting over.
 * It slides in from the right and closes with Escape.
 */
export function DetailsSheet() {
  const open = useForkStore((s) => s.ui.detailsOpen);
  const busy = useForkStore((s) => s.ui.busy);
  const low = useForkStore((s) => s.ui.lowPerformance);
  const viewMode = useForkStore((s) => s.stage.viewMode);
  const twin = useForkStore((s) => s.twin);
  const { setDetailsOpen, setLowPerformance, setViewMode, resetCamera, replayReveal, startFromSample, resetAll } =
    useForkStore((s) => s.actions);
  const samples = useMemo(() => data.listSampleVehicles(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setDetailsOpen]);

  const vehicle = twin?.vehicle;
  const spec = vehicle ? specsFor(vehicle.id) : null;
  const history = twin?.history ?? [];

  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => setDetailsOpen(false)}
        className={cn(
          "absolute inset-0 z-30 bg-black/60 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-label="Your details"
        data-open={open}
        inert={!open}
        className={cn(
          "fork-glass absolute inset-y-0 right-0 z-40 w-[min(440px,100vw)] overflow-y-auto p-7 pt-6",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="mb-7 flex items-center justify-between">
          <h2 className="text-xl font-medium text-ink">Your details</h2>
          <button
            type="button"
            onClick={() => setDetailsOpen(false)}
            aria-label="Close details"
            className="flex size-9 items-center justify-center rounded-full bg-ink/10 text-ink transition-colors hover:bg-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <X className="size-[18px]" />
          </button>
        </div>

        {vehicle && twin && (
          <>
            <Section title="Your car">
              <DataRow label="Fuel economy" value={`${vehicle.mpg} mpg`} source={spec?.sources.mpgCombined} />
              <DataRow label="Cargo space" value={`${vehicle.cargoCuFt} cu ft`} source={spec?.sources.cargoCuFt} />
              <DataRow label="Seats" value={vehicle.seats} source={spec?.sources.seats} />
            </Section>

            <Section title="Profile">
              <ProfileConfirmCard compact />
            </Section>

            <Section title="Ownership">
              <FinanceChips />
            </Section>

            <Section title="What matters to you">
              <TradeoffCards />
              <div className="mt-3">
                <WeightsEditor />
              </div>
            </Section>
          </>
        )}

        <Section title="History">
          {history.length > 0 ? (
            <ul className="space-y-2" data-testid="vehicle-history-list">
              {history.map((record, idx) => (
                <li key={`${record.date}-${idx}`} className="border-b border-line py-2.5 text-sm last:border-b-0">
                  <div className="flex items-center justify-between text-ink/50">
                    <span>{record.date}</span>
                    <span className="tabular-nums">{miles(record.mileage)}</span>
                  </div>
                  <p className="mt-0.5 text-ink">{customerText(record.description)}</p>
                  <div className="mt-1">
                    <SourceBadge compact source={record.source} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-start gap-2 text-sm text-ink/50">
              <Clock className="mt-0.5 size-4 shrink-0" />
              <span>No service history for this car yet. Projections use a standard maintenance schedule.</span>
            </p>
          )}
        </Section>

        <Section title="Display">
          <div role="group" aria-label="3D view" className="flex gap-2">
            {VIEW_MODES.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={cn(pill, "flex-1", viewMode === mode ? "bg-ink font-medium text-canvas" : "bg-ink/10 text-ink hover:bg-ink/20")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={resetCamera} className={cn(pill, "flex-1 bg-ink/10 text-ink hover:bg-ink/20")}>
              Reset camera
            </button>
            <button
              type="button"
              onClick={() => {
                setDetailsOpen(false);
                replayReveal();
              }}
              className={cn(pill, "flex-1 bg-ink/10 text-ink hover:bg-ink/20")}
            >
              Replay reveal
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={low}
            onClick={() => setLowPerformance(!low)}
            className="mt-3 flex w-full items-center justify-between py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span>
              Low performance mode
              <span className="block text-xs text-ink/50">Fewer particles, smoother on slower machines</span>
            </span>
            <span aria-hidden="true" className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", low ? "bg-ink" : "bg-ink/20")}>
              <span className={cn("absolute top-0.5 size-5 rounded-full transition-all", low ? "left-[18px] bg-canvas" : "left-0.5 bg-ink")} />
            </span>
          </button>
        </Section>

        <Section title="Session">
          <ul className="space-y-1.5">
            {samples.map((v) => {
              const current = v.id === vehicle?.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => void startFromSample(v.id)}
                    disabled={busy !== "idle"}
                    aria-current={current ? "true" : undefined}
                    className={cn(pill, "flex w-full items-center justify-between", current ? "bg-ink font-medium text-canvas" : "bg-ink/10 text-ink hover:bg-ink/20")}
                  >
                    <span>
                      {v.year} {v.model} {v.trim}
                    </span>
                    {current && <span className="text-xs">Current</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-ink/50">Picking a car restarts from the reveal.</p>
          <button type="button" onClick={resetAll} className={cn(pill, "mt-4 w-full border border-line text-ink/80 hover:bg-ink/10")}>
            Start over
          </button>
        </Section>
      </aside>
    </>
  );
}
