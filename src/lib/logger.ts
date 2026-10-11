type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, boolean | number | string | null | undefined>;

/**
 * Emit one JSON object per line so Vercel Runtime Logs remain searchable.
 * Callers must only pass operational metadata, never tool arguments or prompts.
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.info(entry);
  }
}
