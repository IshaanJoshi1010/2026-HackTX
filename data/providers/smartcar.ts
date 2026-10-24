import type { AccountData, ConnectionProvider, VehicleSignals } from "../../contracts";
import { AccountDataSchema, VehicleSignalsSchema } from "../../contracts/schemas";
import type { DemoVehicleId } from "./types";

/** Local deterministic simulation only. No Smartcar SDK, network, OAuth or Toyota compatibility claim. */
export class SimulatedSmartcarProvider implements ConnectionProvider {
  private readonly account: AccountData;
  private readonly signals: VehicleSignals;
  constructor(vehicleId: DemoVehicleId = "camry-2022-se") {
    if (!["camry-2022-se", "rav4-2024-hybrid-xle"].includes(vehicleId)) throw new Error("Unsupported simulated vehicle");
    this.account = AccountDataSchema.parse({ source: "synthetic", finance: {
      financeType: "loan", balance: 12500, monthlyPayment: 410, remainingTermMonths: 34,
      provenance: { financeType: "synthetic", balance: "synthetic", monthlyPayment: "synthetic", remainingTermMonths: "synthetic" },
    } });
    this.signals = VehicleSignalsSchema.parse({ mileage: vehicleId === "camry-2022-se" ? 49000 : 25000, source: "synthetic" });
  }
  async getAccount(): Promise<AccountData> { return structuredClone(this.account); }
  async getVehicleSignals(): Promise<VehicleSignals> { return structuredClone(this.signals); }
}
