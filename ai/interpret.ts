import "server-only";
import { z } from "zod";
import type { InterpretContext, InterpretResult, Question } from "../contracts";
import { InterpretContextSchema } from "../contracts/schemas";
import { applyDefaults } from "../data/defaults";
import { deriveAnnualDriving, dailyMileagePattern } from "../data/drivingRate";
import { gapCheck } from "../data/gapCheck";
import { ExtractionSchema, type Extraction, type ExtractionItem } from "./schema";
import { mapExtraction, pregnancyMention } from "./mapper";
import { generateWithGemini, type Generator } from "./gemini";
import { createGenerationBudget, INTERPRET_BUDGET_MS } from "./generationBudget";
import { type AIRequestOptions, unavailableInfo } from "./status";
import { hasTimingLanguage, splitClauses, resolveEventMonth } from "./dates";
import { interpretOffline } from "./offline";
import { extractionInstructions } from "./prompts/system";

const jsonSchema = z.toJSONSchema(ExtractionSchema) as Record<string, unknown>;
delete jsonSchema.$schema;
interface SchemaNode { properties?: Record<string, SchemaNode>; items?: SchemaNode; [key: string]: unknown }
function groundedResponseSchema(prompt: string): Record<string, unknown> {
  const quotes = [...new Set([prompt, ...splitClauses(prompt)])];
  const schema = structuredClone(jsonSchema) as SchemaNode;
  schema.properties!.items.items!.properties!.quote = { type: "string", enum: quotes };
  return schema;
}
export const InterpretRequestSchema = z.object({ prompt: z.string().trim().min(1).max(8000), context: InterpretContextSchema }).strict();
const clarify = (reason?: string): Extract<InterpretResult, { aiAvailable: true }> => ({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [], ...(reason ? { unsupportedReason: reason } : {}) });

function gatedQuestion(extraction: Extraction, context: InterpretContext): Question | null {
  const uncertain = extraction.items.filter(item => item.certainty === "vague").map(item => item.field);
  const candidate = gapCheck(applyDefaults(context.profile), {
    view: extraction.intent === "COMPARE_SCENARIOS" || extraction.intent === "RECOMMEND_ACTION" ? "compare" : "keep",
    vagueCommute: uncertain.includes("commuteMilesOneWay") || uncertain.includes("commuteDaysPerWeek"),
    budgetMentioned: extraction.items.some(item => item.field === "monthlyBudget"), uncertainFields: uncertain,
  }).question;
  // This UI's question answers edit today's profile. Future missing values must be restated into a draft.
  if (candidate && extraction.items.some(item => {
    const timing = resolveEventMonth(item.month, context.todayISO);
    return item.field === candidate.field && item.month && (!timing.resolved || timing.month > 0);
  })) return null;
  return extraction.clarifyingQuestion && candidate && candidate.field === extraction.clarifyingQuestion.field
    ? { ...candidate, kind: "chips", options: extraction.clarifyingQuestion.options } : null;
}
/** Prefer independent literal evidence to a model's daily-mileage calculation or overconfident birth count. */
function groundUnits(extraction: Extraction): Extraction {
  return { ...extraction, items: extraction.items.map(item => {
    if (item.field === "annualMiles") {
      const raw = item.quote.match(new RegExp(dailyMileagePattern, "i"))?.[0];
      if (raw && deriveAnnualDriving(raw, item.quote)) return { ...item, value: raw, certainty: "inferred" as const };
    }
    if (item.field === "childrenDelta" && item.value === 1 && pregnancyMention(item.quote)) return { ...item, certainty: "inferred" as const };
    return item;
  }) };
}
const overlap = (a: string, b: string) => a.includes(b) || b.includes(a);
function clarification(items: ExtractionItem[]): string {
  if (items.some(item => item.month)) return "Some changes need a clearer value or date. Confirm the proposed changes you want, and give a month and year for anything missing.";
  return "Some details need clarification. Include the mileage and its daily or yearly units, a child count, or the date of the change. Only the understood changes are proposed.";
}

export function createInterpreter(generate: Generator = generateWithGemini) {
  return async (prompt: string, context: InterpretContext, options?: AIRequestOptions): Promise<InterpretResult> => {
    const request = InterpretRequestSchema.safeParse({ prompt, context });
    if (!request.success) return clarify();
    const ctx = request.data.context;
    const relevantFields: Record<string, RegExp> = {
      annualMiles: /mile|commut|driv/i, commuteMilesOneWay: /commut/i, commuteDaysPerWeek: /commut/i,
      householdSize: /famil|household|child|pregnan|seat|baby|kid/i, children: /famil|child|pregnan|baby|kid/i,
      carSeats: /child|seat/i, cargoNeed: /cargo|pack|trunk|space/i,
      monthlyBudget: /budget|cost|payment|financ|switch|replac|compar/i,
      fuelPricePerGal: /fuel|gas|cost|spend/i, financeType: /financ|loan|lease|paid|payment|switch|replac|compar/i,
    };
    const profile = Object.fromEntries(Object.entries(relevantFields).filter(([, pattern]) => pattern.test(request.data.prompt))
      .map(([field]) => [field, ctx.profile[field as keyof typeof ctx.profile]]).filter(([, value]) => value !== undefined));
    // No VIN, account, history, location or provenance leaves the server unless supplied in the user's own text.
    const minimalContext = { vehicle: { model: ctx.vehicle.model, year: ctx.vehicle.year }, profile,
      existingEvents: ctx.existingEvents.slice(-50), todayISO: ctx.todayISO };
    const responseSchema = groundedResponseSchema(request.data.prompt);
    const reading = interpretOffline(request.data.prompt, ctx.todayISO);
    const covered = splitClauses(request.data.prompt).every(clause => reading.events.some(event => event.quote?.includes(clause)));
    const patchOnlyFacts = /\b(?:loan|lease|payment|paid[ _-]off|odometer|household|car seats?)\b/i.test(request.data.prompt);
    const missingInputNote = /\bretir(?:e|ing|ement)\b/i.test(request.data.prompt)
      ? "To model retirement, tell me how your annual driving, budget or cargo needs will change and when. I won't assume you stop driving."
      : /\b(?:driv\w*|commut\w*)\b.*\b(?:way more|way less|longer|shorter)\b/i.test(request.data.prompt)
        ? "Tell me the expected annual miles, or the one-way commute distance and driving days per week, plus when it starts." : undefined;
    const recover = (reason?: string): InterpretResult => (!patchOnlyFacts && covered && reading.events.length > 0)
      || !["CLARIFY", "CREATE_SCENARIO"].includes(reading.intent) ? { aiAvailable: false } : clarify(reason ?? missingInputNote);
    const budget = createGenerationBudget(generate, INTERPRET_BUDGET_MS, options?.signal);
    let validationFeedback: string | undefined;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        let text: string;
        try { text = await budget.run({ purpose: "interpret", system: extractionInstructions, input: {
          prompt: request.data.prompt, context: minimalContext, retry: attempt === 1,
          ...(validationFeedback ? { validationFeedback } : {}),
        }, schema: responseSchema }); }
        catch (error) { options?.onUnavailable?.(unavailableInfo(error)); return { aiAvailable: false }; }
        let extraction: Extraction;
        try {
          if (text.length > 64000) throw new Error("AI response too large");
          extraction = groundUnits(ExtractionSchema.parse(JSON.parse(text)));
        } catch {
          validationFeedback = "Return valid schema JSON only. Copy exact prompt quotes including their dates; never calculate values.";
          continue;
        }
        const mapped = mapExtraction(extraction, ctx, request.data.prompt);
        if (!mapped.result.aiAvailable) return mapped.result;
        if (extraction.unsupported) {
          mapped.result.unsupportedReason = "Fork cannot diagnose or predict component failures. You can explore ownership scenarios instead.";
          return mapped.result;
        }
        const quoteFailure = mapped.unresolved.some(item => !request.data.prompt.includes(item.quote)
          || (item.month && !item.quote.toLowerCase().includes(item.month.toLowerCase()))
          || (!item.month && splitClauses(request.data.prompt).some(clause => clause.includes(item.quote) && hasTimingLanguage(clause))));
        if (quoteFailure && attempt === 0) {
          validationFeedback = "Some items failed timing/quote grounding. Quote each whole change INCLUDING its own date. Never carry another clause's date into annualMiles. For daily mileage copy the exact raw STRING; code converts it.";
          continue;
        }
        const question = gatedQuestion(extraction, ctx);
        if (mapped.unresolved.length) {
          // Do not apply half of one linked fact (e.g. the distance without its future start date).
          const safe = (quote?: string) => quote && !mapped.unresolved.some(item => overlap(quote, item.quote));
          mapped.result.proposals = mapped.result.proposals.filter(event => safe(event.quote));
          mapped.result.profilePatches = mapped.result.profilePatches.filter(patch => safe(patch.quote));
          const reason = clarification(mapped.unresolved);
          if (!mapped.result.proposals.length && !mapped.result.profilePatches.length) {
            if (question) return { ...clarify(reason), question };
            return recover(reason);
          }
          mapped.result.unsupportedReason = reason;
        }
        delete mapped.result.question;
        if (question) mapped.result.question = question;
        if (!extraction.items.length && !extraction.clarifyingQuestion
          && ["CLARIFY", "CREATE_SCENARIO"].includes(mapped.result.intent)) return recover();
        return mapped.result;
      }
      return recover();
    } finally { budget.dispose(); }
  };
}
export const interpret = createInterpreter();
