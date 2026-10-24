import type { DriverProfile, RawProfileInput, Source } from "../contracts";
import { DriverProfileSchema } from "../contracts/schemas";

const defaults: DriverProfile = {
  location: "Not provided", annualMiles: 12000, householdSize: 1, children: 0, carSeats: 0,
  cargoNeed: "low", fuelPricePerGal: 3, financeType: "unknown",
  priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 },
  provenance: { location: "estimated", annualMiles: "estimated", householdSize: "estimated", children: "estimated",
    carSeats: "estimated", cargoNeed: "estimated", fuelPricePerGal: "illustrative", financeType: "estimated", priorities: "illustrative" },
};
/** C7 structured adapter only. C5 adds loose-input parsing, gap checks and tradeoff mapping. */
export function prepareTwinProfile(raw: RawProfileInput = {}): { ok: true; profile: DriverProfile } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Profile must be a structured object" };
  const allowed = new Set([...Object.keys(defaults), "commuteMilesOneWay", "commuteDaysPerWeek", "monthlyBudget"]);
  const unknown = Object.keys(raw).filter(key => !allowed.has(key));
  if (unknown.length) return { ok: false, error: `Unsupported profile fields: ${unknown.join(", ")}. C5 free-text normalization is not available yet` };
  const incoming = raw.provenance;
  if (incoming !== undefined && (incoming === null || typeof incoming !== "object" || Array.isArray(incoming))) return { ok: false, error: "Invalid profile provenance" };
  const provenance = { ...defaults.provenance };
  const values = Object.fromEntries(Object.entries(raw).filter(([key, value]) => key !== "provenance" && value !== undefined));
  for (const key of Object.keys(values)) {
    const label = (incoming as Record<string, Source> | undefined)?.[key];
    provenance[key] = label ?? "user";
  }
  const profile = { ...structuredClone(defaults), ...values, provenance };
  if (values.cargoNeed === undefined) {
    const size = profile.householdSize;
    profile.cargoNeed = typeof size === "number" && size >= 4 ? "high" : typeof size === "number" && size >= 3 ? "medium" : "low";
  }
  const parsed = DriverProfileSchema.safeParse(profile);
  return parsed.success ? { ok: true, profile: parsed.data } : { ok: false, error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
