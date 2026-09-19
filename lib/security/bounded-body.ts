export class BodyReadError extends Error {
  constructor(public readonly status: 400 | 408 | 413, message: string) {
    super(message);
  }
}

export function validateContentLength(headers: Headers, limit: number) {
  const length = headers.get("content-length");
  if (length === null) return;
  if (!/^\d+$/.test(length)) throw new BodyReadError(400, "Invalid Content-Length");
  if (Number(length) > limit) throw new BodyReadError(413, "Body too large");
}

// Count raw bytes even when Content-Length is missing or understated. The original
// UTF-8 body is passed unchanged to the provider's signature verifier.
export async function readBoundedBody(request: Request, limit: number, timeoutMs = 10_000) {
  validateContentLength(request.headers, limit);
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BodyReadError(408, "Body read timeout")), timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new BodyReadError(413, "Body too large");
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes));
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof BodyReadError) throw error;
    throw new BodyReadError(400, "Invalid body");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
