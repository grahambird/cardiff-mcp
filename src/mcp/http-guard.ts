const MAX_BODY_BYTES = 64 * 1024;

function allowedOrigins(): Set<string> {
  const origins = new Set(["https://mcp.wales"]);
  // Vercel supplies these settings; never trust incoming Host/proxy headers.
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host && /^[a-z0-9.-]+$/i.test(host)) origins.add(`https://${host}`);
  }
  if (process.env.NODE_ENV === "development") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  return origins;
}

/** Bound bytes before mcp-handler clones/parses JSON; leave RPC semantics to SDK. */
export function guardMcpHandler(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin !== null && !allowedOrigins().has(origin)) return new Response("Forbidden origin", { status: 403 });
    if (request.method !== "POST") return handler(request);
    if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
      await request.body?.cancel();
      return new Response("Request body too large", { status: 413 });
    }
    const reader = request.body?.getReader();
    if (!reader) return handler(request);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return new Response("Request body too large", { status: 413 });
        }
        chunks.push(value);
      }
    } catch { return new Response("Invalid request body", { status: 400 }); }
    finally { reader.releaseLock(); }
    return handler(new Request(request.url, { method: request.method, headers: request.headers,
      body: Buffer.concat(chunks), signal: request.signal }));
  };
}
