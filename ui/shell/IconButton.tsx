import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends Omit<ComponentProps<"button">, "title" | "aria-label"> {
  /** Icon-only, so the label is required. It is also the hover tooltip. */
  label: string;
  /** On state, for toggles and the current choice. Shown as a solid white button. */
  active?: boolean;
}

/** Round translucent button with just an icon. */
export function IconButton({ label, active = false, className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&_svg]:size-[18px]",
        active ? "bg-ink text-canvas" : "bg-ink/10 text-ink hover:bg-ink/20",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
