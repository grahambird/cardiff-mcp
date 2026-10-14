import { logEvent } from "@/lib/logger";
import { OnsError } from "./types";
const MAX_BYTES = 128 * 1024;
const cache = new Map<string, { expires: number; value: unknown; retrievedAt: string }>();
const inFlight = new Map<string, Promise<{ value: unknown; retrievedAt: string }>>();
let active = 0;
let starts: number[] = [];
let cooldown = 0;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function acquire(deadline: number) {
  while (true) {
    const now = Date.now();
    if (now >= deadline) throw new OnsError("timeout", "ONS operation deadline exceeded.");
    if (cooldown > now) throw new OnsError("throttled", "ONS is temporarily limiting requests. Retry later.", 429);
    starts = starts.filter(t => t > now - 10_000);
    if (active < 2 && starts.length < 10) { active++; starts.push(now); return; }
    await wait(Math.min(50, deadline - now));
  }
}
async function load(url: string, deadline: number, validate?: (value: unknown) => void) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await acquire(deadline);
    const started = performance.now();
    let retry = false;
    let status: number | undefined;
    let outcome = "error";
    try {
      const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "mcp-wales/0.1 (+https://mcp.wales)" }, signal: AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - Date.now()))) });
      status = response.status;
      if (response.status === 429) {
        const header = response.headers.get("retry-after");
        const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - Date.now() : 10_000;
        cooldown = Math.max(cooldown, Date.now() + (Number.isFinite(delay) ? Math.max(delay, 1000) : 10_000));
        throw new OnsError("throttled", "ONS is temporarily limiting requests. Retry after its cooldown.", 429);
      }
      if (response.status === 403) throw new OnsError("upstream", "ONS refused access to this request.", 403);
      if (response.status === 404) throw new OnsError("unavailable", "The requested ONS dataset or observations are unavailable.", 404);
      if (response.status >= 500 && attempt === 0) { retry = true; await response.body?.cancel(); }
      else if (!response.ok) throw new OnsError("upstream", `ONS returned HTTP ${response.status}.`, response.status);
      else {
        if (Number(response.headers.get("content-length")) > MAX_BYTES) { await response.body?.cancel(); throw new OnsError("malformed", "ONS response exceeds the size limit."); }
        const reader = response.body?.getReader();
        if (!reader) throw new OnsError("malformed", "ONS returned an empty response.");
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel(); throw new OnsError("malformed", "ONS response exceeds the size limit."); }
          chunks.push(value);
        }
        let value: unknown;
        try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new OnsError("malformed", "ONS returned invalid JSON."); }
        validate?.(value);
        outcome = "success";
        return { value, retrievedAt: new Date().toISOString() };
      }
    } catch (error) {
      if (error instanceof OnsError) throw error;
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new OnsError("timeout", "ONS request timed out.");
      if (attempt === 0) retry = true;
      else throw new OnsError("upstream", "ONS could not be reached.");
    } finally {
      active--;
      logEvent("info", "upstream_request", { provider: "ons", duration_ms: Math.round(performance.now() - started), retry_count: attempt, outcome: retry ? "retry" : outcome, upstream_status: status });
    }
    if (retry) await wait(Math.min(250, Math.max(0, deadline - Date.now())));
  }
  throw new OnsError("upstream", "ONS could not be reached.");
}
export async function requestJson(url: string, deadline = Date.now() + 20_000, validate?: (value: unknown) => void) {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return { value: cached.value, retrievedAt: cached.retrievedAt };
  cache.delete(url);
  const pending = inFlight.get(url);
  if (pending) return pending;
  const promise = load(url, deadline, validate).then(result => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(url, { ...result, expires: Date.now() + 300_000 });
    return result;
  }).finally(() => inFlight.delete(url));
  inFlight.set(url, promise);
  return promise;
}
export function clearOnsCacheForTests() { cache.clear(); inFlight.clear(); starts = []; cooldown = 0; }
