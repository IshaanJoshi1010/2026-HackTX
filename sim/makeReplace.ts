import type { LifeEvent, Scenario, VehicleConfig } from "../contracts";
import { HORIZON_MONTHS } from "./config";

const DEFAULT_REPLACE_MONTH = 12;

/**
 * A "replace" scenario to compare against `parent` over the same horizon: the same life events plus a confirmed
 * vehicle_replacement. Default month: the earliest confirmed relocation or family_change in the parent, else 12.
 * Never mutates the parent. Optional purchase price or odometer go in the event payload (price, mileage).
 */
export function makeReplaceScenario(parent: Scenario, replacement: VehicleConfig, month?: number): Scenario {
  const trigger = parent.events
    .filter(e => e.status === "confirmed" && (e.type === "relocation" || e.type === "family_change"))
    .reduce<number | null>((min, e) => (min === null || e.month < min ? e.month : min), null);
  const at = Math.min(HORIZON_MONTHS, Math.max(0, Math.round(month ?? trigger ?? DEFAULT_REPLACE_MONTH)));
  const id = `${parent.id}/replace-${replacement.id}-${at}`;
  const why = month !== undefined ? `Replacement month ${at} chosen by the user`
    : trigger !== null ? `Replacement month ${at} matches the first relocation or family change`
    : `Replacement month defaults to ${DEFAULT_REPLACE_MONTH}`;
  const event: LifeEvent = {
    id: `${id}/event`, type: "vehicle_replacement", month: at, payload: { vehicleId: replacement.id },
    source: "fixture", assumptions: [why], certainty: "clear", status: "confirmed",
  };
  return {
    id, parentId: parent.id, forkMonth: at, name: `Replace with ${replacement.model}`,
    events: [...structuredClone(parent.events), event],
    assumptions: structuredClone(parent.assumptions),
  };
}
