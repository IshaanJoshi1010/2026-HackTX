import { describe, expect, it } from "vitest";
import { resolveEventMonth } from "@/ai/dates";
import { fixtureEvents } from "./fixtures";
import { fitWord, inferredDateNote, isDateAssumption, plainAssumption, plainConstraint, plainWarning } from "./explain";

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

/** Every string the app is known to write, with the sentence a person should read instead. */
const KNOWN: Array<[string, string]> = [
  // ai/dates.ts
  ["summer is represented by june 2027 using a US-season estimate; confirm or correct the start month.", "June 2027 is assumed because you only said summer. Change it if that is wrong."],
  ["winter is represented by december 2026 using a US-season estimate; confirm or correct the start month.", "December 2026 is assumed because you only said winter. Change it if that is wrong."],
  ["autumn is represented by september 2028 using a US-season estimate; confirm or correct the start month.", "September 2028 is assumed because you only said autumn. Change it if that is wrong."],
  ["No year stated: assuming the upcoming march 2027; confirm the date.", "March 2027 is assumed because you did not give a year. Change it if that is wrong."],
  ["A bare year is mapped to June of that year; confirm the assumed month.", "June is assumed because you provided only the year."],
  ["No future timing stated; proposal starts in the current month.", "You did not say when, so this starts this month."],
  ["Pregnancy mention implies one additional child at month 9; timing requires confirmation.", "You mentioned a pregnancy, so the new child is placed nine months from now. Change it if that is wrong."],
  ["Timeline uses the stated calendar month, not a day within it.", "Only the month you gave is used, not the day."],
  // ui/command/ManualEventForm.tsx
  ["You didn't pick a time, so this starts now.", "You did not pick a time, so this starts now."],
  // ai/mapper.ts, data/drivingRate.ts
  ["Destination distance is assumed one way; confirm the commute distance.", "That distance is taken as one way. Change it if your commute is different."],
  [
    "Daily driving converted by code: 40 miles/day × 365 days/year = 14600 annual miles. Assumes driving every day; confirm the frequency.",
    "Your daily miles are multiplied out as if you drive every day of the year. Change it if you do not.",
  ],
  [
    "Daily driving converted by code: 40 miles/day × 5 days/week × 52 weeks/year = 10400 annual miles. Assumes 52 weeks and no additional driving; confirm the estimate.",
    "Your daily miles are multiplied out over the days a week you gave, for every week of the year, with no other driving. Change it if that is wrong.",
  ],
  // sim/branch.ts, sim/makeReplace.ts
  ["Moved from month 3 to the fork month 12", "Moved to the month this future begins."],
  ["Replacement month 12 chosen by the user", "The swap is placed in the month you chose."],
  ["Replacement month 12 matches the first relocation or family change", "The swap is placed in the same month as your first big life change."],
  ["Replacement month defaults to 12", "No big life change is set, so the swap is placed a year from now."],
  ["Replacement month defaults to 24", "No big life change is set, so the swap is placed 2 years from now."],
  ["Replacement month defaults to 7", "No big life change is set, so the swap is placed 7 months from now."],
  // ui/store/carryOver.ts
  ['Replaces "Move to Denver" at month 12 from the earlier future', 'This replaces "Move to Denver" from the earlier future.'],
  // data/finance.ts, data/defaults.ts
  ["Paid-off selection requires no additional finance questions.", "You said the car is paid off, so there are no payments to ask about."],
  ["Estimated demo finance only; no account or credit data was accessed.", "Finance figures are estimates. Fork did not look at any account or credit details."],
  [
    "Original loan term 72 months; remaining term uses whole-year vehicle age with a 12-month minimum; 20% initial down payment; illustrative APR 7%.",
    "The loan is assumed to have started as a long loan with a down payment, and the time left comes from the car's age. The interest rate is an illustrative one.",
  ],
  [
    "Loan balance uses a straight-line age adjustment to the assumed original principal; payment uses amortization of that estimated remaining balance.",
    "Your loan balance is estimated from the car's age, and the payment is worked out from that balance.",
  ],
  [
    "Lease payment defaults to 1.2% of price monthly and end month to 24 when missing. These are labeled demo assumptions, not market offers.",
    "If you did not give lease details, Fork uses placeholder ones. They are not real offers.",
  ],
  [
    "Demo assumptions only; 20% down, 7% illustrative APR, 72-month original loan term or 36-month lease. Not an actual financing offer.",
    "These are placeholder loan terms, not a real financing offer.",
  ],
  [
    "Tax, fees and insurance seeds are illustrative demo assumptions, not local tax rules or real quotes. Consumers must opt into these explicitly.",
    "Tax, fees and insurance are illustrative figures, not local rules or real quotes.",
  ],
];

describe("plainAssumption: the strings the app writes", () => {
  it.each(KNOWN)("%s", (input, expected) => {
    expect(plainAssumption(input)).toBe(expected);
  });

  it("reads the same with a different case, spacing or without the closing full stop", () => {
    expect(plainAssumption("  A BARE YEAR IS MAPPED TO JUNE OF THAT YEAR; CONFIRM THE ASSUMED MONTH  ")).toBe("June is assumed because you provided only the year.");
    expect(plainAssumption("Moved from month 40 to the fork month 41.")).toBe("Moved to the month this future begins.");
  });

  it("covers what the real date reader writes today", () => {
    const today = "2026-10-24";
    const fromReader = [
      resolveEventMonth("summer 2027", today),
      resolveEventMonth("2029", today),
      resolveEventMonth("March", today),
      resolveEventMonth("2027-03-15", today),
      resolveEventMonth(undefined, today),
      resolveEventMonth(undefined, today, true),
    ].flatMap((t) => (t.resolved ? t.assumptions : []));
    expect(fromReader).toHaveLength(6);
    for (const note of fromReader) {
      const plain = plainAssumption(note);
      expect(plain, note).not.toBe(note);
      expect(plain).not.toMatch(/represented by|mapped to|proposal|requires confirmation|US-season/i);
      expect(isDateAssumption(note)).toBe(true);
    }
  });

  it("never shows the words demo or data, the model's wording, or a dash", () => {
    for (const [input] of KNOWN) {
      const out = plainAssumption(input);
      expect(out, input).not.toMatch(/\bdemo\b|\bdata\b/i);
      expect(out, input).not.toContain(EM_DASH);
      expect(out, input).not.toMatch(/no effect|doesn'?t matter/i);
      expect(out, input).toMatch(/[.!?]$/);
    }
  });
});

describe("plainAssumption: anything else gets a safe cleanup", () => {
  it("starts with a capital and ends with a full stop", () => {
    expect(plainAssumption("the car is assumed to be driven daily")).toBe("The car is assumed to be driven daily.");
    expect(plainAssumption("Already tidy.")).toBe("Already tidy.");
    expect(plainAssumption("Is this a question?")).toBe("Is this a question?");
  });

  it("collapses stray whitespace and returns nothing for nothing", () => {
    expect(plainAssumption("  two   spaces\n and a break ")).toBe("Two spaces and a break.");
    expect(plainAssumption("   ")).toBe("");
    expect(plainAssumption("")).toBe("");
  });

  it("takes out build-time words", () => {
    expect(plainAssumption("Uses demo data for the trade-in value")).toBe("Uses illustrative figures for the trade-in value.");
    expect(plainAssumption("A dataset was used")).not.toMatch(/data/i);
  });

  it("keeps the dashes out of copy that came from somewhere else", () => {
    const out = plainAssumption(`Guessed from the list ${EM_DASH} confirm it ${EN_DASH} soon`);
    expect(out).not.toContain(EM_DASH);
    expect(out).not.toContain(EN_DASH);
    expect(out).toBe("Guessed from the list, confirm it, soon.");
  });

  it("never turns 'not modeled' into 'no effect', and never adds certainty", () => {
    expect(plainAssumption("This has no effect on cost")).not.toMatch(/no effect/i);
    expect(plainAssumption("It has no modeled effect")).toBe("It is not modeled.");
    expect(plainAssumption("That doesn't matter here")).not.toMatch(/matter/i);
    const unsure = plainAssumption("Probably around June, not sure");
    expect(unsure).toBe("Probably around June, not sure.");
    expect(unsure).not.toMatch(/definitely|certain|will|exactly/i);
  });
});

describe("isDateAssumption", () => {
  it("is true for notes about when and false for the rest", () => {
    expect(isDateAssumption("A bare year is mapped to June of that year; confirm the assumed month.")).toBe(true);
    expect(isDateAssumption("Moved from month 3 to the fork month 12")).toBe(true);
    expect(isDateAssumption("Replacement month 12 matches the first relocation or family change")).toBe(true);
    expect(isDateAssumption("Destination distance is assumed one way; confirm the commute distance.")).toBe(false);
    expect(isDateAssumption("something unknown")).toBe(false);
  });
});

describe("inferredDateNote", () => {
  const base = { certainty: "clear" as const, assumptions: [] as string[], dateLabel: "Jun 2029" };

  it("is null when the date was stated", () => {
    expect(inferredDateNote(base)).toBeNull();
    expect(inferredDateNote({ ...base, assumptions: ["Destination distance is assumed one way; confirm the commute distance."] })).toBeNull();
  });

  it("says what was assumed when the date note is one the app knows", () => {
    expect(inferredDateNote({ ...base, certainty: "inferred", assumptions: ["A bare year is mapped to June of that year; confirm the assumed month."] })).toBe("June is assumed because you provided only the year.");
    expect(inferredDateNote({ ...base, assumptions: ["No future timing stated; proposal starts in the current month."] })).toBe("You did not say when, so this starts this month.");
  });

  it("joins more than one date note, once each, and skips the notes that are not about dates", () => {
    const note = inferredDateNote({
      ...base,
      assumptions: [
        "A bare year is mapped to June of that year; confirm the assumed month.",
        "A bare year is mapped to June of that year; confirm the assumed month.",
        "Moved from month 3 to the fork month 12",
        "Destination distance is assumed one way; confirm the commute distance.",
      ],
    });
    expect(note).toBe("June is assumed because you provided only the year. Moved to the month this future begins.");
  });

  it("still names the date as a best reading when the event is inferred and nothing says why", () => {
    const note = inferredDateNote({ ...base, certainty: "inferred" });
    expect(note).toBe("Jun 2029 is Fork's best reading of what you said. Change it if that is wrong.");
  });

  it("calls a vague date rough", () => {
    expect(inferredDateNote({ ...base, certainty: "vague" })).toBe("You were not specific about when, so Jun 2029 is a rough placement. Change it if that is wrong.");
  });

  it("works on the fixture events: the second child is inferred, the Denver move is not", () => {
    const kid = fixtureEvents.find((e) => e.id === "kid")!;
    const move = fixtureEvents.find((e) => e.id === "move")!;
    const swap = fixtureEvents.find((e) => e.id === "swap")!;
    expect(inferredDateNote(kid)).toBe("June 2027 is assumed because you only said summer. Change it if that is wrong.");
    expect(inferredDateNote(move)).toBeNull();
    expect(inferredDateNote(swap)).toBe("The swap is placed in the same month as your first big life change.");
  });
});

describe("plainWarning", () => {
  const CASES: Array<[string, string]> = [
    ["Event abc: vehicle_replacement has no vehicleId, so it has no effect", "The swap does not say which car to switch to, so it is not modeled."],
    ["Event abc: ignored unknown payload key mood", "Part of what you said is not something Fork models, so it is left out."],
    ['Event abc: ignored invalid annualMiles = "lots"', "One value could not be used, so it is left out."],
    ["Event abc: price only applies to vehicle_replacement; ignored", "A purchase detail only applies to a car swap, so it is left out."],
    ["Event abc: vehicleId only changes through vehicle_replacement; ignored", "Only a car swap can change the car, so that part is left out."],
    ["Event abc: no prior commute on record, so the full new commute was added to annual miles", "There is no earlier commute on record, so the whole new commute is added to your yearly miles."],
    ["Event abc: month 70 is past the 60-month horizon", "This lands after the five years Fork looks at, so it is not counted."],
    ["Month 12: annualMiles set by both a and b; using b", "Two changes set the same thing in the same month, so the later one is used."],
    ["Vehicle rav4 is not in the simulation context; the replacement is not modeled", "Fork could not load the other car, so the swap is not modeled."],
    ["Event abc: no modeled effect, move to Denver", "Not modeled: move to Denver."],
  ];

  it.each(CASES)("%s", (input, expected) => {
    expect(plainWarning(input)).toBe(expected);
  });

  it("falls back to a cleaned sentence without the event id, and never says no effect", () => {
    expect(plainWarning("Event xyz: something odd happened")).toBe("Something odd happened.");
    for (const [input] of CASES) expect(plainWarning(input)).not.toMatch(/no effect|\bdata\b|\bdemo\b/i);
    expect(plainWarning("It has no effect at all")).not.toMatch(/no effect/i);
  });
});

describe("fit and constraint words", () => {
  it("says fit in plain words", () => {
    expect(fitWord("good")).toBe("good");
    expect(fitWord("tight")).toBe("tight");
    expect(fitWord("insufficient")).toBe("not enough");
    expect(fitWord("needs_verification")).toBe("unverified");
  });

  it("says known hard constraints plainly and tidies unknown ones", () => {
    expect(plainConstraint("seats_below_household")).toBe("There are fewer seats than people in your household");
    expect(plainConstraint("car_seats_exceed_rear_positions")).toBe("There are fewer rear seat positions than car seats");
    expect(plainConstraint("seats_insufficient")).toBe("There are not enough seats");
    expect(plainConstraint("roof_too_low")).toBe("Roof too low");
  });
});
