// What a person reads when a VIN does not open a car. The data layer's reasons are for logs ("Decode unavailable:
// NHTSA HTTP 500"), so none of them reach the screen. These never claim a match of any kind: a VIN that fails opens nothing.

export const SUPPORTED_CARS = "a 2022 Toyota Camry SE and a 2024 Toyota RAV4 Hybrid XLE";

const VIN_FORMAT_MESSAGE: Record<string, string> = {
  length: "A VIN has 17 characters.",
  chars: "VINs only use letters and numbers.",
  forbidden_letter: "VINs never use the letters I, O, or Q.",
  check_digit: "That VIN's check digit does not add up.",
};

/** A VIN that is not shaped like a VIN. */
export function vinReason(reason: string): string {
  return VIN_FORMAT_MESSAGE[reason] ?? "That doesn't look like a valid VIN.";
}

/** The result of looking a well-formed VIN up, when it did not give a car Fork can open. */
export function vinFailureMessage(id: { status: string; reason: string }): string {
  if (id.status === "invalid") return vinReason(id.reason);
  const knows = `Fork knows two cars: ${SUPPORTED_CARS}.`;
  const r = id.reason.toLowerCase();
  // The lookup itself failed: offline, timed out, or the decoder had a problem.
  if (r.startsWith("decode unavailable")) {
    return `Fork couldn't look that VIN up right now. ${knows} Pick one under Sample cars or Select model, or try the VIN again later.`;
  }
  // The VIN decoded, to a car Fork does not model.
  if (r.includes("outside fork's supported models")) {
    return `That VIN is for a car Fork doesn't model yet. ${knows}`;
  }
  // A supported model whose lookup came back without enough to build it.
  if (r.includes("details incomplete")) {
    return `That VIN looks like a car Fork knows, but the lookup didn't return enough to open it. Try the sample car for that model instead. ${knows}`;
  }
  return `Fork couldn't open that VIN. ${knows}`;
}
