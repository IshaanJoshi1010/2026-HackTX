"use client";

import { selectActiveVehicle } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";

const MATCH_LABEL = {
  exact: "Exact 3D model",
  representative: "Representative 3D model",
  unsupported: "No 3D model",
} as const;

/** The car's name, set large at the top like a product page. No numbers, so no badge needed. */
export function Identity() {
  const vehicle = useForkStore(selectActiveVehicle);
  if (!vehicle) return null;
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
      </p>
    </div>
  );
}
