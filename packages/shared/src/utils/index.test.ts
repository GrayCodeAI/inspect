import { describe, it, expect } from "vitest";
import {
  generateId,
  sleep,
  retry,
  sha256,
  slugify,
  truncate,
  formatDuration,
  isUrl,
  parseUrl,
  deepMerge,
  chunk,
  createRefGenerator,
  clamp,
  pick,
  omit,
  safeJsonParse,
  escapeRegExp,
  deferred,
  createTimer,
} from "./index.js";

describe("generateId", () => {
  it("returns a valid UUID v4 string", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("returns unique values on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("sleep", () => {
  it("resolves after approximately the specified time", async () => {
    const start = performance.now();
    await sleep(50);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });

  it("resolves immediately for 0ms", async () => {
    const start = performance.now();
    await sleep(0);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

describe("retry", () => {
  it("returns result on first success without retrying", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        return "ok";
      },
      3,
      1,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("fail");
        return "success";
      },
      3,
      1,
    );
    expect(result).toBe("success");
    expect(calls).toBe(3);
  });

  it("throws the last error after exhausting retries", async () => {
    await expect(
      retry(
        async () => {
          throw new Error("always fails");
        },
        2,
        1,
      ),
    ).rejects.toThrow("always fails");
  });

  it("respects maxRetries parameter", async () => {
    let calls = 0;
    try {
      await retry(
        async () => {
          calls++;
          throw new Error("fail");
        },
        1,
        1,
      );
    } catch {
      // expected
    }
    // maxRetries=1 means attempt 0 + 1 retry = 2 calls
    expect(calls).toBe(2);
  });
});

describe("sha256", () => {
  it("produces a 64-character hex string", () => {
    const hash = sha256("hello");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces consistent hashes for the same input", () => {
    expect(sha256("test")).toBe(sha256("test"));
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  it("matches known SHA-256 for empty string", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("Hello! World?")).toBe("hello-world");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("a   b   c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("replaces underscores with hyphens", () => {
    expect(slugify("hello_world")).toBe("hello-world");
  });
});

describe("truncate", () => {
  it("returns the original string if shorter than maxLength", () => {
    expect(truncate("short", 256)).toBe("short");
  });

  it("truncates and adds ellipsis when exceeding maxLength", () => {
    const result = truncate("a".repeat(300), 10);
    expect(result).toBe("a".repeat(7) + "...");
    expect(result.length).toBe(10);
  });

  it("returns original string when exactly at maxLength", () => {
    const text = "a".repeat(256);
    expect(truncate(text, 256)).toBe(text);
  });

  it("uses default maxLength of 256", () => {
    const longText = "x".repeat(500);
    const result = truncate(longText);
    expect(result.length).toBe(256);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats milliseconds", () => {
    expect(formatDuration(150)).toBe("150ms");
  });

  it("formats 0ms", () => {
    expect(formatDuration(0)).toBe("0ms");
  });

  it("formats negative as 0ms", () => {
    expect(formatDuration(-100)).toBe("0ms");
  });

  it("formats exact seconds", () => {
    expect(formatDuration(2000)).toBe("2s");
  });

  it("formats fractional seconds", () => {
    expect(formatDuration(2500)).toBe("2.5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration(3_930_000)).toBe("1h 5m 30s");
  });

  it("formats hours only", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
  });
});

describe("isUrl", () => {
  it("returns true for http URLs", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  it("returns true for https URLs", () => {
    expect(isUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("returns false for ftp URLs", () => {
    expect(isUrl("ftp://example.com")).toBe(false);
  });

  it("returns false for random strings", () => {
    expect(isUrl("not a url")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isUrl("")).toBe(false);
  });
});

describe("parseUrl", () => {
  it("returns a URL object for valid URLs", () => {
    const url = parseUrl("https://example.com/path?q=1#frag");
    expect(url).not.toBeNull();
    expect(url!.hostname).toBe("example.com");
    expect(url!.pathname).toBe("/path");
    expect(url!.searchParams.get("q")).toBe("1");
    expect(url!.hash).toBe("#frag");
  });

  it("returns null for invalid URLs", () => {
    expect(parseUrl("not a url")).toBeNull();
  });
});

describe("deepMerge", () => {
  it("merges flat objects", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("overwrites target properties with source", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("deep merges nested objects", () => {
    const result = deepMerge({ nested: { a: 1, b: 2 } }, { nested: { b: 3, c: 4 } });
    expect(result).toEqual({ nested: { a: 1, b: 3, c: 4 } });
  });

  it("replaces arrays instead of merging", () => {
    const result = deepMerge({ arr: [1, 2] }, { arr: [3] });
    expect(result).toEqual({ arr: [3] });
  });

  it("does not mutate the original target", () => {
    const target = { a: 1 };
    deepMerge(target, { a: 2 });
    expect(target.a).toBe(1);
  });
});

describe("chunk", () => {
  it("splits an array into chunks of the specified size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk if array fits", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("returns empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("throws for size <= 0", () => {
    expect(() => chunk([1], 0)).toThrow("Chunk size must be greater than 0");
  });
});

describe("createRefGenerator", () => {
  it("generates sequential refs with default prefix", () => {
    const gen = createRefGenerator();
    expect(gen()).toBe("e1");
    expect(gen()).toBe("e2");
    expect(gen()).toBe("e3");
  });

  it("uses a custom prefix", () => {
    const gen = createRefGenerator("item");
    expect(gen()).toBe("item1");
    expect(gen()).toBe("item2");
  });
});

describe("clamp", () => {
  it("clamps below min", () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it("clamps above max", () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it("returns value when within range", () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
});

describe("pick", () => {
  it("picks specified keys", () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("ignores keys not in the object", () => {
    expect(pick({ a: 1 } as Record<string, unknown>, ["a", "z" as never])).toEqual({ a: 1 });
  });
});

describe("omit", () => {
  it("omits specified keys", () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns undefined for invalid JSON", () => {
    expect(safeJsonParse("not json")).toBeUndefined();
  });
});

describe("escapeRegExp", () => {
  it("escapes special regex characters", () => {
    const escaped = escapeRegExp("a.b*c?d+e[f]");
    expect(escaped).toBe("a\\.b\\*c\\?d\\+e\\[f\\]");
    const re = new RegExp(escaped);
    expect(re.test("a.b*c?d+e[f]")).toBe(true);
  });
});

describe("deferred", () => {
  it("resolves the promise externally", async () => {
    const d = deferred<number>();
    d.resolve(42);
    await expect(d.promise).resolves.toBe(42);
  });

  it("rejects the promise externally", async () => {
    const d = deferred<number>();
    d.reject(new Error("fail"));
    await expect(d.promise).rejects.toThrow("fail");
  });
});

describe("createTimer", () => {
  it("measures elapsed time", async () => {
    const timer = createTimer();
    await sleep(20);
    expect(timer.elapsed()).toBeGreaterThan(10);
  });

  it("resets the timer", async () => {
    const timer = createTimer();
    await sleep(20);
    timer.reset();
    expect(timer.elapsed()).toBeLessThan(15);
  });
});
