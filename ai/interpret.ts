import "server-only";
import { z } from "zod";
import type { InterpretContext, InterpretResult, Question } from "../contracts";
import { InterpretContextSchema } from "../contracts/schemas";
import { applyDefaults } from "../data/defaults";
import { gapCheck } from "../data/gapCheck";
import { ExtractionSchema, type Extraction } from "./schema";
import { mapExtraction } from "./mapper";
import { generateWithGemini, type Generator } from "./gemini";
import { extractionInstructions } from "./prompts/system";

const jsonSchema = z.toJSONSchema(ExtractionSchema) as Record<string, unknown>;
delete jsonSchema.$schema;
interface SchemaNode { properties?: Record<string, SchemaNode>; items?: SchemaNode; [key: string]: unknown }
function groundedResponseSchema(prompt: string): Record<string, unknown> {
  // Constrain quote copying at generation time too, including dates before the event.
  // Whole-prompt fallback preserves values containing conjunctions or punctuation.
  const quotes = [...new Set([prompt, ...prompt.split(/[!?;\n]|[.,](?!\d)|\s+and\s+/i).map(part => part.trim()).filter(Boolean)])];
  const schema = structuredClone(jsonSchema) as SchemaNode;
  schema.properties!.items.items!.properties!.quote = { type: "string", enum: quotes };
  return schema;
}
export const InterpretRequestSchema = z.object({ prompt: z.string().trim().min(1).max(8000), context: InterpretContextSchema }).strict();
const clarify = (): InterpretResult => ({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [] });

function gatedQuestion(extraction: Extraction, context: InterpretContext): Question | null {
  const uncertain = extraction.items.filter(item => item.certainty === "vague").map(item => item.field);
  const candidate = gapCheck(applyDefaults(context.profile), {
    view: extraction.intent === "COMPARE_SCENARIOS" || extraction.intent === "RECOMMEND_ACTION" ? "compare" : "keep",
    vagueCommute: uncertain.includes("commuteMilesOneWay") || uncertain.includes("commuteDaysPerWeek"),
    budgetMentioned: extraction.items.some(item => item.field === "monthlyBudget"),
    uncertainFields: uncertain,
  }).question;
  // Only an actual extraction ambiguity may ask a question. Do not manufacture onboarding gaps from a greeting or pure query.
  return extraction.clarifyingQuestion && candidate && candidate.field === extraction.clarifyingQuestion.field
    ? { ...candidate, kind: "chips", options: extraction.clarifyingQuestion.options } : null;
}
export function createInterpreter(generate: Generator = generateWithGemini) {
  return async (prompt: string, context: InterpretContext): Promise<InterpretResult> => {
    const request = InterpretRequestSchema.safeParse({ prompt, context });
    if (!request.success) return clarify();
    const ctx = request.data.context;
    // Do not send VIN, account data, history, location or provenance unless the user explicitly includes them in the dump.
    const relevantFields: Record<string, RegExp> = {
      annualMiles: /mile|commut|driv/i, commuteMilesOneWay: /commut/i, commuteDaysPerWeek: /commut/i,
      householdSize: /famil|household|child|pregnan|seat/i, children: /famil|child|pregnan/i,
      carSeats: /child|seat/i, cargoNeed: /cargo|pack|trunk|space/i,
      monthlyBudget: /budget|cost|payment|financ|switch|replac|compar/i,
      fuelPricePerGal: /fuel|gas|cost|spend/i, financeType: /financ|loan|lease|paid|payment|switch|replac|compar/i,
    };
    const profile = Object.fromEntries(Object.entries(relevantFields).filter(([, pattern]) => pattern.test(request.data.prompt))
      .map(([field]) => [field, ctx.profile[field as keyof typeof ctx.profile]]).filter(([, value]) => value !== undefined));
    const minimalContext = { vehicle: { model: ctx.vehicle.model, year: ctx.vehicle.year }, profile,
      existingEvents: ctx.existingEvents.slice(-50), todayISO: ctx.todayISO };
    const responseSchema = groundedResponseSchema(request.data.prompt);
    let validationFeedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      let text: string;
      try { text = await generate({ system: extractionInstructions, input: { prompt: request.data.prompt, context: minimalContext, retry: attempt === 1,
        ...(validationFeedback ? { validationFeedback } : {}) }, schema: responseSchema }); }
      catch { return { aiAvailable: false }; }
      try {
        const extraction = ExtractionSchema.parse(JSON.parse(text));
        const mapped = mapExtraction(extraction, ctx, request.data.prompt);
        if (!mapped.result.aiAvailable) return mapped.result;
        // Grounding/semantic failures also get one retry, never partially trusted changes.
        if (mapped.unresolved.some(item => item.certainty !== "vague")) {
          if (attempt === 0) {
            const invalidTimingFields = mapped.unresolved.filter(item => item.month && !item.quote.toLowerCase().includes(item.month.toLowerCase())).map(item => item.field);
            validationFeedback = "Some items failed quote, value or timing validation. Use only prompt evidence, include the full date in quote and month, use absolute children for ordinal counts, and never copy context into items."
              + (invalidTimingFields.length ? ` Invalid date in quote for: ${invalidTimingFields.join(", ")}. Each month must occur in that item's own quote. Omit month for undated clauses; never carry another event's date into annual mileage.` : "");
            continue;
          }
          return clarify();
        }
        delete mapped.result.question;
        if (extraction.unsupported) {
          mapped.result.unsupportedReason = "Fork cannot diagnose or predict component failures. You can explore ownership scenarios instead.";
          return mapped.result;
        }
        const question = gatedQuestion(extraction, ctx);
        if (question) mapped.result.question = question;
        return mapped.result;
      } catch { validationFeedback = "Return valid schema JSON only, with exact prompt quotes and raw date phrases. Do not add fields or calculate values."; }
    }
    return clarify();
  };
}
export const interpret = createInterpreter();
