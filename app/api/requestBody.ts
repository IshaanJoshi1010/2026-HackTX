/** Byte cap is enforced while reading, including chunked bodies without Content-Length. */
export class RequestBodyError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  if (request.signal.aborted) throw new RequestBodyError(499, "Request cancelled");
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > limit) throw new RequestBodyError(413, "Request is too large");
  if (!request.body) throw new RequestBodyError(400, "Missing request body");
  const reader = request.body.getReader();
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  request.signal.addEventListener("abort", onAbort, { once: true });
  let bytes = new Uint8Array(Math.min(limit, 4096));
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (request.signal.aborted) throw new RequestBodyError(499, "Request cancelled");
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new RequestBodyError(413, "Request is too large");
      if (size > bytes.byteLength) {
        const grown = new Uint8Array(Math.min(limit, Math.max(size, bytes.byteLength * 2)));
        grown.set(bytes); bytes = grown;
      }
      bytes.set(value, size - value.byteLength);
    }
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)); }
    catch { throw new RequestBodyError(400, "Invalid UTF-8 request body"); }
    return JSON.parse(text);
  } finally {
    request.signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function requestError(error: unknown, fallback: string): Response {
  if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: fallback }, { status: 400 });
  return Response.json({ error: "Unable to process request" }, { status: 500 });
}
