import { monthLabel } from "@/ui/profile/format";

// Calendar labels for the months of the road. Pure and in UTC terms: only the year and month of `todayISO` are used, so
// the same input gives the same text on the server, in the browser and in any time zone. Bad input gives "", never "NaN".

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const daysIn = (year: number, month0: number): number => (month0 === 1 ? (isLeap(year) ? 29 : 28) : [3, 5, 8, 10].includes(month0) ? 30 : 31);

/** "2026-10-24" (or "2026-10", or a full ISO timestamp) to its year and zero based month. Null when it is not a real date. */
function startOf(todayISO: string): { year: number; month0: number } | null {
  if (typeof todayISO !== "string") return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T\s].*)?$/.exec(todayISO.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month0 = Number(match[2]) - 1;
  if (month0 < 0 || month0 > 11) return null;
  if (match[3] !== undefined) {
    const day = Number(match[3]);
    if (day < 1 || day > daysIn(year, month0)) return null;
  }
  return { year, month0 };
}

/**
 * The calendar month a month offset lands in: month 0 is the month `todayISO` is in.
 * dateLabel("2026-10-24", 12) is "Oct 2027". An unreadable date, or a month that is not a whole number of months from
 * now or later, gives "".
 */
export function dateLabel(todayISO: string, month: number): string {
  const start = startOf(todayISO);
  if (!start || typeof month !== "number" || !Number.isFinite(month) || month < 0) return "";
  const total = start.year * 12 + start.month0 + Math.round(month);
  const year = Math.floor(total / 12);
  if (!Number.isSafeInteger(total) || year > 9999) return "";
  return `${MONTH_NAMES[total % 12]} ${year}`;
}

/** "Now" for month 0, otherwise "In 1 yr", "In 8 mo", "In 2 yr 8 mo". "" for a month that is not a number of months from now. */
export function whenLabel(month: number): string {
  if (typeof month !== "number" || !Number.isFinite(month) || month < 0) return "";
  const whole = Math.round(month);
  return whole === 0 ? "Now" : `In ${monthLabel(whole)}`;
}
