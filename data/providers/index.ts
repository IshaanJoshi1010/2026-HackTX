import type { ConnectionProvider } from "../../contracts";
import { ProviderConfigSchema, type ProviderConfig, type ProviderDescriptor, type ProviderId } from "./types";
import { SyntheticProvider } from "./synthetic";
import { SimulatedSmartcarProvider } from "./smartcar";
import { TFSProvider } from "./tfs";
export { SyntheticProvider } from "./synthetic";
export { SimulatedSmartcarProvider } from "./smartcar";
export { TFSProvider } from "./tfs";
export { ProviderNotConfiguredError } from "./types";
export type { ProviderConfig, ProviderId, ProviderDescriptor, DemoVehicleId } from "./types";
export { mapProviderData, loadProviderData } from "./mapping";
export type { ProviderMappingResult } from "./mapping";

export const providerRegistry: readonly Readonly<ProviderDescriptor>[] = Object.freeze([
  Object.freeze({ id: "synthetic", label: "Synthetic demo account", mode: "synthetic", configured: true,
    disclosure: "Fictional Alex account and odometer; no real financial account or connected vehicle." } as const),
  Object.freeze({ id: "smartcar-simulated", label: "Smartcar-style local simulation", mode: "local-simulation", configured: true,
    disclosure: "Local synthetic data only. Not connected to Smartcar or Toyota; account/finance fields are fictional and not Smartcar financial data." } as const),
  Object.freeze({ id: "tfs", label: "Toyota Financial Services — not configured", mode: "unconfigured", configured: false,
    disclosure: "No TFS credentials or sandbox access. Both methods fail clearly until an approved integration is implemented." } as const),
]);
export function getProviderDescriptor(id: ProviderId): ProviderDescriptor {
  const found = providerRegistry.find(provider => provider.id === id);
  if (!found) throw new Error("Unknown connection provider");
  return { ...found };
}
export function createProvider(config: ProviderConfig = {}): ConnectionProvider {
  const parsed = ProviderConfigSchema.safeParse(config);
  if (!parsed.success) throw new Error("Invalid connection provider configuration");
  switch (parsed.data.id) {
    case "synthetic": return new SyntheticProvider(parsed.data.vehicleId);
    case "smartcar-simulated": return new SimulatedSmartcarProvider(parsed.data.vehicleId);
    case "tfs": return new TFSProvider();
  }
}
