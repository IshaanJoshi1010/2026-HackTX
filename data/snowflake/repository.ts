import "server-only";
import { z } from "zod";
import { getLocalVehicleKnowledge, VehicleKnowledgeSchema, vehicleKnowledgeIds, type VehicleKnowledge } from "./documents";

export interface VehicleKnowledgeResult {
  source: "snowflake" | "local-fixture";
  status: "ready" | "unconfigured" | "unavailable";
  vehicles: VehicleKnowledge[];
}
export interface SnowflakeConfig {
  account: string; token: string; database: string; schema: string; warehouse: string; role: string;
  table: string; tokenType: "PROGRAMMATIC_ACCESS_TOKEN" | "OAUTH";
}
export function readSnowflakeConfig(env: Record<string, string | undefined> = process.env): SnowflakeConfig | undefined {
  const config = { account: env.SNOWFLAKE_ACCOUNT ?? "", token: env.SNOWFLAKE_TOKEN ?? "",
    database: env.SNOWFLAKE_DATABASE ?? "", schema: env.SNOWFLAKE_SCHEMA ?? "",
    warehouse: env.SNOWFLAKE_WAREHOUSE ?? "", role: env.SNOWFLAKE_ROLE ?? "",
    table: env.SNOWFLAKE_TABLE || "VEHICLE_KNOWLEDGE", tokenType: env.SNOWFLAKE_TOKEN_TYPE || "PROGRAMMATIC_ACCESS_TOKEN" };
  if (!Object.values(config).every(Boolean)) return undefined;
  if (!/^[a-z0-9][a-z0-9-]{2,150}$/i.test(config.account)
    || ![config.database, config.schema, config.warehouse, config.role, config.table].every(v => /^[A-Z_][A-Z0-9_]{0,254}$/i.test(v))
    || !["PROGRAMMATIC_ACCESS_TOKEN", "OAUTH"].includes(config.tokenType)) throw new Error("Invalid Snowflake configuration");
  return config as SnowflakeConfig;
}
const resultSchema = z.object({ data: z.array(z.tuple([z.string(), z.string()])).max(2),
  resultSetMetaData: z.object({ numRows: z.number().int().min(0).max(2),
    partitionInfo: z.array(z.object({ rowCount: z.number().int().nonnegative() })).min(1).max(1) }) });
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing Snowflake response");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 65536) throw new Error("Oversized Snowflake response");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function query(config: SnowflakeConfig, fetcher: typeof fetch): Promise<VehicleKnowledge[]> {
  const origin = `https://${config.account}.snowflakecomputing.com`;
  const headers = { Authorization: `Bearer ${config.token}`, "X-Snowflake-Authorization-Token-Type": config.tokenType,
    "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Fork/1.0" };
  // Bound both query execution and the whole retrieval, including async polling and response bodies.
  const signal = AbortSignal.timeout(3000);
  let response = await fetcher(`${origin}/api/v2/statements`, { method: "POST", headers, signal, redirect: "error", cache: "no-store",
    body: JSON.stringify({ statement: `SELECT VEHICLE_ID, TO_JSON(DOCUMENT) FROM ${config.table} WHERE VEHICLE_ID IN (?, ?) LIMIT 3`,
      database: config.database, schema: config.schema, warehouse: config.warehouse, role: config.role, timeout: 2,
      bindings: { "1": { type: "TEXT", value: vehicleKnowledgeIds[0] }, "2": { type: "TEXT", value: vehicleKnowledgeIds[1] } } }) });
  for (let poll = 0; response.status === 202 && poll < 6; poll++) {
    const pending = z.object({ statementHandle: z.string().regex(/^[a-z0-9-]{1,100}$/i) }).parse(await boundedJson(response));
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error("Retrieval timed out")); return; }
      const abort = () => { clearTimeout(timer); reject(new Error("Retrieval timed out")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 150);
      signal.addEventListener("abort", abort, { once: true });
    });
    // Construct status URLs ourselves; never send credentials to a URL from a response.
    response = await fetcher(`${origin}/api/v2/statements/${pending.statementHandle}`, { headers, signal, redirect: "error", cache: "no-store" });
  }
  if (response.status !== 200) { await response.body?.cancel(); throw new Error("Vehicle retrieval unavailable"); }
  const result = resultSchema.parse(await boundedJson(response));
  if (result.data.length !== 2 || result.resultSetMetaData.numRows !== 2 || result.resultSetMetaData.partitionInfo[0].rowCount !== 2)
    throw new Error("Incomplete vehicle knowledge");
  const docs = result.data.map(([id, json]) => {
    const doc = VehicleKnowledgeSchema.parse(JSON.parse(json));
    if (doc.vehicleId !== id) throw new Error("Vehicle key mismatch");
    return doc;
  });
  if (new Set(docs.map(doc => doc.vehicleId)).size !== 2) throw new Error("Duplicate vehicle knowledge");
  return docs;
}
/** One shared bounded lookup for the supported catalogue; cache is public facts, never user data. */
export function createVehicleKnowledgeRepository(configure = readSnowflakeConfig, fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: VehicleKnowledgeResult | undefined, until = 0, previous: string | undefined;
  let pending: Promise<VehicleKnowledgeResult> | undefined;
  return async (ids: readonly string[], signal?: AbortSignal): Promise<VehicleKnowledgeResult> => {
    const wanted = new Set(ids.filter(id => (vehicleKnowledgeIds as readonly string[]).includes(id)));
    const local = (status: "unconfigured" | "unavailable"): VehicleKnowledgeResult => ({ source: "local-fixture", status, vehicles: getLocalVehicleKnowledge() });
    if (!wanted.size || signal?.aborted) return { ...local("unavailable"), vehicles: [] };
    let config: SnowflakeConfig | undefined;
    try { config = configure(); } catch { return { ...local("unavailable"), vehicles: getLocalVehicleKnowledge().filter(v => wanted.has(v.vehicleId)) }; }
    // Configuration including rotated auth stays private in memory and is never logged or returned.
    const key = JSON.stringify(config);
    if (key !== previous) { cached = undefined; until = 0; previous = key; pending = undefined; }
    if (!config) cached = local("unconfigured");
    else if (!cached || now() >= until) {
      pending ??= query(config, fetcher).then(vehicles => ({ source: "snowflake" as const, status: "ready" as const, vehicles }))
        .catch(() => local("unavailable"));
      const current = pending;
      const value = await current;
      if (previous === key) { cached = value; until = now() + (value.status === "ready" ? 60000 : 5000); if (pending === current) pending = undefined; }
      return { ...value, vehicles: signal?.aborted ? [] : structuredClone(value.vehicles.filter(v => wanted.has(v.vehicleId))) };
    }
    return { ...cached!, vehicles: structuredClone(cached!.vehicles.filter(v => wanted.has(v.vehicleId))) };
  };
}
export const retrieveVehicleKnowledge = createVehicleKnowledgeRepository();
