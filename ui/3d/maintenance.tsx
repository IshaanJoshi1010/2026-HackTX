"use client";

import { createContext, useContext, type ReactNode } from "react";

export type CarComponent = "engine" | "battery" | "brakes" | "tires";
export type MaintenanceFinding = {
  vehicleId: string;
  component: CarComponent;
  label: string;
  severity: "notice" | "warning";
  source: string;
};
const MaintenanceContext = createContext<readonly MaintenanceFinding[]>([]);

/** Findings must come from the host's service data, never inferred from geometry. */
export function MaintenanceProvider({ findings, children }: { findings: readonly MaintenanceFinding[]; children: ReactNode }) {
  return <MaintenanceContext.Provider value={findings}>{children}</MaintenanceContext.Provider>;
}
export function findingsForVehicle(findings: readonly MaintenanceFinding[], vehicleId: string) {
  return findings.filter(finding => finding.vehicleId === vehicleId);
}
export function useMaintenanceFindings(vehicleId: string) {
  return findingsForVehicle(useContext(MaintenanceContext), vehicleId);
}
