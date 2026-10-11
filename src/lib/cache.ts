type Entry<T> = { expiresAt: number; value: T };

export class TtlCache {
  private readonly entries = new Map<string, Entry<unknown>>();

  constructor(private readonly ttlMs: number) {}

  async getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key) as Entry<T> | undefined;
    if (existing && existing.expiresAt > Date.now()) return existing.value;
    if (existing) this.entries.delete(key);

    const value = await load();
    this.entries.set(key, { expiresAt: Date.now() + this.ttlMs, value });
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}
