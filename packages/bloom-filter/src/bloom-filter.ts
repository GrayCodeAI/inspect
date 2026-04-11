// ──────────────────────────────────────────────────────────────────────────────
// Bloom Filter Implementation
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";

export class BloomFilterConfig extends Schema.Class<BloomFilterConfig>("BloomFilterConfig")({
  capacity: Schema.Number,
  falsePositiveRate: Schema.Number,
}) {}

export class BloomFilter {
  private bits: Uint8Array;
  private hashFunctionCount: number;
  private itemCount: number;

  constructor(config: BloomFilterConfig) {
    const bitSize = this.calculateBitSize(config.capacity, config.falsePositiveRate);
    this.hashFunctionCount = this.calculateHashFunctions(config.falsePositiveRate);
    this.bits = new Uint8Array(Math.ceil(bitSize / 8));
    this.itemCount = 0;
  }

  private calculateBitSize(capacity: number, falsePositiveRate: number): number {
    const n = capacity;
    const p = falsePositiveRate;
    return Math.ceil(-(n * Math.log(p)) / Math.log(2) ** 2);
  }

  private calculateHashFunctions(falsePositiveRate: number): number {
    return Math.max(1, Math.ceil(Math.log(2) * (1 / falsePositiveRate)));
  }

  private hash(item: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < item.length; i++) {
      hash = Math.imul(hash ^ item.charCodeAt(i), 2654435761);
      hash = (hash ^ (hash >>> 16)) >>> 0;
    }
    return hash;
  }

  private getBitIndices(item: string): number[] {
    const bitSize = this.bits.length * 8;
    const indices: number[] = [];

    for (let i = 0; i < this.hashFunctionCount; i++) {
      const hash = this.hash(item, i * 0x100000001);
      indices.push(hash % bitSize);
    }

    return indices;
  }

  add(item: string): Effect.Effect<void> {
    return Effect.sync(() => {
      const indices = this.getBitIndices(item);
      for (const index of indices) {
        const byteIndex = index >>> 3;
        const bitIndex = index & 0x07;
        this.bits[byteIndex] |= 1 << bitIndex;
      }
      this.itemCount++;
    });
  }

  contains(item: string): Effect.Effect<boolean> {
    return Effect.sync(() => {
      const indices = this.getBitIndices(item);
      for (const index of indices) {
        const byteIndex = index >>> 3;
        const bitIndex = index & 0x07;
        if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
          return false;
        }
      }
      return true;
    });
  }

  get approximateItemCount(): number {
    return this.itemCount;
  }

  get estimatedFalsePositiveRate(): number {
    const bitSize = this.bits.length * 8;
    let setBits = 0;
    for (const byte of this.bits) {
      for (let i = 0; i < 8; i++) {
        if ((byte & (1 << i)) !== 0) {
          setBits++;
        }
      }
    }
    const k = this.hashFunctionCount;
    const m = bitSize;
    const n = this.itemCount;
    return (1 - Math.exp((-k * n) / m)) ** k;
  }
}
