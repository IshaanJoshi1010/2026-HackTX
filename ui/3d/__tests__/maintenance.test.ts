import { expect, it } from "vitest";
import { findingsForVehicle, type MaintenanceFinding } from "../maintenance";

it("never assigns another vehicle's service warning or invents a fault", () => {
  const findings: MaintenanceFinding[] = [{ vehicleId: "rav4", component: "brakes", severity: "warning", label: "Inspection requested", source: "demo" }];
  expect(findingsForVehicle(findings, "camry")).toEqual([]);
  expect(findingsForVehicle(findings, "rav4")).toEqual(findings);
  expect(findingsForVehicle([], "rav4")).toEqual([]);
});
