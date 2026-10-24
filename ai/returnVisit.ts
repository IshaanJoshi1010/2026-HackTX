import type { DriverProfile } from "../contracts";
export function returnVisitQuestion(profile: DriverProfile): { field: "commuteDaysPerWeek" | "annualMiles"; text: string; options: ["Yes", "Update"] } {
  return profile.commuteDaysPerWeek !== undefined
    ? { field: "commuteDaysPerWeek", text: `Still commuting ${profile.commuteDaysPerWeek} days a week?`, options: ["Yes", "Update"] }
    : { field: "annualMiles", text: `Still driving ${profile.annualMiles.toLocaleString("en-US")} miles a year?`, options: ["Yes", "Update"] };
}
