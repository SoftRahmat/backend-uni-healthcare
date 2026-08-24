type CacheEntry = { value: unknown; expiresAt: number };

export class ApplicationCache {
  private readonly entries = new Map<string, CacheEntry>();

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  }

  deleteByPrefix(...prefixes: string[]): void {
    for (const key of this.entries.keys()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) this.entries.delete(key);
    }
  }
}

export const applicationCache = new ApplicationCache();
