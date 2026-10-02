/** Bound bytes actually received; Content-Length alone does not cover chunked requests. */
export class JsonBodyError extends Error {
  constructor(public readonly status: 400 | 413) {
    super(status === 413 ? "İstek boyutu çok büyük." : "Geçerli bir JSON nesnesi gerekli.");
  }
}

export async function readBoundedJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declaredTooLarge = Number(request.headers.get("content-length") || 0) > maxBytes;
  if (!request.body) throw new JsonBodyError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        // Stop reading; the HTTP runtime owns disposal of the unread body.
        // Cancelling a server request stream can abort its 413 response.
        throw new JsonBodyError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (declaredTooLarge) throw new JsonBodyError(413);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new JsonBodyError(400); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new JsonBodyError(400);
  return value as Record<string, unknown>;
}
