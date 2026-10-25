import type { Source, VehicleTwin } from "../contracts";
import type { TwinMetadata } from "./twin";
import { getRegistryEntry } from "./registry";
import { SourceSchema } from "../contracts/schemas";

export interface SourceAudit { labeled: number; missing: string[]; fields: Record<string, Source> }
function leaves(value: unknown, prefix: string): string[] {
  if (value !== null && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => leaves(child, `${prefix}.${key}`));
  return value === undefined ? [] : [prefix];
}
/** Audits semantic values. Citation/provenance/source-label containers are metadata, not data requiring recursive labels. */
export function auditTwinSources(twin: VehicleTwin, metadata: Pick<TwinMetadata, "mileage">): SourceAudit {
  const fields: Record<string, Source> = {}, missing: string[] = [];
  const label = (paths: string[], source: unknown) => {
    const parsed = SourceSchema.safeParse(source);
    for (const path of paths) if (parsed.success) fields[path] = parsed.data; else missing.push(path);
  };
  const saved = twin.vehicle.vin ? getRegistryEntry(twin.vehicle.vin) : undefined;
  for (const [key, value] of Object.entries(twin.vehicle)) {
    if (key === "specSources") continue;
    // Saved per-field labels apply only when the audited value still matches that saved field.
    const source = saved && saved[key as keyof typeof saved] === value ? saved.fieldSources[key] : undefined;
    label(leaves(value, `vehicle.${key}`), source);
  }
  const mileageSource = twin.driver.provenance.mileage;
  label(["mileage"], mileageSource === metadata.mileage.source ? mileageSource : undefined);
  for (const [key, value] of Object.entries(twin.driver)) {
    if (key !== "provenance") label(leaves(value, `driver.${key}`), twin.driver.provenance[key]);
  }
  for (const [key, value] of Object.entries(twin.finance)) {
    if (key !== "provenance") label(leaves(value, `finance.${key}`), twin.finance.provenance[key]);
  }
  twin.history.forEach((record, index) => {
    for (const [key, value] of Object.entries(record)) {
      if (key !== "source" && key !== "provenance") label(leaves(value, `history.${index}.${key}`), record.source);
    }
  });
  return { labeled: Object.keys(fields).length, missing, fields };
}
