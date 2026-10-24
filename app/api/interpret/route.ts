import { interpret, InterpretRequestSchema } from "../../../ai/interpret";
export async function POST(request: Request) {
  try {
    const parsed = InterpretRequestSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Invalid interpret request" }, { status: 400 });
    return Response.json(await interpret(parsed.data.prompt, parsed.data.context));
  } catch { return Response.json({ error: "Invalid interpret request" }, { status: 400 }); }
}
