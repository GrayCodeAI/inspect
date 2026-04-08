import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Fingerprint } from "./fingerprint.js";

describe("Fingerprint", () => {
  let fingerprint: Fingerprint;

  beforeEach(() => {
    fingerprint = new Fingerprint();
  });

  describe("computeFingerprint", () => {
    it("should compute a unique fingerprint based on input parameters", async () => {
      const fingerprint1 = await Effect.runPromise(
        Fingerprint.computeFingerprint({
          headRef: "main",
          currentBranch: "feature/test",
          stagedDiff: "diff --git a/file1 b/file1",
          unstagedDiff: "",
        }),
      );
      expect(fingerprint1).toBeString();
      expect(fingerprint1.length).toBeGreaterThan(0);

      // Different input should produce different fingerprint
      const fingerprint2 = await Effect.runPromise(
        Fingerprint.computeFingerprint({
          headRef: "main",
          currentBranch: "feature/test",
          stagedDiff: "diff --git a/file2 b/file2",
          unstagedDiff: "",
        }),
      );
      expect(fingerprint2).not.toEqual(fingerprint1);
    });

    it("should handle empty diffs gracefully", async () => {
      const fingerprint = await Effect.runPromise(
        Fingerprint.computeFingerprint({
          headRef: "main",
          currentBranch: "feature/test",
          stagedDiff: "",
          unstagedDiff: "",
        }),
      );
      expect(fingerprint).toBeString();
      expect(fingerprint.length).toBeGreaterThan(0);
    });
  });

  describe("loadSavedFingerprint", () => {
    it("should load a saved fingerprint from file", async () => {
      const cacheFile = "/tmp/test-fingerprint.txt";
      await Effect.runPromise(Fingerprint.saveFingerprint("test-fingerprint-123", cacheFile));

      const fingerprint = await Effect.runPromise(Fingerprint.loadSavedFingerprint(cacheFile));
      expect(fingerprint).toEqual("test-fingerprint-123");
    });

    it("should return undefined if file doesn't exist", async () => {
      const fingerprint = await Effect.runPromise(
        Fingerprint.loadSavedFingerprint("/nonexistent/path.txt"),
      );
      expect(fingerprint).toBeUndefined();
    });

    it("should handle read errors gracefully", async () => {
      // Mock a read error by providing a directory instead of file
      const fingerprint = await Effect.runPromise(Fingerprint.loadSavedFingerprint("/tmp"));
      expect(fingerprint).toBeUndefined();
    });
  });

  describe("saveFingerprint", () => {
    it("should save fingerprint to a file", async () => {
      const cacheFile = "/tmp/test-save-fingerprint.txt";
      await Effect.runPromise(Fingerprint.saveFingerprint("fingerprint-xyz", cacheFile));

      const exists = await Effect.runPromise(Fingerprint.loadSavedFingerprint(cacheFile));
      expect(exists).toEqual("fingerprint-xyz");
    });

    it("should create parent directories if they don't exist", async () => {
      const cacheFile = "/tmp/subdir1/subdir2/fingerprint.txt";
      await Effect.runPromise(Fingerprint.saveFingerprint("fingerprint-123", cacheFile));

      const exists = await Effect.runPromise(Fingerprint.loadSavedFingerprint(cacheFile));
      expect(exists).toEqual("fingerprint-123");

      // Cleanup
      await Effect.runPromise(
        Effect.tryPromise({
          try: () => import("fs/promises").then((fs) => fs.unlink(cacheFile)),
          catch: () => Effect.unit(),
        }),
      );
    });
  });

  describe("shouldSkip", () => {
    it("should return true if fingerprint matches saved fingerprint", async () => {
      const cacheFile = "/tmp/test-skip-fingerprint.txt";
      const currentFingerprint = "fingerprint-123";
      await Effect.runPromise(Fingerprint.saveFingerprint(currentFingerprint, cacheFile));

      const shouldSkip = await Effect.runPromise(
        Fingerprint.shouldSkip(
          {
            headRef: "main",
            currentBranch: "feature/test",
            stagedDiff: "diff --git a/file1 b/file1",
            unstagedDiff: "",
          },
          cacheFile,
        ),
      );
      expect(shouldSkip).toBe(true);
    });

    it("should return false if fingerprint doesn't match", async () => {
      const cacheFile = "/tmp/test-skip-fingerprint.txt";
      await Effect.runPromise(Fingerprint.saveFingerprint("old-fingerprint", cacheFile));

      const shouldSkip = await Effect.runPromise(
        Fingerprint.shouldSkip(
          {
            headRef: "main",
            currentBranch: "feature/test",
            stagedDiff: "diff --git a/file1 b/file1", // This will produce a different fingerprint
            unstagedDiff: "",
          },
          cacheFile,
        ),
      );
      expect(shouldSkip).toBe(false);
    });

    it("should handle missing fingerprint file gracefully", async () => {
      const shouldSkip = await Effect.runPromise(
        Fingerprint.shouldSkip(
          {
            headRef: "main",
            currentBranch: "feature/test",
            stagedDiff: "diff --git a/file1 b/file1",
            unstagedDiff: "",
          },
          "/nonexistent/fingerprint.txt",
        ),
      );
      expect(shouldSkip).toBe(false);
    });
  });
});
