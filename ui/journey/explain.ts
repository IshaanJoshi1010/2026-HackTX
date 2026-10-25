import type { Fit } from "@/contracts";
import { customerText } from "@/ui/profile/customerText";
import type { JourneyEvent } from "./types";

/**
 * Words for people. The model and the parser write their notes for the people building Fork ("represented by june 2027
 * using a US-season estimate", "Moved from month 3 to the fork month 12"). Everything that reaches the explain card or
 * drawer goes through here first. One rule per string the app is known to write; anything else gets a safe cleanup that
 * never adds certainty. Pure: no store, no React.
 */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The dashes the build rules keep out of copy, built from their code points so this file never contains one. */
const LONG_DASHES = new RegExp(`\\s*[${String.fromCharCode(0x2014, 0x2013)}]\\s*`, "g");

/** Source notes sometimes say a thing "has no effect". Not modeled is not the same as no effect, so the words never reach a screen. */
function noClaimOfNoEffect(text: string): string {
  return text
    .replace(/\b(?:has|have) no (?:modeled )?effects?\b/gi, "is not modeled")
    .replace(/\bno (?:modeled )?effects?\b/gi, "no modeled change")
    .replace(/\b(?:does|do)(?:n['’]t| not) matter\b/gi, "is not modeled");
}

/** Sentence case, one space between words, a closing full stop. Never adds words that sound sure. */
function tidy(text: string): string {
  const cleaned = noClaimOfNoEffect(customerText(text))
    .replace(LONG_DASHES, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const sentence = cap(cleaned);
  return /[.!?]["')”]?$/.test(sentence) ? sentence : `${sentence}.`;
}

/** "twelve months" style: 12 is "a year", a whole number of years is "2 years", anything else is months. */
function fromNow(months: number): string {
  if (months === 12) return "a year";
  if (months > 12 && months % 12 === 0) return `${months / 12} years`;
  return months === 1 ? "a month" : `${months} months`;
}

interface Rule {
  /** Matched against the trimmed text, case-insensitive. */
  re: RegExp;
  say(m: RegExpExecArray): string;
  /** True when the sentence is about when something happens, so it also feeds the date note. */
  date?: boolean;
}

const TEXT_RULES: Rule[] = [
  // ---- dates (ai/dates.ts) ----
  {
    re: /^(spring|summer|fall|autumn|winter) is represented by ([a-z]+) (\d{4}) using a us-season estimate; confirm or correct the start month\.?$/i,
    say: (m) => `${cap(m[2].toLowerCase())} ${m[3]} is assumed because you only said ${m[1].toLowerCase()}. Change it if that is wrong.`,
    date: true,
  },
  {
    re: /^no year stated: assuming the upcoming ([a-z]+) (\d{4}); confirm the date\.?$/i,
    say: (m) => `${cap(m[1].toLowerCase())} ${m[2]} is assumed because you did not give a year. Change it if that is wrong.`,
    date: true,
  },
  {
    re: /^a bare year is mapped to june of that year; confirm the assumed month\.?$/i,
    say: () => "June is assumed because you provided only the year.",
    date: true,
  },
  {
    re: /^no future timing stated; proposal starts in the current month\.?$/i,
    say: () => "You did not say when, so this starts this month.",
    date: true,
  },
  {
    re: /^pregnancy mention implies one additional child at month 9; timing requires confirmation\.?$/i,
    say: () => "You mentioned a pregnancy, so the new child is placed nine months from now. Change it if that is wrong.",
    date: true,
  },
  {
    re: /^timeline uses the stated calendar month, not a day within it\.?$/i,
    say: () => "Only the month you gave is used, not the day.",
    date: true,
  },
  // ---- what the person typed by hand (ui/command/ManualEventForm.tsx) ----
  {
    re: /^you didn['’]t pick a time, so this starts now\.?$/i,
    say: () => "You did not pick a time, so this starts now.",
    date: true,
  },
  // ---- driving (ai/mapper.ts, data/drivingRate.ts) ----
  {
    re: /^destination distance is assumed one way; confirm the commute distance\.?$/i,
    say: () => "That distance is taken as one way. Change it if your commute is different.",
  },
  {
    re: /^daily driving converted by code: .* days\/year = .* annual miles\. assumes driving every day; confirm the frequency\.?$/i,
    say: () => "Your daily miles are multiplied out as if you drive every day of the year. Change it if you do not.",
  },
  {
    re: /^daily driving converted by code: .* weeks\/year = .* annual miles\. assumes 52 weeks and no additional driving; confirm the estimate\.?$/i,
    say: () => "Your daily miles are multiplied out over the days a week you gave, for every week of the year, with no other driving. Change it if that is wrong.",
  },
  // ---- branching and the swap (sim/branch.ts, sim/makeReplace.ts) ----
  {
    re: /^moved from month \d+ to the fork month \d+\.?$/i,
    say: () => "Moved to the month this future begins.",
    date: true,
  },
  {
    re: /^replacement month \d+ chosen by the user\.?$/i,
    say: () => "The swap is placed in the month you chose.",
    date: true,
  },
  {
    re: /^replacement month \d+ matches the first relocation or family change\.?$/i,
    say: () => "The swap is placed in the same month as your first big life change.",
    date: true,
  },
  {
    re: /^replacement month defaults to (\d+)\.?$/i,
    say: (m) => `No big life change is set, so the swap is placed ${fromNow(Number(m[1]))} from now.`,
    date: true,
  },
  // ---- a second brain dump (ui/store/carryOver.ts) ----
  {
    re: /^replaces "(.+)" at month \d+ from the earlier future\.?$/i,
    say: (m) => `This replaces "${customerText(m[1])}" from the earlier future.`,
  },
  // ---- finance (data/finance.ts, data/defaults.ts) ----
  {
    re: /^paid-off selection requires no additional finance questions\.?$/i,
    say: () => "You said the car is paid off, so there are no payments to ask about.",
  },
  {
    re: /^estimated demo finance only; no account or credit data was accessed\.?$/i,
    say: () => "Finance figures are estimates. Fork did not look at any account or credit details.",
  },
  {
    re: /^original loan term \d+ months; remaining term uses whole-year vehicle age .*$/i,
    say: () => "The loan is assumed to have started as a long loan with a down payment, and the time left comes from the car's age. The interest rate is an illustrative one.",
  },
  {
    re: /^loan balance uses a straight-line age adjustment .*$/i,
    say: () => "Your loan balance is estimated from the car's age, and the payment is worked out from that balance.",
  },
  {
    re: /^lease payment defaults to .* labeled demo assumptions, not market offers\.?$/i,
    say: () => "If you did not give lease details, Fork uses placeholder ones. They are not real offers.",
  },
  {
    re: /^demo assumptions only; .* not an actual financing offer\.?$/i,
    say: () => "These are placeholder loan terms, not a real financing offer.",
  },
  {
    re: /^tax, fees and insurance seeds are illustrative demo assumptions, .*$/i,
    say: () => "Tax, fees and insurance are illustrative figures, not local rules or real quotes.",
  },
];

/** The rewrite rule for a string, if it is one the app is known to write. */
function ruleFor(text: string): { rule: Rule; match: RegExpExecArray } | null {
  const trimmed = text.trim();
  for (const rule of TEXT_RULES) {
    const match = rule.re.exec(trimmed);
    if (match) return { rule, match };
  }
  return null;
}

/**
 * A model or parser note in words a person uses. Known strings get their own sentence, anything else gets a safe
 * cleanup (no build-time words, sentence case, a full stop) and is never made to sound more sure than it was.
 */
export function plainAssumption(text: string): string {
  const hit = ruleFor(text);
  return tidy(hit ? hit.rule.say(hit.match) : text);
}

/** True when the note is about when something happens: a guessed month, a default start, a moved date. */
export function isDateAssumption(text: string): boolean {
  return ruleFor(text)?.rule.date === true;
}

/**
 * The plain note about an event's date, or null when the date was stated. A date the person did not give (a bare year,
 * a season, no time at all) says what was assumed. An event the reader marked "inferred" without saying why still
 * says its date is a best reading, and a vague one says it is rough.
 */
export function inferredDateNote(event: Pick<JourneyEvent, "certainty" | "assumptions" | "dateLabel">): string | null {
  const notes = [...new Set(event.assumptions.filter(isDateAssumption).map(plainAssumption))];
  if (notes.length > 0) return notes.join(" ");
  if (event.certainty === "inferred") return tidy(`${event.dateLabel} is Fork's best reading of what you said. Change it if that is wrong`);
  if (event.certainty === "vague") return tidy(`You were not specific about when, so ${event.dateLabel} is a rough placement. Change it if that is wrong`);
  return null;
}

// ---- what the simulation says about an event (sim/events.ts, sim/simulate.ts) ----

const WARNING_RULES: Array<{ re: RegExp; say(m: RegExpExecArray): string }> = [
  { re: /^(?:event \S+: )?vehicle_replacement has no vehicleid\b.*$/i, say: () => "The swap does not say which car to switch to, so it is not modeled." },
  { re: /^(?:event \S+: )?ignored unknown payload key .*$/i, say: () => "Part of what you said is not something Fork models, so it is left out." },
  { re: /^(?:event \S+: )?ignored invalid .*$/i, say: () => "One value could not be used, so it is left out." },
  { re: /^(?:event \S+: )?\S+ only applies to vehicle_replacement; ignored$/i, say: () => "A purchase detail only applies to a car swap, so it is left out." },
  { re: /^(?:event \S+: )?vehicleid only changes through vehicle_replacement; ignored$/i, say: () => "Only a car swap can change the car, so that part is left out." },
  { re: /^(?:event \S+: )?no prior commute on record, so the full new commute was added to annual miles$/i, say: () => "There is no earlier commute on record, so the whole new commute is added to your yearly miles." },
  { re: /^(?:event \S+: )?month \d+ is past the \d+-month horizon$/i, say: () => "This lands after the five years Fork looks at, so it is not counted." },
  { re: /^month \d+: \S+ set by both \S+ and \S+; using \S+$/i, say: () => "Two changes set the same thing in the same month, so the later one is used." },
  { re: /^vehicle \S+ is not in the simulation context; the replacement is not modeled$/i, say: () => "Fork could not load the other car, so the swap is not modeled." },
  { re: /^(?:event \S+: )?no modeled effect,? ?(.*)$/i, say: (m) => (m[1] ? `Not modeled: ${m[1]}` : "This is not modeled yet.") },
];

/** A note from the simulation about an event, in plain words. "No effect" never survives: the model not putting a number on something is not the same thing. */
export function plainWarning(warning: string): string {
  const trimmed = warning.trim();
  for (const { re, say } of WARNING_RULES) {
    const m = re.exec(trimmed);
    if (m) return tidy(say(m));
  }
  return tidy(trimmed.replace(/^event \S+: /i, ""));
}

// ---- fit and constraints (decision/suitability.ts) ----

const FIT_WORDS: Record<Fit, string> = {
  good: "good",
  tight: "tight",
  insufficient: "not enough",
  needs_verification: "unverified",
};

export const fitWord = (fit: Fit): string => FIT_WORDS[fit];

const CONSTRAINT_WORDS: Record<string, string> = {
  seats_below_household: "There are fewer seats than people in your household",
  car_seats_exceed_rear_positions: "There are fewer rear seat positions than car seats",
  seats_insufficient: "There are not enough seats",
};

/** A hard constraint key in words, with no full stop so a month can follow it. */
export function plainConstraint(key: string): string {
  return CONSTRAINT_WORDS[key] ?? cap(customerText(key).replace(/_/g, " ").trim());
}
