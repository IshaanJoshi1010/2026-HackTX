import { readJsonBody, requestError } from "../requestBody";
import { z } from "zod";
import { explain, InvalidExplanationInput } from "../../../ai/explain";
import { DecisionEvaluationSchema, SimulationResultSchema } from "../../../contracts/schemas";
const schema = z.object({ evaluation: DecisionEvaluationSchema, results: z.array(SimulationResultSchema).max(20) }).strict();
import type { AIStatusInfo } from "../../../ai/status";
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJsonBody(request, 524288));
    if (!parsed.success) return Response.json({ error: "Invalid explain request" }, { status: 400 });
    let status: AIStatusInfo | undefined;
    const result = await explain(parsed.data.evaluation, parsed.data.results, { signal: request.signal, onUnavailable: info => { status = info; } });
    // Add the requested no-key signal without changing the frozen explain() return type.
    const headers: Record<string, string> = { "cache-control": "no-store", "x-fork-ai-status": result.usedFallback ? status?.status ?? "invalid-response" : "ready" };
    if (status?.retryAfter) headers["retry-after"] = String(status.retryAfter);
    return Response.json({ ...result, aiAvailable: !result.usedFallback }, { headers });
  } catch (error) {
    if (error instanceof InvalidExplanationInput) return Response.json({ error: "Evaluation and results must describe the same scenarios" }, { status: 400 });
    return requestError(error, "Invalid explain request");
  }
}
