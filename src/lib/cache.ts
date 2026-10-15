type Entry<T> = { expiresAt: number; value: T };

/** Bounded warm-instance cache. Only successful loads are retained. */
export class TtlCache {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly ttlMs: number, private readonly maxEntries = 100) {}

  async getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    const existing = this.entries.get(key) as Entry<T> | undefined;
    if (existing) return existing.value;
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<T>;
    const promise = Promise.resolve().then(load).then(value => {
      if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
      this.entries.set(key, { expiresAt: Date.now() + this.ttlMs, value });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  clear(): void { this.entries.clear(); this.pending.clear(); }
}
