import { MAX_INPUT_NUMBER, MAX_NUMERIC_TEXT_LENGTH } from "./inputLimits";
const quantity = "\\d+(?:,\\d{3})*(?:\\.\\d+)?";
export const dailyMileagePattern = `(?<![\\w.$+−-])(${quantity})\\s*(?:miles?|mi)\\s*(?:(?:a|per|each|every|/)\\s*day|daily)\\b`;
const schedulePattern = new RegExp(`^\\s*,?\\s*(?:on\\s+)?(${quantity})\\s*days?\\s*(?:a|per|each|every|/)\\s*week\\b`, "i");
export interface AnnualDrivingEstimate { annualMiles: number; assumptions: string[] }
/** Raw daily units are quoted, never calculated by AI. Assumptions stay visible until confirmation. */
export function deriveAnnualDriving(raw: string, evidence: string): AnnualDrivingEstimate | null {
  if (raw.length > MAX_NUMERIC_TEXT_LENGTH || evidence.length > 8000 || !evidence.toLowerCase().includes(raw.trim().toLowerCase())) return null;
  const daily = new RegExp(`^${dailyMileagePattern}`, "i").exec(raw.trim());
  if (!daily) return null;
  const dailyMiles = Number(daily[1].replaceAll(",", ""));
  const rates = [...evidence.matchAll(new RegExp(dailyMileagePattern, "gi"))];
  if (!Number.isFinite(dailyMiles) || dailyMiles < 0 || new Set(rates.map(m => Number(m[1].replaceAll(",", "")))).size !== 1) return null;
  // A quote containing a short trip is not a statement about every day of an entire year.
  if (/\b(?:for|over|during)\s+(?:the\s+|a\s+|an\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?\s*(?:days?|weeks?|months?|vacation|trip|summer|winter|spring|fall)\b/i.test(evidence)) return null;
  const source = rates[0];
  if (!source) return null;
  const after = evidence.slice(source.index! + source[0].length);
  const schedule = schedulePattern.exec(after);
  const weekdays = /^\s*,?\s*(?:on\s+)?weekdays\b/i.test(after);
  const weekends = /^\s*,?\s*(?:on\s+)?weekends\b/i.test(after);
  const days = schedule ? Number(schedule[1].replaceAll(",", "")) : weekdays ? 5 : weekends ? 2 : undefined;
  if (days !== undefined && (!Number.isFinite(days) || days < 0 || days > 7)) return null;
  if (days === undefined && /\bdays?\s*(?:a|per|each|every|\/)\s*week\b|\bweekdays|\bweekends|\bcommut\w*|\bto work\b/i.test(evidence)) return null;
  // The raw value may include an adjacent schedule, but not arbitrary trailing model text.
  const trailing = raw.trim().slice(daily[0].length);
  if (trailing && !new RegExp(`^(?:${schedulePattern.source.slice(1)}|\\s*,?\\s*(?:on\\s+)?(?:weekdays|weekends)\\b)\\s*$`, "i").test(trailing)) return null;
  const daysPerYear = days === undefined ? 365 : days * 52;
  const annualMiles = dailyMiles * daysPerYear;
  if (!Number.isFinite(annualMiles) || annualMiles > MAX_INPUT_NUMBER) return null;
  return { annualMiles, assumptions: [days === undefined
    ? `Daily driving converted by code: ${dailyMiles} miles/day × 365 days/year = ${annualMiles} annual miles. Assumes driving every day; confirm the frequency.`
    : `Daily driving converted by code: ${dailyMiles} miles/day × ${days} days/week × 52 weeks/year = ${annualMiles} annual miles. Assumes 52 weeks and no additional driving; confirm the estimate.`] };
}
