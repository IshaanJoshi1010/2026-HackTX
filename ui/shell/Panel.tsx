import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./IconButton";

/** Shared so the HUD can keep clear of an open panel. */
export const PANEL_WIDTH = "min(360px, 30vw)";
/** Edge button plus a gap: how far a panel's outer edge sits from the screen edge. */
export const PANEL_INSET = `calc(4.5rem + ${PANEL_WIDTH} + 1rem)`;

export interface PanelProps {
  side: "left" | "right";
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle(): void;
  children: ReactNode;
}

/**
 * A frosted panel opened from a round button on the screen edge. It sits on top
 * of the stage instead of pushing it, so the 3D scene never gets squeezed. The
 * edge button fades in after the timeline, so the first view is just the car.
 */
export function Panel({ side, title, icon: Icon, open, onToggle, children }: PanelProps) {
  const left = side === "left";
  return (
    <>
      <IconButton
        label={`${open ? "Close" : "Open"} ${title}`}
        aria-expanded={open}
        active={open}
        onClick={onToggle}
        style={{ "--d": "1900ms" } as React.CSSProperties}
        className={cn("fork-fade absolute top-1/2 z-20 -translate-y-1/2", left ? "left-6" : "right-6")}
      >
        <Icon />
      </IconButton>

      <aside
        aria-label={title}
        data-side={side}
        data-open={open}
        inert={!open}
        style={{ width: PANEL_WIDTH, bottom: "calc(var(--dock-h, 8rem) + 1.5rem)" }}
        className={cn(
          "fork-glass absolute top-36 z-10 overflow-y-auto rounded-xl p-6",
          "transition-[opacity,transform] duration-500 ease-out",
          left ? "left-[4.5rem]" : "right-[4.5rem]",
          open ? "translate-x-0 opacity-100" : cn("pointer-events-none opacity-0", left ? "-translate-x-4" : "translate-x-4"),
        )}
      >
        <h2 className="mb-5 text-lg font-medium text-ink">{title}</h2>
        {children}
      </aside>
    </>
  );
}

/** Small labeled block inside a panel. */
export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7 last:mb-0">
      <h3 className="mb-1 text-sm text-ink/50">{title}</h3>
      {children}
    </section>
  );
}
