import type { AccountData, ConnectionProvider, VehicleSignals } from "../../contracts";
import { ProviderNotConfiguredError } from "./types";

/** Unimplemented. Project handoff: request sandbox approval via api_services@toyota.com; OAuth2 required. */
export class TFSProvider implements ConnectionProvider {
  async getAccount(): Promise<AccountData> { throw new ProviderNotConfiguredError(); }
  async getVehicleSignals(): Promise<VehicleSignals> { throw new ProviderNotConfiguredError(); }
}
