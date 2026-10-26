// Form bodies are read through these instead of request.formData(), which
// buffers any size (even before the session is checked). Dashboard forms are a
// few kilobytes; the backup upload passes its own limit.
export const FORM_BODY_LIMIT_BYTES = 256 * 1024;

async function readBodyWithin(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return new Uint8Array();

  // Counted while reading: a chunked body declares no length.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    // Just stop reading: cancel() can make undici throw an uncaught error
    // ("ReadableStream is already closed") that would take the process down.
    if (size > maxBytes) {
      reader.releaseLock();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

// The form, or "too_large" past maxBytes. A malformed body reads as empty.
export async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData | "too_large"> {
  try {
    const body = await readBodyWithin(request, maxBytes);
    if (!body) return "too_large";
    return await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return new FormData();
  }
}

// A form within FORM_BODY_LIMIT_BYTES; an oversized or malformed one reads as
// empty, which every route already rejects as invalid input.
export async function readFormData(request: Request) {
  const form = await readLimitedFormData(request, FORM_BODY_LIMIT_BYTES);
  return form === "too_large" ? new FormData() : form;
}
