import { z } from "zod";
export type { ConnectionProvider } from "../../contracts";
export const ProviderConfigSchema = z.object({
  id: z.enum(["synthetic", "smartcar-simulated", "tfs"]).default("synthetic"),
  vehicleId: z.enum(["camry-2022-se", "rav4-2024-hybrid-xle"]).default("camry-2022-se"),
}).strict();
export type ProviderConfig = z.input<typeof ProviderConfigSchema>;
export type ProviderId = z.output<typeof ProviderConfigSchema>["id"];
export type DemoVehicleId = z.output<typeof ProviderConfigSchema>["vehicleId"];
export interface ProviderDescriptor {
  id: ProviderId; label: string; mode: "synthetic" | "local-simulation" | "unconfigured";
  disclosure: string; configured: boolean;
}
export class ProviderNotConfiguredError extends Error {
  readonly code = "TFS_NOT_CONFIGURED";
  constructor() {
    super("Toyota Financial Services is not configured. Approved sandbox access and OAuth2 integration are required; this demo has no TFS connection.");
    this.name = "ProviderNotConfiguredError";
  }
}
