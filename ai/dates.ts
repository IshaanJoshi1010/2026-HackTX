import { z } from "zod";
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
  const relative = text.match(/^in (\d+) (months?|years?)$/);
  if (relative) {
    const month = Number(relative[1]) * (relative[2].startsWith("year") ? 12 : 1);
    return Number.isSafeInteger(month) ? { resolved: true, month, inferred: false, assumptions: [] } : { resolved: false, reason: "Timing is outside the supported numeric range" };
  }
  const year = text.match(/^(?:in )?(\d{4})$/);
  if (year) {
    const [currentYear, currentMonth] = todayISO.split("-").map(Number);
    const month = (Number(year[1]) - currentYear) * 12 + 6 - currentMonth;
    return month < 0 ? { resolved: false, reason: "The default June date is in the past; ask for a future month" }
      : { resolved: true, month, inferred: true, assumptions: ["A bare year is mapped to June of that year; confirm the assumed month."] };
  }
  return { resolved: false, reason: "Timing is vague or unsupported; do not invent a month" };
}
