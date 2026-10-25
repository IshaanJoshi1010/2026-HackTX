import { z } from "zod";
import { IntentSchema } from "../contracts/schemas";

export const ExtractionFieldSchema = z.enum(["location", "annualMiles", "commuteMilesOneWay", "commuteDaysPerWeek",
  "householdSize", "children", "childrenDelta", "carSeats", "cargoNeed", "monthlyBudget", "fuelPricePerGal",
  "financeType", "financePayment", "financeEndMonth", "mileage", "vehicleId"]);
export const ExtractionItemSchema = z.object({
  field: ExtractionFieldSchema, value: z.union([z.string().min(1), z.number().finite(), z.null()]),
  certainty: z.enum(["clear", "inferred", "vague"]), quote: z.string().min(1),
  // Keep the quoted date phrase raw: code, not the model, computes month offsets.
  month: z.string().min(1).optional(), assumptions: z.array(z.string()),
}).strict().superRefine((item, ctx) => {
  if ((item.certainty === "vague") !== (item.value === null)) ctx.addIssue({ code: "custom", message: "Vague items require null; non-vague items require a stated or explicit inferred value" });
  if (typeof item.value === "number" && item.value < 0) ctx.addIssue({ code: "custom", message: "Numeric values must be nonnegative" });
});
export const ExtractionQuestionSchema = z.object({
  field: z.union([ExtractionFieldSchema, z.literal("timing")]), question: z.string().min(1),
  options: z.array(z.string().min(1)).min(1).refine(options => options.includes("I'm not sure"), "Include I'm not sure"),
}).strict();
export const ExtractionSchema = z.object({
  intent: IntentSchema, items: z.array(ExtractionItemSchema),
  clarifyingQuestion: ExtractionQuestionSchema.optional(), unsupported: z.string().min(1).optional(),
}).strict().refine(output => !output.unsupported || output.items.length === 0, "Unsupported requests must not create items");
export type Extraction = z.infer<typeof ExtractionSchema>;
export type ExtractionItem = z.infer<typeof ExtractionItemSchema>;
export type ExtractionField = z.infer<typeof ExtractionFieldSchema>;
