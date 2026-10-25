import { readJsonBody, requestError } from "../requestBody";
import { interpret, InterpretRequestSchema } from "../../../ai/interpret";
export async function POST(request: Request) {
  try {
    const parsed = InterpretRequestSchema.safeParse(await readJsonBody(request, 131072));
    if (!parsed.success) return Response.json({ error: "Invalid interpret request" }, { status: 400 });
    return Response.json(await interpret(parsed.data.prompt, parsed.data.context));
  } catch (error) { return requestError(error, "Invalid interpret request"); }
}
