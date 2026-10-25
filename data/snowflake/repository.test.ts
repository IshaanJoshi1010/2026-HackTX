import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createVehicleKnowledgeRepository, readSnowflakeConfig, type SnowflakeConfig } from "./repository";
import { getLocalVehicleKnowledge, vehicleKnowledgeIds } from "./documents";
import { buildVehicleKnowledgeSeedSql } from "./seed";
const config: SnowflakeConfig = { account: "test-org", token: "test-private-token", database: "FORK", schema: "PUBLIC", warehouse: "FORK_WH", role: "FORK_READ", table: "VEHICLE_KNOWLEDGE", tokenType: "PROGRAMMATIC_ACCESS_TOKEN" };
const docs = getLocalVehicleKnowledge();
const body = () => ({ data: docs.map(doc => [doc.vehicleId, JSON.stringify(doc)]), resultSetMetaData: { numRows: 2, partitionInfo: [{ rowCount: 2 }] } });
const response = (value: unknown = body(), status = 200) => Response.json(value, { status });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("Snowflake vehicle retrieval", () => {
  it("requires explicit valid configuration, with no host/identifier injection", () => {
    expect(readSnowflakeConfig({})).toBeUndefined();
    const env = Object.fromEntries(Object.entries(config).map(([key,value]) => [`SNOWFLAKE_${key === "tokenType" ? "TOKEN_TYPE" : key.toUpperCase()}`, value]));
    expect(readSnowflakeConfig(env)).toEqual(config);
    expect(() => readSnowflakeConfig({ ...env, SNOWFLAKE_ACCOUNT: "evil.test/path" })).toThrow();
    expect(() => readSnowflakeConfig({ ...env, SNOWFLAKE_TABLE: "X;DROP TABLE X" })).toThrow();
  });
  it("uses parameterized read-only SQL and keeps secrets/private records out of the result", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const read = createVehicleKnowledgeRepository(() => config, fetcher);
    const result = await read(vehicleKnowledgeIds);
    expect(result.source).toBe("snowflake"); expect(result.vehicles).toEqual(docs);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://test-org.snowflakecomputing.com/api/v2/statements");
    expect(init?.redirect).toBe("error");
    const sent = JSON.parse(String(init?.body));
    expect(sent.statement).toContain("IN (?, ?) LIMIT 3");
    expect(sent.bindings["1"].value).toBe(vehicleKnowledgeIds[0]);
    expect(JSON.stringify(result)).not.toMatch(/test-private-token|vin|finance|annualMiles/i);
  });
  it("coalesces parallel calls and caches immutable facts for one minute", async () => {
    let time = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const read = createVehicleKnowledgeRepository(() => config, fetcher, () => time);
    const [a,b] = await Promise.all([read([vehicleKnowledgeIds[0]]), read([vehicleKnowledgeIds[1]])]);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(b.vehicles).toHaveLength(1);
    a.vehicles[0].specs.mpgCombined.value = 999;
    expect((await read(vehicleKnowledgeIds)).vehicles[0].specs.mpgCombined.value).not.toBe(999);
    time = 60001; await read(vehicleKnowledgeIds); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("supports async responses without following an untrusted status URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ statementHandle: "abc-123", statementStatusUrl: "https://evil.test" },202)).mockResolvedValueOnce(response());
    expect((await createVehicleKnowledgeRepository(() => config, fetcher)(vehicleKnowledgeIds)).source).toBe("snowflake");
    expect(fetcher.mock.calls[1][0]).toBe("https://test-org.snowflakecomputing.com/api/v2/statements/abc-123");
  });
  it.each(["error", "missing", "duplicates", "bad-json", "wrong-key", "wrong-identity", "unverified-exact", "oversized", "partitions"])("falls back honestly for %s", async failure => {
    const value = body();
    if (failure === "missing") value.data.pop();
    if (failure === "duplicates") value.data[1] = value.data[0];
    if (failure === "bad-json") value.data[0][1] = "{";
    if (failure === "wrong-key") value.data[0][0] = vehicleKnowledgeIds[1];
    if (failure === "wrong-identity") value.data[0][1] = JSON.stringify({ ...docs[0], year: 2024 });
    if (failure === "unverified-exact") value.data[0][1] = JSON.stringify({ ...docs[0], matchStatus: "exact" });
    if (failure === "partitions") value.resultSetMetaData.partitionInfo.push({rowCount: 1});
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(failure === "error" ? response({message: "private"},401) : failure === "oversized" ? new Response("x".repeat(70000)) : response(value));
    const result = await createVehicleKnowledgeRepository(() => config, fetcher)(vehicleKnowledgeIds);
    expect(result).toEqual({ source: "local-fixture", status: "unavailable", vehicles: docs });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("preserves offline operation and skips unsupported IDs and aborted requests", async () => {
    const fetcher = vi.fn<typeof fetch>(); const read = createVehicleKnowledgeRepository(() => undefined, fetcher);
    expect((await read(vehicleKnowledgeIds)).status).toBe("unconfigured");
    expect((await read(["'; DROP TABLE X"])).vehicles).toEqual([]);
    expect((await read(vehicleKnowledgeIds, AbortSignal.abort())).vehicles).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds slow retrieval to three seconds and briefly caches outages", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve,reject) => init?.signal?.addEventListener("abort", () => reject(new Error("Timeout")))));
    const read = createVehicleKnowledgeRepository(() => config, fetcher);
    const pending = read(vehicleKnowledgeIds); await vi.advanceTimersByTimeAsync(3001);
    expect((await pending).status).toBe("unavailable");
    await read(vehicleKnowledgeIds); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("generates repeatable MERGE seed statements from the validated public fixtures", () => {
    const sql = buildVehicleKnowledgeSeedSql();
    expect(sql.match(/MERGE INTO/g)).toHaveLength(2); expect(sql).toContain("PARSE_JSON");
    expect(sql).toContain('"identitySource":"synthetic"');
    expect(sql).not.toMatch(/annualMiles|finance|GEMINI_API_KEY|900001/);
  });
});
