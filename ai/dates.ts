import { z } from "zod";
import { quantityPattern, readQuantity } from "./evidence";

/** Detect even unsupported time phrases so omitted timing cannot become month zero. */
export function hasTimingLanguage(text: string): boolean {
  const withoutModelYear = text.replace(/\$\s*20\d{2}\b/g, "amount").replace(/\b20\d{2}\s*(?:annual\s+)?(?:miles?|mi|dollars?|usd|a year|per year|\/yr|\/month)\b/gi, "quantity").replace(/\b20\d{2}\s+(?:toyota\s+)?(?:camry|rav4)\b/gi, "vehicle");
  return /\b(?:next|this|last)\s+(?:month|year|week|spring|summer|fall|autumn|winter|january|february|march|april|may|june|july|august|september|october|november|december)\b|\bin\s+[^,.;!?]*\b(?:months?|years?|weeks?|days?)\b|\b(?:in\s+)?20\d{2}\b|\b(?:after|before|by|until|soon|later|eventually)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(withoutModelYear);
}
/** Shared clause boundaries keep dates attached to their own change; thousands separators stay intact. */
export function splitClauses(text: string): string[] {
  return text.replace(/(\d),(?=\d)/g, "$1\u0001").split(/[;!?\n]|[.](?!\d)|,|\s+and\s+/i)
    .map(clause => clause.replaceAll("\u0001", ",").trim()).filter(Boolean);
}

export type EventTiming = { resolved: true; month: number; inferred: boolean; assumptions: string[] }
  | { resolved: false; reason: string };

/** Pure month offsets relative to the supplied date. No system clock or model math. */
export function resolveEventMonth(phrase: string | undefined, todayISO: string, pregnancy = false): EventTiming {
  z.iso.date().parse(todayISO);
  if (!phrase) return pregnancy
    ? { resolved: true, month: 9, inferred: true, assumptions: ["Pregnancy mention implies one additional child at month 9; timing requires confirmation."] }
    : { resolved: true, month: 0, inferred: false, assumptions: ["No future timing stated; proposal starts in the current month."] };
  const text = phrase.trim().toLowerCase();
  if (["now", "today", "this month"].includes(text)) return { resolved: true, month: 0, inferred: false, assumptions: [] };
  if (text === "next year") return { resolved: true, month: 12, inferred: false, assumptions: [] };
  if (text === "next month") return { resolved: true, month: 1, inferred: false, assumptions: [] };
  const relative = text.match(new RegExp(`^in (${quantityPattern}) (months?|years?)$`));
  if (relative) {
    const month = readQuantity(relative[1]) * (relative[2].startsWith("year") ? 12 : 1);
    return Number.isSafeInteger(month) ? { resolved: true, month, inferred: false, assumptions: [] } : { resolved: false, reason: "Timing is outside the supported numeric range" };
  }
  const [currentYear, currentMonth] = todayISO.split("-").map(Number);
  const names = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const calendar = text.match(new RegExp(`^(?:in )?(?:(this|next) )?(${names.join("|")})(?: (20\\d{2}))?$`));
  const iso = /^20\d{2}-\d{2}-\d{2}$/.test(text) && z.iso.date().safeParse(text).success ? text.split("-").map(Number) : null;
  if (calendar || iso) {
    const targetMonth = iso ? iso[1] : names.indexOf(calendar![2]) + 1;
    const statedYear = iso ? iso[0] : calendar![3] ? Number(calendar![3]) : undefined;
    if (statedYear === undefined && !calendar![1]) return { resolved: false, reason: "Specify this or next occurrence, or the calendar year" };
    const targetYear = statedYear ?? (calendar![1] === "next" && targetMonth <= currentMonth ? currentYear + 1 : currentYear);
    const month = (targetYear - currentYear) * 12 + targetMonth - currentMonth;
    return month < 0 ? { resolved: false, reason: "Date is in the past" }
      : { resolved: true, month, inferred: false, assumptions: iso ? ["Timeline uses the stated calendar month, not a day within it."] : [] };
  }
  const year = text.match(/^(?:in )?(\d{4})$/);
  if (year) {
    const month = (Number(year[1]) - currentYear) * 12 + 6 - currentMonth;
    return month < 0 ? { resolved: false, reason: "The default June date is in the past; ask for a future month" }
      : { resolved: true, month, inferred: true, assumptions: ["A bare year is mapped to June of that year; confirm the assumed month."] };
  }
  return { resolved: false, reason: "Timing is vague or unsupported; do not invent a month" };
}
