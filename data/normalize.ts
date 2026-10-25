import type { DriverProfile, RawProfileInput, Source, TradeoffPick } from "../contracts";
import { SourceSchema } from "../contracts/schemas";
import { applyDefaults, defaultsTable } from "./defaults";
import { mapTradeoffs } from "./tradeoffs";

export interface OnboardingHints { vagueCommute: boolean; budgetMentioned: boolean; notes: string[] }
export interface FinanceInput { payment?: number; endMonth?: number }
export type NormalizedOnboarding = { ok: true; profile: Partial<DriverProfile>; hints: OnboardingHints; financeInput: FinanceInput } | { ok: false; error: string };
const numeric = new Set(["annualMiles", "commuteMilesOneWay", "commuteDaysPerWeek", "householdSize", "children", "carSeats", "monthlyBudget", "fuelPricePerGal"]);
const fields = new Set([...numeric, "location", "cargoNeed", "financeType", "priorities"]);
const missing = (v: unknown) => v === undefined || v === null || (typeof v === "string" && /^(?:\s*|no idea|not sure|i(?:'m| am) not sure|unknown|skip)$/i.test(v.trim()));
function amount(v: unknown, field: string): number {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v !== "string") throw new Error("Expected a nonnegative number");
  const units = v.toLowerCase();
  if ((/people/.test(units) && field !== "householdSize") ||
      (/kids?|children/.test(units) && !["children", "carSeats"].includes(field)) ||
      (/days?/.test(units) && field !== "commuteDaysPerWeek") ||
      (/miles?|\bmi\b/.test(units) && !["annualMiles", "commuteMilesOneWay"].includes(field)) ||
      (/year|annually|\/yr/.test(units) && field !== "annualMiles") ||
      (/month/.test(units) && !["monthlyBudget", "financePayment", "financeEndMonth"].includes(field)) ||
      (/gal/.test(units) && field !== "fuelPricePerGal")) throw new Error(`Units do not match ${field}`);
  const match = v.trim().toLowerCase().match(/^(?:(?:like|about|around|roughly)\s+)?\$?(\d+(?:,\d{3})*(?:\.\d+)?)(k)?\s*(?:(?:miles?|mi)(?:\s*(?:annually|(?:a|per)\s+year|\/yr|each\s+way))?|(?:a|per)\s+year|annually|people|kids?|children|days?(?:\s*(?:a|per)\s+week)?|(?:\/|per\s+)month|(?:\/|per\s+)gal(?:lon)?)?$/);
  if (!match) throw new Error(`Cannot parse numeric value: ${v}`);
  const result = Number(match[1].replaceAll(",", "")) * (match[2] ? 1000 : 1);
  if (!Number.isFinite(result)) throw new Error("Number must be finite");
  return result;
}
export function normalizeOnboarding(raw: RawProfileInput): NormalizedOnboarding {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Profile must be a structured object");
    const allowed = new Set([...fields, "provenance", "commute", "tradeoffPicks", "financePayment", "financeEndMonth"]);
    const unknown = Object.keys(raw).filter(key => !allowed.has(key));
    if (unknown.length) throw new Error(`Unsupported profile fields: ${unknown.join(", ")}`);
    if (raw.provenance !== undefined && (!raw.provenance || typeof raw.provenance !== "object" || Array.isArray(raw.provenance))) throw new Error("Invalid provenance object");
    const incomingSources = raw.provenance as Record<string, unknown> | undefined;
    const profile: Record<string, unknown> = {}, provenance: Record<string, Source> = {};
    const hints: OnboardingHints = { vagueCommute: false, budgetMentioned: raw.monthlyBudget !== undefined, notes: [] };
    for (const key of fields) {
      const value = raw[key];
      if (missing(value) && !(key === "financeType" && typeof value === "string" && value.trim().toLowerCase() === "unknown")) continue;
      let normalized: unknown = numeric.has(key) ? amount(value, key) : value;
      if (["location", "cargoNeed", "financeType"].includes(key)) {
        if (typeof value !== "string") throw new Error(`${key} must be text`);
        normalized = key === "location" ? value.trim() : value.trim().toLowerCase().replaceAll(" ", "_");
      }
      profile[key] = normalized;
      provenance[key] = incomingSources?.[key] === undefined ? "user" : SourceSchema.parse(incomingSources[key]);
    }
    if (!missing(raw.commute)) {
      if (typeof raw.commute !== "string") throw new Error("Commute must describe miles each way and days per week");
      const commute = raw.commute.trim().match(/^(?:about\s+)?(\d+(?:\.\d+)?)\s*(?:miles?|mi)\s*(?:each|one)\s*way(?:\s*[,;]\s*|\s+)(\d+(?:\.\d+)?)\s*days?(?:\s*(?:a|per)\s*week)?$/i);
      const distance = raw.commute.trim().match(/^(\d+(?:\.\d+)?)\s*(?:miles?|mi)\s*(?:each|one)\s*way$/i);
      if (commute || distance) {
        const miles = Number((commute ?? distance)![1]);
        if (profile.commuteMilesOneWay !== undefined && profile.commuteMilesOneWay !== miles) throw new Error("Conflicting commute distances require confirmation");
        profile.commuteMilesOneWay = miles; provenance.commuteMilesOneWay = "user";
        if (!commute) hints.vagueCommute = true;
        if (commute) {
          const days = Number(commute[2]);
          if (profile.commuteDaysPerWeek !== undefined && profile.commuteDaysPerWeek !== days) throw new Error("Conflicting commute days require confirmation");
          profile.commuteDaysPerWeek = days; provenance.commuteDaysPerWeek = "user";
        }
      } else if (!/\d/.test(raw.commute) && /longer|shorter|commut|farther|closer/i.test(raw.commute)) hints.vagueCommute = true;
      else throw new Error("Commute is ambiguous; provide miles each way and days per week");
    }
    if (raw.tradeoffPicks !== undefined) {
      if (!Array.isArray(raw.tradeoffPicks)) throw new Error("Tradeoff picks must be an array");
      if (profile.priorities !== undefined) throw new Error("Choose priorities or tradeoff picks, not both");
      profile.priorities = mapTradeoffs(raw.tradeoffPicks as TradeoffPick[]); provenance.priorities = raw.tradeoffPicks.length ? "user" : "estimated";
      hints.notes.push("Priority weights derived deterministically from explicit tradeoff selections; cargo maps to family fit.");
    }
    if (profile.annualMiles === undefined && profile.commuteMilesOneWay !== undefined && profile.commuteDaysPerWeek !== undefined) {
      profile.annualMiles = Number(profile.commuteMilesOneWay) * 2 * Number(profile.commuteDaysPerWeek) * 52 + defaultsTable.nonCommuteMiles.value;
      provenance.annualMiles = "estimated";
      hints.notes.push("Annual mileage is commute distance × 2 × days/week × 52 plus 4,000 estimated non-commute miles.");
    }
    profile.provenance = provenance;
    // Validate supplied fields using the canonical schema without returning the filled defaults.
    applyDefaults(profile as Partial<DriverProfile>);
    const financeInput: FinanceInput = {};
    if (!missing(raw.financePayment)) financeInput.payment = amount(raw.financePayment, "financePayment");
    if (!missing(raw.financeEndMonth)) {
      financeInput.endMonth = amount(raw.financeEndMonth, "financeEndMonth");
      if (!Number.isInteger(financeInput.endMonth)) throw new Error("Finance end month must be an integer relative to today");
    }
    return { ok: true, profile: profile as Partial<DriverProfile>, hints, financeInput };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Invalid profile input" }; }
}
export function normalizeProfile(raw: RawProfileInput): { ok: true; profile: Partial<DriverProfile> } | { ok: false; error: string } {
  const result = normalizeOnboarding(raw);
  return result.ok ? { ok: true, profile: result.profile } : result;
}
/** A proposal only. Caller must obtain confirmation before applying it. */
export function mergeContradiction<T>(existing: T, incoming: T): { newValue: T; oldValue: T; needsConfirm: true } {
  return { oldValue: structuredClone(existing), newValue: structuredClone(incoming), needsConfirm: true };
}
