import manifest from "@/public/models/manifest.json";

// The two car models are CC BY 4.0, so the app has to name them. The words come from public/models/manifest.json
// (the same file the 3D stage reads), not from a copy typed here, so the credit cannot drift from the files.

export interface Credit {
  vehicleId: string;
  /** "toyota camry v80" */
  title: string;
  author: string;
  authorUrl?: string;
  sourceUrl?: string;
  license: { label: string; url: string };
  /** What was changed, as the manifest says it, or null when it does not say. */
  modified: string | null;
  /** The attribution as written in the manifest, shown whole when it does not split into the parts above. */
  raw: string;
}

interface ManifestEntry {
  vehicleId: string;
  credit: string;
  license: string;
}

// 1 title, 2 author, 3 author link (optional), 4 source link
const ATTRIBUTION = /^(.+?) by ([^\s,(]+)(?: \((https?:\/\/[^)\s]+)\))?, (https?:\/\/\S+?)\. /;
const MODIFIED = /Modified for Fork: (.+?)\. /;

/** "CC BY 4.0 https://creativecommons.org/licenses/by/4.0/" into a label and a link. */
function parseLicense(text: string): Credit["license"] {
  const url = /https?:\/\/\S+/.exec(text)?.[0] ?? "";
  return { label: text.replace(url, "").trim() || "License", url };
}

export function parseCredit(entry: ManifestEntry): Credit {
  const text = `${entry.credit} `;
  const a = ATTRIBUTION.exec(text);
  const m = MODIFIED.exec(text);
  return {
    vehicleId: entry.vehicleId,
    title: (a?.[1] ?? entry.credit.split(". ")[0]).replace(/\+/g, " "),
    author: a?.[2] ?? "",
    ...(a?.[3] ? { authorUrl: a[3] } : {}),
    ...(a?.[4] ? { sourceUrl: a[4] } : {}),
    license: parseLicense(entry.license),
    modified: m?.[1] ?? null,
    raw: entry.credit.split(". ")[0],
  };
}

export const MODEL_CREDITS: Credit[] = (manifest as ManifestEntry[]).map(parseCredit);

/** What every page says about the data. "Representative" only while every model in the manifest is. */
export function honestyLine(entries: Array<{ matchStatus: string }> = manifest): string {
  const models = entries.every((e) => e.matchStatus === "representative") ? "Representative 3D models." : "Some 3D models are representative stand-ins.";
  return `${models} Driver, finance and listing data are synthetic. Dollar figures are illustrative.`;
}
