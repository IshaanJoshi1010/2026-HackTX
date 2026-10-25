import { getLocalVehicleKnowledge } from "./documents";

/** Review and run output in the chosen database/schema. No credentials or driver data. */
export function buildVehicleKnowledgeSeedSql(): string {
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  return [
    "-- Select your database and schema before running. All identities are synthetic demo records.",
    "CREATE TABLE IF NOT EXISTS VEHICLE_KNOWLEDGE (VEHICLE_ID VARCHAR NOT NULL, DOCUMENT VARIANT NOT NULL, UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP());",
    ...getLocalVehicleKnowledge().map(doc => `MERGE INTO VEHICLE_KNOWLEDGE t USING (SELECT ${literal(doc.vehicleId)} AS VEHICLE_ID, PARSE_JSON(${literal(JSON.stringify(doc))}) AS DOCUMENT) s ON t.VEHICLE_ID = s.VEHICLE_ID WHEN MATCHED THEN UPDATE SET DOCUMENT = s.DOCUMENT, UPDATED_AT = CURRENT_TIMESTAMP() WHEN NOT MATCHED THEN INSERT (VEHICLE_ID, DOCUMENT) VALUES (s.VEHICLE_ID, s.DOCUMENT);`),
  ].join("\n\n") + "\n";
}
