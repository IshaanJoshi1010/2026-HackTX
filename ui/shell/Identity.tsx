"use client";

import { selectActiveScenario, selectActiveVehicle } from "@/ui/store/selectors";
import { BASE_ID, useForkStore } from "@/ui/store/useForkStore";

const MATCH_LABEL = {
  exact: "Exact 3D model",
  representative: "Representative 3D model",
  unsupported: "No 3D model",
} as const;

/**
 * The car's name, set large at the top like a product page. When you are looking
 * at a branch rather than the baseline, its name is the last thing on the line.
 * No numbers here, so no source badge is needed.
 */
export function Identity() {
  const vehicle = useForkStore(selectActiveVehicle);
  const scenario = useForkStore(selectActiveScenario);
  if (!vehicle) return null;
  const future = scenario && scenario.id !== BASE_ID ? scenario.name : null;
  return (
    <div
      style={{ "--d": "250ms" } as React.CSSProperties}
      className="fork-fade pointer-events-none absolute inset-x-0 top-16 z-10 text-center"
    >
      <h1 className="text-[40px] leading-tight font-medium tracking-tight text-ink">
        {vehicle.year} {vehicle.make} {vehicle.model}
      </h1>
      <p className="mt-1 text-sm text-ink/60">
        {vehicle.trim} &middot; {MATCH_LABEL[vehicle.matchStatus]}
        {future && <> &middot; {future}</>}
      </p>
    </div>
  );
}
