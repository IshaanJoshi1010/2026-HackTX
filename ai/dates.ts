import { z } from "zod";
import { quantityPattern, readQuantity } from "./evidence";

/** Detect even unsupported time phrases so omitted timing cannot become month zero. */
export function hasTimingLanguage(text: string): boolean {
  const withoutModelYear = text.replace(/\$\s*20\d{2}\b/g, "amount").replace(/\b20\d{2}\s*(?:annual\s+)?(?:miles?|mi|dollars?|usd|a year|per year|\/yr|\/month)\b/gi, "quantity").replace(/\b20\d{2}\s+(?:toyota\s+)?(?:camry|rav4)\b/gi, "vehicle");
  return /\b(?:in|starting|during|by)\s+(?:the\s+)?(?:spring|summer|fall|autumn|winter)\b|\b(?:next|this|last)\s+(?:month|year|week|spring|summer|fall|autumn|winter|january|february|march|april|may|june|july|august|september|october|november|december)\b|\bin\s+[^,.;!?]*\b(?:months?|years?|weeks?|days?)\b|\b(?:in\s+)?20\d{2}\b|\b(?:after|before|by|until|soon|later|eventually)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(withoutModelYear);
}
/** Shared clause boundaries keep dates attached to their own change; thousands separators stay intact. */
export function splitClauses(text: string): string[] {
  const clauses = text.replace(/(\d),(?=\d)/g, "$1\u0001").split(/[;!?\n]|[.](?!\d)|,|\s+and\s+/i)
    .map(clause => clause.replaceAll("\u0001", ",").trim()).filter(Boolean);
  for (let i = 0; i + 1 < clauses.length; i++) {
    if (!/\b(?:job|office|workplace)\b.*\bmiles?\s+away\b|\bmiles?\s+(?:each|one)\s+way\b/i.test(clauses[i])
      || !/\bdays?\s*(?:a|per|\/)\s*week\b/i.test(clauses[i + 1])) continue;
    const start = text.indexOf(clauses[i]), next = text.indexOf(clauses[i + 1], start + clauses[i].length);
    if (start >= 0 && next >= 0) clauses.splice(i, 2, text.slice(start, next + clauses[i + 1].length));
  }
  return clauses;
}

const monthNames = "january|february|march|april|may|june|july|august|september|october|november|december";
/** Like hasTimingLanguage, but "by" only counts before a date ("by 2029", "by March"). "By train" is not a date. */
export function hasDateLanguage(text: string): boolean {
  const withoutByWord = text.replace(new RegExp(`\\bby\\s+(?!(?:the\\s+(?:end|start|beginning)|next|this|last|20\\d{2}|\\d|${monthNames})\\b)\\w+`, "gi"), "");
  return hasTimingLanguage(withoutByWord);
}
/**
 * True when some clause names a date but no extracted change comes from that clause, so the date would be silently
 * dropped and the change would land on today. "moving to San Antonio, TX next year" is the classic case: the date is
 * in the clause after the comma. Ask instead of guessing.
 */
export function hasOrphanTiming(text: string, quotes: string[]): boolean {
  return splitClauses(text).some(clause => hasDateLanguage(clause) && !quotes.some(quote => clause.includes(quote) || quote.includes(clause)));
}

export type EventTiming = { resolved: true; month: number; inferred: boolean; assumptions: string[] }
  | { resolved: false; reason: string };

/** Pure month offsets relative to the supplied date. No system clock or model math. */
export function resolveEventMonth(phrase: string | undefined, todayISO: string, pregnancy = false): EventTiming {
  z.iso.date().parse(todayISO);
  if (!phrase) return pregnancy
    ? { resolved: true, month: 9, inferred: true, assumptions: ["Pregnancy mention implies one additional child at month 9; timing requires confirmation."] }
    : { resolved: true, month: 0, inferred: false, assumptions: ["No future timing stated; proposal starts in the current month."] };
  const text = phrase.trim().toLowerCase().replace(/^(?:starting|beginning)\s+/, "");
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
  const season = text.match(/^(?:in\s+)?(?:the\s+)?(?:(this|next)\s+)?(spring|summer|fall|autumn|winter)(?:\s+(20\d{2}))?$/);
  if (season) {
    const representative: Record<string, number> = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 };
    const month = representative[season[2]];
    const year = season[3] ? Number(season[3]) : currentYear + (season[1] === "this" ? 0 : month < currentMonth ? 1 : 0);
    const offset = (year - currentYear) * 12 + month - currentMonth;
    if (offset < 0) return { resolved: false, reason: "That season is in the past; specify a future month and year" };
    return { resolved: true, month: offset, inferred: true,
      assumptions: [`${season[2]} is represented by ${names[month - 1]} ${year} using a US-season estimate; confirm or correct the start month.`] };
  }
  const calendar = text.match(new RegExp(`^(?:in )?(?:(this|next) )?(${names.join("|")})(?: (20\\d{2}))?$`));
  const iso = /^20\d{2}-\d{2}-\d{2}$/.test(text) && z.iso.date().safeParse(text).success ? text.split("-").map(Number) : null;
  if (calendar || iso) {
    const targetMonth = iso ? iso[1] : names.indexOf(calendar![2]) + 1;
    const statedYear = iso ? iso[0] : calendar![3] ? Number(calendar![3]) : undefined;
    if (statedYear === undefined && !calendar![1]) {
      const year = currentYear + (targetMonth < currentMonth ? 1 : 0);
      return { resolved: true, month: (year - currentYear) * 12 + targetMonth - currentMonth, inferred: true,
        assumptions: [`No year stated: assuming the upcoming ${names[targetMonth - 1]} ${year}; confirm the date.`] };
    }
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
