import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createExplainer } from "./explain";
import { DecisionEvaluationSchema, SimulationResultSchema } from "../contracts/schemas";
import snapshot from "./fixtures/dev4-explanation.json";
import carSeatSnapshot from "./fixtures/dev4-car-seat-actions.json";
import demoStory from "./fixtures/dev4-demo-story.json";
import { POST } from "../app/api/explain/route";

const evaluation = DecisionEvaluationSchema.parse(snapshot.evaluation);
const results = snapshot.results.map(result => SimulationResultSchema.parse(result));
afterEach(() => vi.unstubAllEnvs());

describe("Dev 4 explanation compatibility", () => {
  it("opens the actual inconclusive demo with plain language and a computed next step", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const e = DecisionEvaluationSchema.parse(demoStory.evaluation);
    expect(e.preferredScenarioId).toBe("inconclusive");
    const response = await POST(new Request("http://localhost/api/explain", {
      method: "POST", body: JSON.stringify({ evaluation: e, results: demoStory.results }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.usedFallback).toBe(true);
    expect(body.text.startsWith("No option clearly leads on your priorities yet.")).toBe(true);
    expect(body.text).toContain(`Next step: ${e.nextAction.label}\n${e.nextAction.detail}`);
    expect(body.text.indexOf(e.nextAction.label)).toBeLessThan(body.text.indexOf(e.rationale[0]));
    for (const line of e.rationale) expect(body.text).toContain(line);
    expect(body.text).toContain("not a financial quote");
  });

  it.each(carSeatSnapshot.cases)("preserves Ani's corrected $when car-seat action and disclosure through the real offline route", async captured => {
    const e = DecisionEvaluationSchema.parse(captured.evaluation);
    const r = captured.results.map(result => SimulationResultSchema.parse(result));
    expect(e.nextAction.detail).toContain("3 rear seat positions, fewer than the 4 car seats");
    expect(e.nextAction.detail).toContain(captured.when === "today" ? "today" : "from month 12");
    expect(e.nextAction.detail).toContain("Fork does not verify physical car seat fit");
    expect(e.nextAction.detail).not.toContain("does not fit your household");
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(new Request("http://localhost/api/explain", {
      method: "POST", body: JSON.stringify({ evaluation: e, results: r }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.usedFallback).toBe(true);
    expect(body.text).toContain(e.nextAction.detail);
  });

  it("retains the actual engine verdict, rationale and unverified fit in offline fallback without mutating input", async () => {
    const before = structuredClone({ evaluation, results });
    const response = await createExplainer(async () => { throw new Error("offline"); })(evaluation, results);
    expect(response.usedFallback).toBe(true);
    for (const line of evaluation.rationale) expect(response.text).toContain(line);
    expect(response.text).toContain("Physical car seat fit still needs verification.");
    expect(response.text).toContain("Packing fit still needs verification.");
    expect(response.text).toContain(evaluation.nextAction.detail);
    expect(response.text.indexOf(evaluation.nextAction.detail)).toBeLessThan(response.text.indexOf(evaluation.rationale[0]));
    expect(response.text).toContain("What drives this comparison:");
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
    expect(response.text).toContain("No option clearly leads on your priorities yet");
    expect(response.text).toContain(constrained.rationale[0]);
    expect(response.text).toContain(constrained.hardConstraints[0]);
    expect(response.text).toContain(warned[0].warnings.at(-1));
  });

  it("preserves S6 robustness counts, sensitivity values and S7 actions from the actual engine", async () => {
    expect(evaluation.sensitivity).toHaveLength(evaluation.scenarioIds.length);
    const robustness = `Held in ${snapshot.sensitivity.heldCount} of ${snapshot.sensitivity.totalCount} tested cases`;
    expect(evaluation.rationale).toContain(robustness);
    const generate = vi.fn().mockResolvedValue(`${robustness}. ${evaluation.nextAction.detail}`);
    expect((await createExplainer(generate)(evaluation, results)).usedFallback).toBe(false);
    expect(generate.mock.calls[0][0].input.evaluation.sensitivity).toEqual(evaluation.sensitivity);
  });

  it("runs the real route without a key and retains the latest computed action and robustness line", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(new Request("http://localhost/api/explain", {
      method: "POST", body: JSON.stringify({ evaluation, results }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.usedFallback).toBe(true);
    expect(body.text).toContain(evaluation.nextAction.detail);
    expect(body.text).toContain(evaluation.rationale.at(-1));
  });

  it.each(["missing", "extra", "duplicate_result", "duplicate_evaluation", "unknown_winner", "partial_sensitivity"])(
    "rejects a %s comparison before generation and returns a route error", async kind => {
      const e = structuredClone(evaluation), r = structuredClone(results);
      if (kind === "missing") r.pop();
      if (kind === "extra") r.push({ ...r[0], scenarioId: "unrelated" });
      if (kind === "duplicate_result") r[1].scenarioId = r[0].scenarioId;
      if (kind === "duplicate_evaluation") e.scenarioIds[1] = e.scenarioIds[0];
      if (kind === "unknown_winner") e.preferredScenarioId = "unrelated";
      if (kind === "partial_sensitivity") e.sensitivity.pop();
      const generate = vi.fn();
      await expect(createExplainer(generate)(e, r)).rejects.toThrow("same scenarios");
      expect(generate).not.toHaveBeenCalled();
      const response = await POST(new Request("http://localhost/api/explain", {
        method: "POST", body: JSON.stringify({ evaluation: e, results: r }),
      }));
      expect(response.status).toBe(400);
    },
  );

  it("allows reordered matching results without changing the scenario-aligned sensitivity array", async () => {
    const generate = vi.fn().mockResolvedValue(evaluation.rationale[0]);
    expect((await createExplainer(generate)(evaluation, [...results].reverse())).usedFallback).toBe(false);
    expect(generate.mock.calls[0][0].input.evaluation.sensitivity).toEqual(evaluation.sensitivity);
  });
});
