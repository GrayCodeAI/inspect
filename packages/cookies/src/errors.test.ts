import { describe, it, expect } from "vitest";
import {
  ExtractionError,
  RequiresFullDiskAccess,
  ListBrowsersError,
  CookieDatabaseNotFoundError,
  CookieDatabaseCopyError,
  CookieDecryptionKeyError,
  CookieReadError,
  BinaryParseError,
  CdpConnectionError,
  BrowserSpawnError,
  UnsupportedPlatformError,
  UnsupportedBrowserError,
  UnknownError,
} from "./errors.js";

describe("Cookie Extraction Errors", () => {
  describe("ExtractionError", () => {
    it("should have correct _tag", () => {
      const error = new ExtractionError({ reason: "browser not found" });
      expect(error._tag).toBe("ExtractionError");
    });

    it("should have descriptive message", () => {
      const error = new ExtractionError({ reason: "browser not found" });
      expect(error.message).toContain("browser not found");
    });
  });

  describe("RequiresFullDiskAccess", () => {
    it("should have correct _tag", () => {
      const error = new RequiresFullDiskAccess({});
      expect(error._tag).toBe("RequiresFullDiskAccess");
    });

    it("should have message about Full Disk Access", () => {
      const error = new RequiresFullDiskAccess({});
      expect(error.message).toContain("Full Disk Access");
    });
  });

  describe("ListBrowsersError", () => {
    it("should have correct _tag", () => {
      const error = new ListBrowsersError({ cause: "permission denied" });
      expect(error._tag).toBe("ListBrowsersError");
    });

    it("should include cause in message", () => {
      const error = new ListBrowsersError({ cause: "permission denied" });
      expect(error.message).toContain("permission denied");
    });
  });

  describe("CookieDatabaseNotFoundError", () => {
    it("should have correct _tag", () => {
      const error = new CookieDatabaseNotFoundError({ path: "/some/path" });
      expect(error._tag).toBe("CookieDatabaseNotFoundError");
    });

    it("should include path in message", () => {
      const error = new CookieDatabaseNotFoundError({ path: "/some/path" });
      expect(error.message).toContain("/some/path");
    });
  });

  describe("CookieDatabaseCopyError", () => {
    it("should have correct _tag", () => {
      const error = new CookieDatabaseCopyError({ cause: "disk full" });
      expect(error._tag).toBe("CookieDatabaseCopyError");
    });
  });

  describe("CookieDecryptionKeyError", () => {
    it("should have correct _tag", () => {
      const error = new CookieDecryptionKeyError({ cause: "keychain error" });
      expect(error._tag).toBe("CookieDecryptionKeyError");
    });
  });

  describe("CookieReadError", () => {
    it("should have correct _tag", () => {
      const error = new CookieReadError({ path: "/db.sqlite", cause: "locked" });
      expect(error._tag).toBe("CookieReadError");
    });

    it("should include path and cause in message", () => {
      const error = new CookieReadError({ path: "/db.sqlite", cause: "locked" });
      expect(error.message).toContain("/db.sqlite");
      expect(error.message).toContain("locked");
    });
  });

  describe("BinaryParseError", () => {
    it("should have correct _tag", () => {
      const error = new BinaryParseError({ cause: "invalid format" });
      expect(error._tag).toBe("BinaryParseError");
    });
  });

  describe("CdpConnectionError", () => {
    it("should have correct _tag", () => {
      const error = new CdpConnectionError({ cause: "connection refused" });
      expect(error._tag).toBe("CdpConnectionError");
    });
  });

  describe("BrowserSpawnError", () => {
    it("should have correct _tag", () => {
      const error = new BrowserSpawnError({ cause: "executable not found" });
      expect(error._tag).toBe("BrowserSpawnError");
    });
  });

  describe("UnsupportedPlatformError", () => {
    it("should have correct _tag", () => {
      const error = new UnsupportedPlatformError({ platform: "freebsd" });
      expect(error._tag).toBe("UnsupportedPlatformError");
    });

    it("should include platform in message", () => {
      const error = new UnsupportedPlatformError({ platform: "freebsd" });
      expect(error.message).toContain("freebsd");
    });
  });

  describe("UnsupportedBrowserError", () => {
    it("should have correct _tag", () => {
      const error = new UnsupportedBrowserError({ browser: "netscape" });
      expect(error._tag).toBe("UnsupportedBrowserError");
    });

    it("should include browser in message", () => {
      const error = new UnsupportedBrowserError({ browser: "netscape" });
      expect(error.message).toContain("netscape");
    });
  });

  describe("UnknownError", () => {
    it("should have correct _tag", () => {
      const error = new UnknownError({ cause: "something went wrong" });
      expect(error._tag).toBe("UnknownError");
    });
  });
});
