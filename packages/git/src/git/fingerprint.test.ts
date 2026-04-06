import { describe, it, expect, beforeEach } from "vitest";
import { Fingerprint } from "./fingerprint.js";
import { randomUUID } from "node:crypto";

describe("Fingerprint", () => {
  let fp: Fingerprint;

  beforeEach(() => {
    fp = new Fingerprint("/tmp/inspect-test-fingerprint-" + randomUUID());
  });

  describe("generate", () => {
    it("produces a 64-character hex string", () => {
      const hash = fp.generate(["file1.ts", "file2.ts"], "some diff");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces consistent hashes for the same input", () => {
      const files = ["a.ts", "b.ts"];
      const diff = "diff content";
      const hash1 = fp.generate(files, diff);
      const hash2 = fp.generate(files, diff);
      expect(hash1).toBe(hash2);
    });

    it("produces the same hash regardless of file order", () => {
      const diff = "diff content";
      const hash1 = fp.generate(["b.ts", "a.ts"], diff);
      const hash2 = fp.generate(["a.ts", "b.ts"], diff);
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different files", () => {
      const hash1 = fp.generate(["file1.ts"], "diff");
      const hash2 = fp.generate(["file2.ts"], "diff");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hashes for different diffs", () => {
      const files = ["file.ts"];
      const hash1 = fp.generate(files, "diff A");
      const hash2 = fp.generate(files, "diff B");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hashes with different salts", () => {
      const files = ["file.ts"];
      const diff = "same diff";
      const hash1 = fp.generate(files, diff, "main");
      const hash2 = fp.generate(files, diff, "feature");
      expect(hash1).not.toBe(hash2);
    });

    it("produces same hash with no salt and undefined salt", () => {
      const files = ["file.ts"];
      const diff = "some diff";
      const hash1 = fp.generate(files, diff);
      const hash2 = fp.generate(files, diff, undefined);
      expect(hash1).toBe(hash2);
    });
  });

  describe("hasChanged", () => {
    it("returns true when no saved fingerprint exists", () => {
      expect(fp.hasChanged("somehash")).toBe(true);
    });

    it("returns false when hash matches saved fingerprint", () => {
      const hash = fp.generate(["file.ts"], "diff");
      fp.save(hash, ["file.ts"], "diff", "main");
      expect(fp.hasChanged(hash)).toBe(false);
    });

    it("returns true when hash differs from saved fingerprint", () => {
      const hash1 = fp.generate(["file.ts"], "diff1");
      fp.save(hash1, ["file.ts"], "diff1", "main");
      const hash2 = fp.generate(["file.ts"], "diff2");
      expect(fp.hasChanged(hash2)).toBe(true);
    });
  });

  describe("save and load", () => {
    it("roundtrips fingerprint data correctly", () => {
      const hash = fp.generate(["a.ts", "b.ts"], "mydiff");
      fp.save(hash, ["a.ts", "b.ts"], "mydiff", "main");

      const loaded = fp.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.hash).toBe(hash);
      expect(loaded!.files).toEqual(["a.ts", "b.ts"]);
      expect(loaded!.diffLength).toBe("mydiff".length);
      expect(loaded!.branch).toBe("main");
      expect(loaded!.timestamp).toBeTruthy();
    });

    it("returns null when nothing has been saved", () => {
      expect(fp.load()).toBeNull();
    });
  });

  describe("checkForChanges", () => {
    it("returns changed=true when no prior fingerprint exists", async () => {
      const result = await fp.checkForChanges(["file.ts"], "diff", "main");
      expect(result.changed).toBe(true);
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.previousHash).toBeUndefined();
    });

    it("returns changed=false when fingerprint matches", async () => {
      const hash = fp.generate(["file.ts"], "diff", "main");
      fp.save(hash, ["file.ts"], "diff", "main");

      const result = await fp.checkForChanges(["file.ts"], "diff", "main");
      expect(result.changed).toBe(false);
      expect(result.hash).toBe(hash);
      expect(result.previousHash).toBe(hash);
    });
  });
});
