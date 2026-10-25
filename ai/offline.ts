import type { Intent, LifeEvent } from "../contracts";
import { dailyMileagePattern } from "../data/drivingRate";
import { hasTimingLanguage, splitClauses, hasOrphanTiming } from "./dates";
import { ambiguousStatement, isQuestion, quantityPattern, readQuantity } from "./evidence";
import { mapExtraction, pregnancyMention } from "./mapper";
import type { ExtractionItem } from "./schema";

export interface OfflineReading {
  intent: Intent;
  events: Omit<LifeEvent, "id" | "status">[];
  note?: string;
}
/** Client-safe conservative parser. No network, model, clock or confirmed-state writes. */
export function interpretOffline(text: string, todayISO: string): OfflineReading {
  const empty = (note?: string): OfflineReading => ({ intent: "CLARIFY", events: [], ...(note ? { note } : {}) });
  if (!text.trim() || text.length > 8000) return empty();
  // Questions must be classified before extracting any quantities or changes.
  if (isQuestion(text)) {
    if (/\b(?:corolla|prius|highlander|tacoma|tundra|sienna|4runner|venza|sequoia|crown|bz4x|supra)\b/i.test(text)) return empty("Fork currently supports only the 2022 Camry SE and 2024 RAV4 Hybrid XLE.");
    if (/break[ -]?even|what (?:would|needs to)|how (?:low|few)|threshold/i.test(text)) return { intent: "FIND_BREAK_EVEN", events: [] };
    if (/\b(?:rav4|switch|replace|replacing|compare|hybrid)\b/i.test(text)) return { intent: "COMPARE_SCENARIOS", events: [] };
    if (/^\s*why\b|\bexplain\b/i.test(text)) return { intent: "EXPLAIN_RESULT", events: [] };
    if (/what should I do|next (?:step|action|move)/i.test(text)) return { intent: "RECOMMEND_ACTION", events: [] };
    return empty("That sounds like a question. Describe a definite change to create a proposal.");
  }
  if (ambiguousStatement(text)) return empty("Please confirm the intended change; negatives, corrections and hypotheticals are not applied automatically.");
  const conflictingCargo = text.match(/\b(?:cargo|luggage|storage)\b[^.;!?]*?\b(low|medium|high)\b\s*(?:and|or|\/)\s*(low|medium|high)\b/i);
  if (conflictingCargo && conflictingCargo[1].toLowerCase() !== conflictingCargo[2].toLowerCase()) return empty("Choose one cargo tier for that change.");
  const items: ExtractionItem[] = [];
  const clauses = splitClauses(text);
  // Keep a following schedule in the literal quote so code can annualize without guessing extra driving.
  for (let i = 0; i + 1 < clauses.length; i++) {
    if (!new RegExp(dailyMileagePattern, "i").test(clauses[i]) || !/^\d+(?:\.\d+)?\s*days?\s*(?:a|per|\/)\s*week\b/i.test(clauses[i + 1])) continue;
    const start = text.indexOf(clauses[i]);
    const next = text.indexOf(clauses[i + 1], start + clauses[i].length);
    if (start >= 0 && next >= 0) clauses.splice(i, 2, text.slice(start, next + clauses[i + 1].length));
  }
  for (const quote of clauses) {
    // Preserve the raw time phrase. Unsupported timing is sent to validation, never clamped or erased.
    const timing = quote.match(/\b(?:starting\s+)?(?:in\s+)?(?:the\s+)?(?:(?:next|this)\s+)?(?:spring|summer|fall|autumn|winter)(?:\s+20\d{2})?\b|\b(?:next|this)\s+(?:month|year|week|spring|summer|fall|autumn|winter|january|february|march|april|may|june|july|august|september|october|november|december)\b|\bin\s+[^,;]*?\b(?:months?|years?|weeks?|days?)\b|\b(?:in\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+20\d{2})?\b|\b(?:in\s+)?20\d{2}\b/i)?.[0];
    const add = (field: ExtractionItem["field"], value: number | string, inferred = false) => items.push({ field, value, certainty: inferred ? "inferred" : "clear", quote, assumptions: [], ...(timing ? { month: timing } : {}) });
    const city = quote.match(/\b(?:moving|move|relocating|relocate)\s+to\s+(.+?)(?=\s+(?:next|in|this|by|after|before|soon)\b|$)/i);
    if (city) add("location", city[1].trim());
    const q = `(${quantityPattern})`;
    const annual = quote.match(new RegExp(`${q}\\s*(?:annual\\s+)?(?:miles|mi)\\s*(?:a\\s+year|per\\s+year|annually|yearly|/\\s*(?:year|yr))|${q}\\s*annual\\s+(?:miles|mi)|(?:drive|drives|driving|drove)\\s+(?:about\\s+|around\\s+|roughly\\s+|approximately\\s+|nearly\\s+)?${q}\\s*(?:a\\s+year|per\\s+year|annually|yearly|/\\s*(?:year|yr))`, "i"));
    const namedAnnual = quote.match(new RegExp(`(?:annual|yearly)\\s+(?:mileage|miles)\\s*(?:is|of|:|=)?\\s*${q}`, "i"));
    if (annual) add("annualMiles", readQuantity(annual[1] ?? annual[2] ?? annual[3]));
    else if (namedAnnual) add("annualMiles", readQuantity(namedAnnual[1]));
    const daily = quote.match(new RegExp(dailyMileagePattern, "i"));
    if (daily) add("annualMiles", daily[0], true);
    const cargoLevels = [...new Set(quote.toLowerCase().match(/\b(?:low|medium|high)\b/g) ?? [])];
    if (/\b(?:cargo|luggage|storage)\b/i.test(quote) && cargoLevels.length === 1) add("cargoNeed", cargoLevels[0]);
    const commute = quote.match(new RegExp(`${q}\\s*(?:miles|mi)\\s*(?:each|one)\\s*way`, "i"));
    const linkedDistance = /\bcommut\w*|\b(?:job|office|workplace)\b|\bdriv\w*[^.;!?]*\bto work\b/i.test(quote)
      ? quote.match(new RegExp(`${q}\\s*(?:miles|mi)\\s*(?:away|from\\s+(?:home|work)|to\\s+work)`, "i")) : null;
    const jobDistance = quote.match(new RegExp(`(?:job|office|workplace)\\b[^.;!?]{0,40}?${q}\\s*(?:miles|mi)\\s*away`, "i"));
    if (commute) add("commuteMilesOneWay", readQuantity(commute[1]));
    else if (jobDistance || linkedDistance) add("commuteMilesOneWay", readQuantity((jobDistance ?? linkedDistance)![1]), true);
    const days = quote.match(new RegExp(`${q}\\s*days?\\s*(?:a|per|/)\\s*week`, "i"));
    if (days && /\bcommut\w*|\bto (?:work|the office|campus|school)\b/i.test(text)) add("commuteDaysPerWeek", readQuantity(days[1]));
    const children = quote.match(new RegExp(`${q}\\s+(?:children|child|kids?|bab(?:y|ies))`, "i"));
    if (children) add("children", readQuantity(children[1]), pregnancyMention(quote));
    else if (pregnancyMention(quote)) add("childrenDelta", 1, true);
    const budget = quote.match(new RegExp(`budget\\s*(?:is|of|:|=)?\\s*\\$?\\s*${q}`, "i"));
    if (budget) add("monthlyBudget", readQuantity(budget[1]));
    const fuel = quote.match(new RegExp(`\\$?\\s*${q}\\s*(?:per|a|/)\\s*(?:gal|gallon)`, "i"));
    if (fuel) add("fuelPricePerGal", readQuantity(fuel[1]));
    if (!timing && hasTimingLanguage(quote) && items.some(item => item.quote === quote)) return empty("Please specify a calendar month and year for that change.");
  }
  if (items.length && hasOrphanTiming(text, items.map(item => item.quote))) return empty("Put the date next to the change, or choose an explicit month in the manual form.");
  const mapped = mapExtraction({ intent: "CREATE_SCENARIO", items }, {
    vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: {}, existingEvents: [], todayISO,
  }, text);
  if (mapped.unresolved.length) return empty("Please clarify the value or timing. Changes must fall within the five-year timeline.");
  if (!mapped.result.aiAvailable || !mapped.result.proposals.length) return empty("No supported change found. Try the manual form.");
  return { intent: "CREATE_SCENARIO", events: mapped.result.proposals.map(event => ({ type: event.type, month: event.month, payload: event.payload, source: "user", quote: event.quote, assumptions: event.assumptions, certainty: event.certainty })) };
}
