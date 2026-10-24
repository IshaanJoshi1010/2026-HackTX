import type { DriverProfile, RawProfileInput } from "../contracts";
import { normalizeProfile } from "./normalize";
import { applyDefaults } from "./defaults";
/** Compatibility adapter retained for C7 callers; now delegates to the C5 pipeline. */
export function prepareTwinProfile(raw: RawProfileInput = {}): { ok: true; profile: DriverProfile } | { ok: false; error: string } {
  const normalized = normalizeProfile(raw);
  if (!normalized.ok) return normalized;
  try { return { ok: true, profile: applyDefaults(normalized.profile) }; }
  catch { return { ok: false, error: "Profile defaults could not be validated" }; }
}
