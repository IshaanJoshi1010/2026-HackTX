import type { Source } from "@/contracts";

/**
 * Visible labels for the six contract `Source` values.
 * illustrative and synthetic both read "demo data"; the tooltip tells them apart.
 * sourced (EPA, NHTSA) stays separate from listing (a dealer listing snapshot).
 */
export type SourceVariant = "user" | "estimated" | "demo" | "listing" | "sourced";

export const VARIANT_LABEL: Record<SourceVariant, string> = {
  user: "your input",
  estimated: "estimated",
  demo: "demo data",
  listing: "listing",
  sourced: "sourced",
};

const VARIANT_OF: Record<Source, SourceVariant> = {
  user: "user",
  estimated: "estimated",
  illustrative: "demo",
  synthetic: "demo",
  listing: "listing",
  sourced: "sourced",
};

export const SOURCE_DETAIL: Record<Source, string> = {
  user: "You told us this.",
  estimated: "A labeled default. Tap to replace it with your number.",
  illustrative: "Placeholder value for the demo. Not a verified figure.",
  synthetic: "Made-up demo persona data. Not a real account.",
  listing: "From a public listing snapshot.",
  sourced: "From a public dataset such as EPA fuel economy.",
};

export function variantOf(source: Source): SourceVariant {
  return VARIANT_OF[source];
}

/**
 * Weakest first-to-last ranking: a derived number is only as real as its
 * least real input. Used for projections that mix several inputs.
 */
const REALNESS: Source[] = ["user", "listing", "sourced", "estimated", "illustrative", "synthetic"];

/**
 * Label for a number derived from several inputs.
 * Returns undefined when the list is empty or any input has no source, so a
 * missing provenance shows up as a visible gap instead of a guessed label.
 */
export function weakestSource(sources: ReadonlyArray<Source | undefined>): Source | undefined {
  if (sources.length === 0 || sources.some((s) => s === undefined)) return undefined;
  return (sources as Source[]).reduce((weakest, s) =>
    REALNESS.indexOf(s) > REALNESS.indexOf(weakest) ? s : weakest,
  );
}
