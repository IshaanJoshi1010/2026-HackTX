export type AIStatus = "busy" | "timeout" | "cancelled" | "unconfigured" | "provider-error" | "invalid-response";
export interface AIStatusInfo { status: AIStatus; retryAfter?: number }
export interface AIRequestOptions { signal?: AbortSignal; onUnavailable?: (info: AIStatusInfo) => void }
export class AIUnavailable extends Error {
  constructor(message = "AI unavailable", readonly statusInfo: AIStatusInfo = { status: "provider-error" }) { super(message); }
}
export function unavailableInfo(error: unknown): AIStatusInfo {
  return error instanceof AIUnavailable ? error.statusInfo : { status: "provider-error" };
}
