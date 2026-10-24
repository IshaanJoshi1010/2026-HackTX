import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createExplainer } from "./explain";
import { DecisionEvaluationSchema, SimulationResultSchema } from "../contracts/schemas";
import snapshot from "./fixtures/dev4-explanation.json";

const evaluation = DecisionEvaluationSchema.parse(snapshot.evaluation);
const results = snapshot.results.map(result => SimulationResultSchema.parse(result));

describe("Dev 4 explanation compatibility", () => {
  it("retains the actual engine verdict, rationale and unverified fit in offline fallback without mutating input", async () => {
    const before = structuredClone({ evaluation, results });
    const response = await createExplainer(async () => { throw new Error("offline"); })(evaluation, results);
    expect(response.usedFallback).toBe(true);
    for (const line of evaluation.rationale) expect(response.text).toContain(line);
    expect(response.text).toContain("Physical car seat fit still needs verification.");
    expect(response.text).toContain("Packing fit still needs verification.");
    expect(response.text).toContain(evaluation.nextAction.detail);
    expect(response.text).not.toContain("car_seat_fit=unverified");
    expect({ evaluation, results }).toEqual(before);
  });

  it("supplies decoded fit issues from earlier points without sending the full monthly timeline", async () => {
    const earlierIssue = structuredClone(results);
    earlierIssue[0].points[0].suitability.constraints = ["seats_below_household"];
    // The final month has no passenger constraint, so finalPoint alone loses this issue.
    earlierIssue[0].points.at(-1)!.suitability.constraints = [];
    const generate = vi.fn().mockResolvedValue(evaluation.rationale[0]);
    const response = await createExplainer(generate)(evaluation, earlierIssue);
    expect(response.usedFallback).toBe(false);
    const input = generate.mock.calls[0][0].input;
    expect(input.results[0].fitChecks).toContain("There are fewer seats than household members.");
    expect(input.results[0].points).toBeUndefined();
    expect(input.results[0].finalPoint).toEqual(earlierIssue[0].points.at(-1));
  });

  it("accepts supplied rounded rationale numbers but rejects invented savings and score percentages", async () => {
    const safe = await createExplainer(async () => evaluation.rationale.join("\n"))(evaluation, results);
    expect(safe.usedFallback).toBe(false);
    for (const prose of ["Guaranteed savings of $99999.", "The RAV4 scores 55%.", "There is 60% confidence.", "Confidence is sixty percent."]) {
      const rejected = await createExplainer(async () => prose)(evaluation, results);
      expect(rejected.usedFallback).toBe(true);
      expect(rejected.text).not.toContain(prose);
    }
  });

  it("keeps inconclusive decisions explicit and preserves engine warnings and constraints", async () => {
    const constrained = { ...evaluation, preferredScenarioId: "inconclusive", rationale: ["No scenario meets the hard constraints"], hardConstraints: ["Keep: seats_below_household from month 12"] };
    const warned = structuredClone(results);
    warned[0].warnings.push("Finance type unknown; using the balance and payment on record as a loan");
    const response = await createExplainer(async () => "invented 99999")(constrained, warned);
    expect(response.text).toContain("do not establish a clear preferred scenario");
    expect(response.text).toContain(constrained.rationale[0]);
    expect(response.text).toContain(constrained.hardConstraints[0]);
    expect(response.text).toContain(warned[0].warnings.at(-1));
  });
});
