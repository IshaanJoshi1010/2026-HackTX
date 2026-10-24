import type { HistoryRecord } from "../contracts";

// Minimal C7 seed: fictional odometer readings only. C4 adds detailed service history.
const readings: Record<string, HistoryRecord[]> = {
  "camry-2022-se": [
    { date: "2022-10-24", type: "odometer", description: "Synthetic demo starting odometer", mileage: 0, source: "synthetic", provenance: "Fictional demo reading; not vehicle records" },
    { date: "2026-10-24", type: "odometer", description: "Synthetic demo current odometer", mileage: 48000, source: "synthetic", provenance: "Fictional demo reading matching the primary Camry listing" },
  ],
  "rav4-2024-hybrid-xle": [
    { date: "2024-10-24", type: "odometer", description: "Synthetic demo starting odometer", mileage: 0, source: "synthetic", provenance: "Fictional demo reading; not vehicle records" },
    { date: "2026-10-24", type: "odometer", description: "Synthetic demo current odometer", mileage: 24000, source: "synthetic", provenance: "Fictional demo reading matching the primary RAV4 listing" },
  ],
};
export function getHistory(vehicleId: string): HistoryRecord[] {
  return Object.hasOwn(readings, vehicleId) ? structuredClone(readings[vehicleId]) : [];
}
