import type { AccountData, ConnectionProvider, VehicleSignals } from "../../contracts";
import { AccountDataSchema, VehicleSignalsSchema } from "../../contracts/schemas";
import { syntheticFinance } from "../fixtures/finance";
import camry from "../listings/camry-primary.json";
import rav4 from "../listings/rav4-primary.json";
import type { DemoVehicleId } from "./types";

export class SyntheticProvider implements ConnectionProvider {
  private readonly account: AccountData;
  private readonly signals: VehicleSignals;
  constructor(vehicleId: DemoVehicleId = "camry-2022-se") {
    if (!["camry-2022-se", "rav4-2024-hybrid-xle"].includes(vehicleId)) throw new Error("Unsupported synthetic vehicle");
    this.account = AccountDataSchema.parse({ finance: structuredClone(syntheticFinance), source: "synthetic" });
    this.signals = VehicleSignalsSchema.parse({ mileage: vehicleId === "camry-2022-se" ? camry.fields.mileage : rav4.fields.mileage, source: "synthetic" });
  }
  async getAccount(): Promise<AccountData> { return structuredClone(this.account); }
  async getVehicleSignals(): Promise<VehicleSignals> { return structuredClone(this.signals); }
}
