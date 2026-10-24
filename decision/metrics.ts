import type { ProjectionPoint, SimulationResult } from "../contracts";
import { DEFAULT_COMFORT, FIT_SCORE, LONGEVITY_MILES } from "./config";

export interface Metrics { netCost: number; fuel: number; longevity: number; family: number; comfort: number }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function comfortOf(p: ProjectionPoint): number {
  const note = p.suitability.notes.find(n => n.startsWith("comfort_score="));
  const v = note ? Number(note.slice("comfort_score=".length)) : NaN;
  return Number.isFinite(v) ? v : DEFAULT_COMFORT;
}

/** Objective metrics from a simulation result. Family and comfort average every month of the horizon. */
export function metricsOf(r: SimulationResult): Metrics {
  const last = r.points[r.points.length - 1];
  return {
    netCost: r.summary.netCost,
    fuel: r.points.reduce((a, p) => a + p.fuelSpend, 0),
    longevity: 1 - Math.min((last?.mileage ?? 0) / LONGEVITY_MILES, 1),
    family: mean(r.points.map(p => Math.min(FIT_SCORE[p.suitability.passengerFit], FIT_SCORE[p.suitability.cargoFit]))),
    comfort: mean(r.points.map(comfortOf)),
  };
}

/** True when the scenario ends the horizon with the car the user owns today. */
export const keepsCurrentCar = (r: SimulationResult, currentVehicleId: string): boolean =>
  r.points.every(p => p.vehicleId === currentVehicleId);
