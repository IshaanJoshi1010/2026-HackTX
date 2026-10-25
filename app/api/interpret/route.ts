import { readJsonBody, requestError } from "../requestBody";
import { interpret, InterpretRequestSchema } from "../../../ai/interpret";
import type { AIStatusInfo } from "../../../ai/status";
export async function POST(request: Request) {
  try {
    const parsed = InterpretRequestSchema.safeParse(await readJsonBody(request, 131072));
    if (!parsed.success) return Response.json({ error: "Invalid interpret request" }, { status: 400 });
    let status: AIStatusInfo | undefined;
    const result = await interpret(parsed.data.prompt, parsed.data.context, { signal: request.signal, onUnavailable: info => { status = info; } });
    const headers: Record<string, string> = { "cache-control": "no-store", "x-fork-ai-status": result.aiAvailable ? "ready" : status?.status ?? "invalid-response" };
    if (status?.retryAfter) headers["retry-after"] = String(status.retryAfter);
    return Response.json(result, { headers });
  } catch (error) { return requestError(error, "Invalid interpret request"); }
}
