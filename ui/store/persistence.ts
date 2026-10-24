/**
 * Browser-only persistence for the Fork store. One key, versioned, safe to clear.
 *
 * - Saved: preferences (panels, low performance) and the session inputs (twin,
 *   scenarios, confirmed profile, drafts, active ids).
 * - Not saved: results, evaluation, break-even. They are derived, so they are
 *   recomputed on load. That keeps saved data valid across mock to real swaps.
 * - Anything that fails validation is dropped, never partially trusted.
 */
import { z } from "zod";
import {
  ExploreStateSchema,
  FieldKeySchema,
  ProfilePatchSchema,
  TradeoffPickSchema,
  VehicleConfigSchema,
  VehicleTwinSchema,
} from "@/contracts/schemas";
import { mockFingerprint } from "@/ui/mocks";

export const STORAGE_KEY = "fork:v1";
export const STORAGE_VERSION = 1;

const PrefsSchema = z.object({
  leftOpen: z.boolean(),
  rightOpen: z.boolean(),
  lowPerformance: z.boolean(),
});

const SessionSchema = z.object({
  phase: z.enum(["landing", "workspace"]),
  twin: VehicleTwinSchema,
  replacementVehicle: VehicleConfigSchema.nullable(),
  explore: ExploreStateSchema,
  comparison: z.object({ keepId: z.string(), replaceId: z.string() }).nullable(),
  activeScenarioId: z.string().min(1),
  activeMonth: z.number().int().min(0).max(60),
  activeVehicleId: z.string().min(1),
  draftPatches: z.array(ProfilePatchSchema),
  tradeoffPicks: z.array(TradeoffPickSchema),
  answeredFields: z.array(FieldKeySchema),
});

export type Prefs = z.infer<typeof PrefsSchema>;
export type Session = z.infer<typeof SessionSchema>;

export interface Persisted {
  prefs: Prefs;
  session: Session | null;
}

// Panels start closed: the car comes first and detail is opened on demand.
export const DEFAULT_PREFS: Prefs = { leftOpen: false, rightOpen: false, lowPerformance: false };

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // private mode or blocked storage
  }
}

/** Returns null when nothing is saved, the version is wrong, or the blob is unreadable. */
export function loadPersisted(storage: Storage | null = getStorage()): Persisted | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const blob: unknown = JSON.parse(raw);
    if (typeof blob !== "object" || blob === null) return null;
    const b = blob as Record<string, unknown>;
    if (b.version !== STORAGE_VERSION) return null;

    const prefs = PrefsSchema.safeParse(b.prefs);
    // A session saved under a different mock mix is stale by definition.
    const session =
      b.mocks === mockFingerprint() ? SessionSchema.safeParse(b.session) : null;

    return {
      prefs: prefs.success ? prefs.data : DEFAULT_PREFS,
      session: session?.success ? session.data : null,
    };
  } catch {
    return null;
  }
}

export function savePersisted(p: Persisted, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, mocks: mockFingerprint(), prefs: p.prefs, session: p.session }),
    );
  } catch {
    // Quota or blocked storage. The app works without persistence.
  }
}

export function clearPersisted(storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
