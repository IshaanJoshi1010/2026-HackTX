/** Provider grammar compatibility only. The original Zod schema still validates every response.
 * Large bounded arrays/strings can make Gemini reject the generated grammar even though the
 * same JSON schema validates locally. Keep types, exact quote enums and object structure on
 * the wire; enforce lengths, counts and refinements with Zod after generation. */
const localOnly = new Set(["minLength", "maxLength", "minItems", "maxItems"]);
export function toProviderSchema(schema: Record<string, unknown>): Record<string, unknown> {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (localOnly.has(key)) continue;
      // Property/definition names are user-defined keys, not schema keywords.
      result[key] = ["properties", "$defs", "definitions"].includes(key) && child && typeof child === "object" && !Array.isArray(child)
        ? Object.fromEntries(Object.entries(child).map(([name, definition]) => [name, visit(definition)])) : visit(child);
    }
    return result;
  }
  return visit(schema) as Record<string, unknown>;
}
