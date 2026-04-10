export interface CacheEntry {
  type: string;
  target?: string;
  value?: string;
  description: string;
  domHash?: string;
  successCount?: number;
  lastAccessed: number;
}

export class ActionCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  private generateKey(instruction: string, url: string, domSnapshot?: string): string {
    const normalized = instruction
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\b(the|a|an)\b/g, "")
      .trim();

    let normalizedUrl: string;
    try {
      const urlObj = new URL(url);
      normalizedUrl = `${urlObj.origin}${urlObj.pathname}`.toLowerCase();
    } catch {
      normalizedUrl = url.toLowerCase();
    }

    const domHash = domSnapshot ? this.fastHash(domSnapshot.slice(0, 500)) : "";

    return `${normalized}|${normalizedUrl}|${domHash}`;
  }

  private fastHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
  }

  get(instruction: string, url: string, domSnapshot?: string): CacheEntry | undefined {
    const key = this.generateKey(instruction, url, domSnapshot);
    const entry = this.cache.get(key);

    if (entry) {
      this.hits++;
      entry.lastAccessed = Date.now();
      return entry;
    }

    this.misses++;
    return undefined;
  }

  set(instruction: string, url: string, entry: CacheEntry, domSnapshot?: string): void {
    const key = this.generateKey(instruction, url, domSnapshot);
    const existing = this.cache.get(key);

    if (existing) {
      entry.successCount = (existing.successCount ?? 0) + 1;
      entry.lastAccessed = Date.now();
      this.cache.set(key, entry);
    } else {
      entry.successCount = 1;
      entry.lastAccessed = Date.now();
      this.cache.set(key, entry);

      if (this.cache.size > this.maxSize) {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;

        for (const [k, v] of this.cache) {
          if (v.lastAccessed < oldestTime) {
            oldestTime = v.lastAccessed;
            oldestKey = k;
          }
        }

        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
    }
  }

  getStats(): { size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
