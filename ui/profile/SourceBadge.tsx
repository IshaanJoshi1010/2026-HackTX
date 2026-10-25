import type { Source } from "@/contracts";
import { cn } from "@/lib/utils";
import { customerText } from "./customerText";
import { SOURCE_DETAIL, VARIANT_LABEL, variantOf, type SourceVariant } from "./sources";

/**
 * Black and white only, so each source gets its own shape instead of a color:
 * filled dot = your input, filled square = sourced, diamond = listing,
 * hollow dot = estimated, dotted dot = illustrative. A missing source is an
 * inverted chip (white on black becomes black on white) so it cannot be missed.
 */
const GLYPH: Record<SourceVariant, string> = {
  user: "size-1.5 rounded-full bg-current",
  sourced: "size-1.5 rounded-[1px] bg-current",
  listing: "size-1.5 rotate-45 bg-current",
  estimated: "size-2 rounded-full border border-current",
  illustrative: "size-2 rounded-full border border-dotted border-current",
};

const PILL_BORDER: Record<SourceVariant, string> = {
  user: "border-ink/70",
  sourced: "border-ink/35",
  listing: "border-ink/35",
  estimated: "border-dashed border-ink/50",
  illustrative: "border-dotted border-ink/40",
};

export interface SourceBadgeProps {
  /** Comes from the data. Undefined renders a visible "no source" gap. */
  source: Source | undefined;
  /** Extra tooltip text, for example the dataset name. */
  detail?: string;
  /** Quiet inline label for dense layouts. Still always shown. */
  compact?: boolean;
  className?: string;
}

/** Every displayed number sits next to one of these. */
export function SourceBadge({ source, detail, compact = false, className }: SourceBadgeProps) {
  if (source === undefined) {
    return (
      <span
        data-source="none"
        title="This number has no source label yet."
        className={cn(
          "inline-flex items-center rounded-sm bg-ink px-1.5 text-xs font-medium leading-4 whitespace-nowrap text-canvas",
          className,
        )}
      >
        no source
      </span>
    );
  }

  const variant = variantOf(source);
  const tip = customerText(detail ? `${SOURCE_DETAIL[source]} ${detail}` : SOURCE_DETAIL[source]);
  return (
    <span
      data-source={source}
      title={tip}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs leading-4 whitespace-nowrap text-ink/55",
        !compact && cn("rounded-full border px-2 py-px", PILL_BORDER[variant]),
        className,
      )}
    >
      <span aria-hidden="true" className={cn("shrink-0", GLYPH[variant])} />
      {VARIANT_LABEL[variant]}
    </span>
  );
}
