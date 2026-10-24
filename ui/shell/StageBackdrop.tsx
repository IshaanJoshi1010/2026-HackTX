import { cn } from "@/lib/utils";

/**
 * A soft pool of light on the floor under the car, like a studio shot. Nothing else.
 * (The 3D canvas should be transparent so this shows behind it.)
 */
export function StageBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="fork-floor fork-fade" />
    </div>
  );
}
