import { z } from "zod";
import { camryVehicle, rav4Vehicle } from "../fixtures/vehicles";
import { getSpecDetails } from "../specs";

export const vehicleKnowledgeIds = ["camry-2022-se", "rav4-2024-hybrid-xle"] as const;
const source = z.enum(["sourced", "listing", "user", "estimated", "illustrative", "synthetic"]);
const fact = z.object({ value: z.number().finite().nonnegative().max(1_000_000), source, reference: z.string().min(1).max(1000) }).strict();
export const VehicleKnowledgeSchema = z.object({
  vehicleId: z.enum(vehicleKnowledgeIds), make: z.literal("Toyota"), model: z.enum(["Camry", "RAV4"]),
  year: z.number().int(), trim: z.string().max(60), powertrain: z.enum(["gas", "hybrid"]),
  matchStatus: z.literal("representative"), identitySource: z.literal("synthetic"),
  specs: z.object({ seats: fact, cargoCuFt: fact, mpgCombined: fact, msrp: fact }).strict(),
  fitStatus: z.literal("Physical car-seat and packing fit need verification"),
}).strict().superRefine((doc, ctx) => {
  const identity = [camryVehicle, rav4Vehicle].find(v => v.id === doc.vehicleId)!;
  if (doc.model !== identity.model || doc.year !== identity.year || doc.trim !== identity.trim || doc.powertrain !== identity.powertrain)
    ctx.addIssue({ code: "custom", message: "Vehicle identity mismatch" });
  if (!Number.isInteger(doc.specs.seats.value) || doc.specs.seats.value < 1 || doc.specs.seats.value > 12
    || doc.specs.mpgCombined.value <= 0 || doc.specs.mpgCombined.value > 200)
    ctx.addIssue({ code: "custom", message: "Invalid vehicle specifications" });
});
export type VehicleKnowledge = z.infer<typeof VehicleKnowledgeSchema>;

/** Public demo facts only. Never persist a driver's VIN, account, finance or profile here. */
export function getLocalVehicleKnowledge(): VehicleKnowledge[] {
  return [camryVehicle, rav4Vehicle].map(vehicle => {
    const details = getSpecDetails(vehicle.id);
    const facts = Object.fromEntries((["seats", "cargoCuFt", "mpgCombined", "msrp"] as const).map(key => [key, {
      value: details.sheet[key], source: details.numericSources[key].label, reference: details.numericSources[key].source,
    }]));
    return VehicleKnowledgeSchema.parse({ vehicleId: vehicle.id, make: vehicle.make, model: vehicle.model,
      year: vehicle.year, trim: vehicle.trim, powertrain: vehicle.powertrain, matchStatus: "representative",
      identitySource: "synthetic", specs: facts, fitStatus: "Physical car-seat and packing fit need verification" });
  });
}
