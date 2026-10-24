import { ExtractionSchema, type Extraction } from "./schema";
import { testDumps, type ExtractionCase } from "./testDumps";
export type Extractor = (prompt: string) => unknown | Promise<unknown>;
export interface ExtractionCaseResult { id: string; passed: boolean; expected: Extraction; actual?: Extraction; error?: string }
/** Pluggable extraction evaluator. C8a uses a fake; C8b can supply a mocked or real model adapter. */
export async function runExtractionCases(extract: Extractor, cases: readonly ExtractionCase[] = testDumps): Promise<ExtractionCaseResult[]> {
  const results: ExtractionCaseResult[] = [];
  for (const test of cases) {
    const expected = ExtractionSchema.parse(test.expected);
    try {
      const actual = ExtractionSchema.parse(await extract(test.prompt));
      const passed = JSON.stringify(actual) === JSON.stringify(expected);
      results.push({ id: test.id, passed, expected, actual, ...(!passed ? { error: "Extraction differs from expected structured output" } : {}) });
    } catch (error) {
      results.push({ id: test.id, passed: false, expected, error: error instanceof Error ? error.message : "Extractor failed" });
    }
  }
  return results;
}
/** Exact fixture lookup only. Not an NLP extractor, fallback parser, or claim of model accuracy. */
export function createFixtureExtractor(cases: readonly ExtractionCase[] = testDumps): Extractor {
  return prompt => {
    const test = cases.find(test => test.prompt === prompt);
    if (!test) throw new Error("No fake extraction for this test prompt");
    return structuredClone(test.expected);
  };
}
