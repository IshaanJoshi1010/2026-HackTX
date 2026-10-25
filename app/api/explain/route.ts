import { readJsonBody, requestError } from "../requestBody";
import { z } from "zod";
import { explain, InvalidExplanationInput } from "../../../ai/explain";
import { DecisionEvaluationSchema, SimulationResultSchema } from "../../../contracts/schemas";
const schema = z.object({ evaluation: DecisionEvaluationSchema, results: z.array(SimulationResultSchema).max(20) }).strict();
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJsonBody(request, 524288));
    if (!parsed.success) return Response.json({ error: "Invalid explain request" }, { status: 400 });
    const result = await explain(parsed.data.evaluation, parsed.data.results);
    // Add the requested no-key signal without changing the frozen explain() return type.
    return Response.json({ ...result, ...(!process.env.GEMINI_API_KEY?.trim() ? { aiAvailable: false } : {}) });
  } catch (error) {
    if (error instanceof InvalidExplanationInput) return Response.json({ error: "Evaluation and results must describe the same scenarios" }, { status: 400 });
    return requestError(error, "Invalid explain request");
  }
}
