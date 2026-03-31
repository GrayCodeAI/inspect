import { describe, it, expect } from "vitest";
import { Snapshotter, Differ, ChangeTracker } from "./tracker.js";

describe("Snapshotter", () => {
  describe("create", () => {
    it("should create a snapshot from content", () => {
      const snap = Snapshotter.create("https://example.com", "<html><body>Hello</body></html>");
      expect(snap.url).toBe("https://example.com");
      expect(snap.textContent).toContain("Hello");
      expect(snap.hash).toBeDefined();
      expect(snap.id).toMatch(/^snap_/);
      expect(snap.timestamp).toBeGreaterThan(0);
    });

    it("should include metadata", () => {
      const snap = Snapshotter.create("https://example.com", "content", { key: "value" });
      expect(snap.metadata).toEqual({ key: "value" });
    });

    it("should produce same hash for same content", () => {
      const a = Snapshotter.create("https://example.com", "Hello World");
      const b = Snapshotter.create("https://example.com", "Hello World");
      expect(a.hash).toBe(b.hash);
    });

    it("should produce different hash for different content", () => {
      const a = Snapshotter.create("https://example.com", "Hello");
      const b = Snapshotter.create("https://example.com", "World");
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe("extractText", () => {
    it("should strip HTML tags", () => {
      const text = Snapshotter.extractText("<h1>Title</h1><p>Paragraph</p>");
      expect(text).toBe("Title Paragraph");
    });

    it("should remove script tags", () => {
      const text = Snapshotter.extractText("<p>Hello</p><script>alert('xss')</script>");
      expect(text).toBe("Hello");
      expect(text).not.toContain("alert");
    });

    it("should remove style tags", () => {
      const text = Snapshotter.extractText("<p>Hello</p><style>body{color:red}</style>");
      expect(text).toBe("Hello");
      expect(text).not.toContain("color");
    });
  });

  describe("hash", () => {
    it("should produce consistent hashes", () => {
      const h1 = Snapshotter.hash("test content");
      const h2 = Snapshotter.hash("test content");
      expect(h1).toBe(h2);
    });

    it("should produce different hashes for different input", () => {
      const h1 = Snapshotter.hash("content a");
      const h2 = Snapshotter.hash("content b");
      expect(h1).not.toBe(h2);
    });
  });
});

describe("Differ", () => {
  describe("diff", () => {
    it("should detect added content", () => {
      const prev = Snapshotter.create("https://example.com", "Line 1\nLine 2");
      const curr = Snapshotter.create("https://example.com", "Line 1\nLine 2\nLine 3");
      const diff = Differ.diff(prev, curr);
      // Line 3 is added
      expect(diff.added.some((l) => l.includes("Line 3"))).toBe(true);
      expect(diff.url).toBe("https://example.com");
    });

    it("should detect removed content", () => {
      const prev = Snapshotter.create("https://example.com", "Line 1\nLine 2\nLine 3");
      const curr = Snapshotter.create("https://example.com", "Line 1\nLine 2");
      const diff = Differ.diff(prev, curr);
      // Line 3 is removed
      expect(diff.removed.some((l) => l.includes("Line 3"))).toBe(true);
    });

    it("should detect identical content", () => {
      const prev = Snapshotter.create("https://example.com", "Same content");
      const curr = Snapshotter.create("https://example.com", "Same content");
      const diff = Differ.diff(prev, curr);
      expect(diff.similarity).toBe(1);
      expect(diff.added.length).toBe(0);
      expect(diff.removed.length).toBe(0);
    });

    it("should calculate similarity score", () => {
      const prev = Snapshotter.create("https://example.com", "Line 1\nLine 2\nLine 3");
      const curr = Snapshotter.create("https://example.com", "Line 1\nLine 2\nLine 4");
      const diff = Differ.diff(prev, curr);
      // Similarity should be between 0 and 1 (partial overlap)
      expect(diff.similarity).toBeGreaterThanOrEqual(0);
      expect(diff.similarity).toBeLessThan(1);
    });
  });

  describe("diffJson", () => {
    it("should detect added fields", () => {
      const changes = Differ.diffJson({ a: 1 }, { a: 1, b: 2 });
      expect(changes.some((c) => c.includes("added"))).toBe(true);
    });

    it("should detect removed fields", () => {
      const changes = Differ.diffJson({ a: 1, b: 2 }, { a: 1 });
      expect(changes.some((c) => c.includes("removed"))).toBe(true);
    });

    it("should detect changed values", () => {
      const changes = Differ.diffJson({ a: 1 }, { a: 2 });
      expect(changes.length).toBe(1);
      expect(changes[0]).toContain("1");
      expect(changes[0]).toContain("2");
    });

    it("should handle nested objects", () => {
      const changes = Differ.diffJson({ user: { name: "Alice" } }, { user: { name: "Bob" } });
      expect(changes.length).toBe(1);
      expect(changes[0]).toContain("user.name");
    });

    it("should return empty for identical objects", () => {
      const changes = Differ.diffJson({ a: 1, b: 2 }, { a: 1, b: 2 });
      expect(changes).toEqual([]);
    });
  });
});

describe("ChangeTracker", () => {
  it("should create tracker with config", () => {
    const tracker = new ChangeTracker({
      urls: ["https://example.com"],
      interval: 60000,
    });
    expect(tracker).toBeDefined();
  });

  it("should return empty diffs for unknown URL", () => {
    const tracker = new ChangeTracker({ urls: [] });
    expect(tracker.getDiffs("https://unknown.com")).toEqual([]);
  });

  it("should return undefined snapshot for unknown URL", () => {
    const tracker = new ChangeTracker({ urls: [] });
    expect(tracker.getLatestSnapshot("https://unknown.com")).toBeUndefined();
  });

  it("should return empty history for unknown URL", () => {
    const tracker = new ChangeTracker({ urls: [] });
    expect(tracker.getHistory("https://unknown.com")).toEqual([]);
  });

  it("should export as JSON", () => {
    const tracker = new ChangeTracker({ urls: [] });
    const json = tracker.export();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("should stop monitoring without error", () => {
    const tracker = new ChangeTracker({ urls: [] });
    tracker.stopMonitoring(); // Should not throw
  });
});
