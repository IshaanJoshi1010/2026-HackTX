import type { GenerationRequest, Generator } from "./gemini";
import { AIUnavailable } from "./status";

export const INTERPRET_BUDGET_MS = 10_000;
export const EXPLAIN_BUDGET_MS = 7_000;
/** One wall-clock budget includes validation retries. Cancels local waiting; provider billing may continue. */
export function createGenerationBudget(generate: Generator, timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const end = Date.now() + timeoutMs;
  const abort = () => controller.abort(new AIUnavailable("AI request cancelled", { status: "cancelled" }));
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new AIUnavailable("AI request deadline", { status: "timeout" })), timeoutMs);
  return {
    async run(request: GenerationRequest): Promise<string> {
      const remaining = end - Date.now();
      if (controller.signal.aborted || remaining <= 0) throw (controller.signal.reason instanceof AIUnavailable ? controller.signal.reason : new AIUnavailable("AI request ended", { status: "timeout" }));
      let listener: () => void = () => {};
      const ended = new Promise<never>((_, reject) => {
        listener = () => reject((controller.signal.reason instanceof AIUnavailable ? controller.signal.reason : new AIUnavailable("AI request ended", { status: "timeout" })));
        controller.signal.addEventListener("abort", listener, { once: true });
      });
      try {
        const result = Promise.resolve().then(() => {
          if (controller.signal.aborted) throw (controller.signal.reason instanceof AIUnavailable ? controller.signal.reason : new AIUnavailable("AI request ended", { status: "timeout" }));
          return generate({ ...request, signal: controller.signal, timeoutMs: remaining });
        });
        return await Promise.race([result, ended]);
      } finally { controller.signal.removeEventListener("abort", listener); }
    },
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
      abort();
    },
  };
}
