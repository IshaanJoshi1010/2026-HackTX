import type { ExtractionItem } from "./schema";

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
export const quantityPattern = `(?:\\d+(?:,\\d{3})*(?:\\.\\d+)?\\s*k?|${[...words, ...ordinals].join("|")}|[1-9](?:st|nd|rd|th))`;
export function readQuantity(text: string): number {
  const token = text.trim().toLowerCase();
  if (words.includes(token)) return words.indexOf(token);
  if (ordinals.includes(token)) return ordinals.indexOf(token) + 1;
  return Number(token.replaceAll(",", "").replace(/(?:st|nd|rd|th)$/, "").replace(/k$/, "")) * (/k$/.test(token) ? 1000 : 1);
}
export function isQuestion(text: string): boolean {
  return text.includes("?") || /^\s*(?:if|should|would|could|can|will|what|how|why|which|is|are|does|do)\b/i.test(text);
}
/** Conservative: ask rather than extract a change from a denial, hypothetical or correction. */
export function ambiguousStatement(text: string): boolean {
  return /\b(?:not|never|no longer|cannot|maybe|might|could|would|perhaps|unless|instead|actually|correction)\b|\b(?:isn|aren|wasn|weren|don|doesn|won|wouldn|can|couldn)'t\b|\bif\b|\bmay\s+(?:well\s+)?(?:be|move|relocate|have|drive|switch|change|need|cost|start|end)\b/i.test(text);
}

/** Match the quantity and its meaning together, not any unrelated number in the quote. */
export function hasNumericEvidence(field: ExtractionItem["field"], value: number, quote: string): boolean {
  const q = `(?<quantity>${quantityPattern})`;
  const miles = "(?:miles|mi)";
  const year = "(?:a\\s+year|per\\s+year|annually|yearly|/\\s*(?:year|yr))";
  const patterns: Partial<Record<ExtractionItem["field"], string[]>> = {
    annualMiles: [`${q}\\s*(?:annual\\s+)?${miles}\\s*(?:${year})`, `${q}\\s*(?:annual\\s+${miles}|${year})`, `(?:annual|yearly)\\s+(?:mileage|miles)\\s*(?:is|of|:|=)?\\s*${q}`],
    commuteMilesOneWay: [`${q}\\s*${miles}\\s*(?:each|one)\\s*way`],
    commuteDaysPerWeek: [`${q}\\s*days?\\s*(?:a|per|/)\\s*week`],
    children: [`${q}\\s+(?:children|child|kids?|bab(?:y|ies))`, `(?:children|kids?)\\s*(?:is|are|:|=|will be)\\s*${q}`],
    householdSize: [`(?:household|family)\\s*(?:size)?\\s*(?:is|of|:|=|will be)?\\s*${q}`, `${q}\\s+(?:people|persons|members)`],
    carSeats: [`${q}\\s+(?:child|car)\\s*seats?`, `(?:child|car)\\s*seats?\\s*(?:is|are|:|=)?\\s*${q}`],
    monthlyBudget: [`(?:budget|afford)\\s*(?:is|of|:|=|up to)?\\s*\\$?\\s*${q}`],
    fuelPricePerGal: [`\\$?\\s*${q}\\s*(?:per|a|/)\\s*(?:gal|gallon)`],
    financePayment: [`(?:monthly\\s+payment|payment|paying|pay)\\s*(?:is|of|:|=)?\\s*\\$?\\s*${q}`, `\\$?\\s*${q}\\s*(?:per|a|/)\\s*month\\s*(?:loan|lease|payment)`],
    financeEndMonth: [`(?:lease\\s*(?:ends?|remaining)?\\s*(?:in)?\\s*)${q}\\s*months?`, `${q}\\s*months?\\s*(?:left|remaining)\\s*(?:on\\s+(?:my\\s+)?)?lease`],
    mileage: [`(?:odometer|current\\s+mileage|mileage)\\s*(?:reads|is|of|:|=)?\\s*${q}`, `(?:has|at)\\s+${q}\\s*${miles}\\b`],
  };
  return (patterns[field] ?? []).some(pattern => [...quote.matchAll(new RegExp(`(?<![\\w.$-])${pattern}`, "gi"))]
    .some(match => readQuantity(match.groups!.quantity) === value));
}
