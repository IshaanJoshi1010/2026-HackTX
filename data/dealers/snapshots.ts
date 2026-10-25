import { type DealerSnapshot, parseSnapshot } from "./lookup";

/**
 * Loads data/fixtures/dealers-<slug>.json. Adding a city is adding that one file (see capture.ts); the bundler
 * picks up every dealers-*.json, so no code changes. Unknown or invalid snapshots return null.
 */
export async function loadSnapshot(slug: string): Promise<DealerSnapshot | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const mod: { default?: unknown } = await import(`../fixtures/dealers-${slug}.json`);
    return parseSnapshot(mod.default ?? mod);
  } catch {
    return null;
  }
}
