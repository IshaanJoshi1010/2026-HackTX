"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Scenario, VehicleConfig } from "@/contracts";
import { data, sim } from "@/ui/mocks";
import { specsFor } from "@/ui/store/selectors";
import { useForkStore, type DrawerId, type ForkState } from "@/ui/store/useForkStore";
import { buildJourney } from "./model";
import type { FutureKind, Journey } from "./types";

/** How long a change stays highlighted after it happened. */
export const RECENT_MS = 2000;

// ---------------------------------------------------------------------------
// The Journey, read from the store
// ---------------------------------------------------------------------------

/** The other car you could switch to: the one already chosen for the comparison, else the other supported car. Looked up once per owned car. */
const otherCars = new Map<string, VehicleConfig | null>();
function otherFor(s: ForkState): VehicleConfig | null {
  if (s.replacementVehicle) return s.replacementVehicle;
  const ownedId = s.twin?.vehicle.id ?? "";
  if (!otherCars.has(ownedId)) {
    try {
      otherCars.set(ownedId, data.listSampleVehicles().find((v) => v.id !== ownedId) ?? null);
    } catch {
      otherCars.set(ownedId, null);
    }
  }
  return otherCars.get(ownedId) ?? null;
}

/** Where a swap would land by default for this future, from the simulation's own rule. Null when it cannot say. */
const swapMonthWith =
  (other: VehicleConfig | null) =>
  (keep: Scenario): number | null => {
    if (!other) return null;
    try {
      const replace = sim.makeReplaceScenario(keep, other);
      const swaps = replace.events.filter((e) => e.type === "vehicle_replacement");
      return swaps.length > 0 ? swaps[swaps.length - 1].month : replace.forkMonth;
    } catch {
      return null;
    }
  };

let cache: { deps: readonly unknown[]; journey: Journey | null } | null = null;

/**
 * The Journey for a store state, or null before there is a car and a baseline. Remembers its last answer and gives the
 * same object back until something it reads has changed (draft edits, panels and playback do not rebuild it).
 */
export function selectJourney(s: ForkState, recent: boolean): Journey | null {
  if (!s.twin || s.explore.scenarios.length === 0) return null;
  const deps = [
    s.twin, s.replacementVehicle, s.explore.scenarios, s.results, s.comparison, s.evaluation, s.activeScenarioId, s.activeMonth,
    s.selectedEventId, s.todayISO, s.revision, s.ui.busy, s.lastChange, recent, s.explore.confirmedProfile,
  ];
  if (cache && cache.deps.length === deps.length && cache.deps.every((d, i) => Object.is(d, deps[i]))) return cache.journey;
  const other = otherFor(s);
  const journey = buildJourney({
    twin: s.twin,
    replacementVehicle: s.replacementVehicle,
    other,
    scenarios: s.explore.scenarios,
    results: s.results,
    comparison: s.comparison,
    evaluation: s.evaluation,
    activeScenarioId: s.activeScenarioId,
    activeMonth: s.activeMonth,
    selectedEventId: s.selectedEventId,
    todayISO: s.todayISO,
    revision: s.revision,
    busy: s.ui.busy,
    lastChange: s.lastChange ? { eventIds: s.lastChange.eventIds, recent } : null,
    confirmedProfile: s.explore.confirmedProfile,
    defaultSwapMonth: swapMonthWith(other),
    specsFor,
  });
  cache = { deps, journey };
  return journey;
}

/**
 * True for RECENT_MS after the store's last change, then false by itself. A timer tells React when time is up, so no state
 * is set from an effect. A change that is already older than that when this mounts is never shown as recent.
 */
function useRecentChange(): boolean {
  // The last change whose time ran out, so a timer that fires a hair early still ends the highlight.
  const expired = useRef<number | null>(null);
  const subscribe = useCallback((notify: () => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (change: ForkState["lastChange"]) => {
      clearTimeout(timer);
      if (!change) return;
      const left = RECENT_MS - (Date.now() - change.at);
      if (left <= 0) return;
      timer = setTimeout(() => {
        expired.current = change.id;
        notify();
      }, left);
    };
    arm(useForkStore.getState().lastChange);
    const off = useForkStore.subscribe((state, prev) => {
      if (state.lastChange === prev.lastChange) return;
      arm(state.lastChange);
      notify();
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, []);
  const snapshot = useCallback(() => {
    const change = useForkStore.getState().lastChange;
    return change !== null && expired.current !== change.id && Date.now() - change.at < RECENT_MS;
  }, []);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/**
 * The Future page's one view of the scenario, always the latest store state (a recalculation's results and its revision
 * arrive together, so an older revision is never handed out). Null before there is a twin and a baseline.
 */
export function useJourney(): Journey | null {
  const recent = useRecentChange();
  return useForkStore(useCallback((s: ForkState) => selectJourney(s, recent), [recent]));
}

// ---------------------------------------------------------------------------
// What the Future page can do
// ---------------------------------------------------------------------------

export interface JourneyActions {
  /** Move the one clock to a month (0 to 60). Stops playback. */
  scrub(month: number): void;
  /** Select an event (the month follows it), or clear with null. */
  selectEvent(id: string | null): void;
  /** Look at a future. Moves nothing else: not the month, not the engine's call. Does nothing until a comparison exists. */
  selectFuture(kind: FutureKind): void;
  /** Compare keeping with switching. */
  compare(): Promise<void>;
  togglePlay(): void;
  openDrawer(id: DrawerId): void;
  closeDrawer(): void;
}

// Bound to the store, read at call time, so the object never changes and is safe in any dependency list.
const journeyActions: JourneyActions = {
  scrub: (month) => useForkStore.getState().actions.setActiveMonth(month),
  selectEvent: (id) => useForkStore.getState().actions.selectEvent(id),
  selectFuture: (kind) => {
    const { comparison, actions } = useForkStore.getState();
    if (!comparison) return;
    actions.setActiveScenario(kind === "switch" ? comparison.replaceId : comparison.keepId);
  },
  compare: () => useForkStore.getState().actions.openReplaceComparison(),
  togglePlay: () => {
    const { ui, actions } = useForkStore.getState();
    if (ui.playing) actions.pause();
    else actions.play();
  },
  openDrawer: (id) => useForkStore.getState().actions.openDrawer(id),
  closeDrawer: () => useForkStore.getState().actions.closeDrawer(),
};

/** Stable callbacks bound to the store. */
export function useJourneyActions(): JourneyActions {
  return journeyActions;
}
