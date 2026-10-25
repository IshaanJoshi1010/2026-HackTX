// Fixed locale so server and client always print the same text.
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const usd = (n: number): string => usdFmt.format(n);
/** "+$4,310", "-$800", "$0". For a difference between two futures. */
export function signedUsd(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "$0";
  return `${r > 0 ? "+" : "-"}${usdFmt.format(Math.abs(r))}`;
}
export const miles = (n: number): string => `${numFmt.format(n)} mi`;

/** "Now", "1 yr", "2 yr 3 mo" for a month offset on the 60 month axis. */
export function monthLabel(month: number): string {
  if (month === 0) return "Now";
  const years = Math.floor(month / 12);
  const rest = month % 12;
  if (years === 0) return `${rest} mo`;
  return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
}

/** "paid_off" becomes "Paid off", "low" becomes "Low". Sentence case, never all capitals. */
export function sentence(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
