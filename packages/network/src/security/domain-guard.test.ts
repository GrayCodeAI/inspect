import { describe, it, expect } from "vitest";
import { DomainGuard } from "./domain-guard.js";

describe("DomainGuard", () => {
  it("allows all when no restrictions", () => {
    const guard = new DomainGuard();
    expect(guard.isAllowed("https://example.com")).toBe(true);
    expect(guard.isAllowed("https://google.com")).toBe(true);
  });

  it("restricts to allowed domains", () => {
    const guard = new DomainGuard({ allowedDomains: ["example.com"] });
    expect(guard.isAllowed("https://example.com/page")).toBe(true);
    expect(guard.isAllowed("https://other.com")).toBe(false);
  });

  it("supports wildcard domains", () => {
    const guard = new DomainGuard({ allowedDomains: ["*.example.com"] });
    expect(guard.isAllowed("https://sub.example.com")).toBe(true);
    expect(guard.isAllowed("https://deep.sub.example.com")).toBe(true);
    expect(guard.isAllowed("https://example.com")).toBe(true);
    expect(guard.isAllowed("https://other.com")).toBe(false);
  });

  it("blocks specific domains", () => {
    const guard = new DomainGuard({ blockedDomains: ["evil.com"] });
    expect(guard.isAllowed("https://example.com")).toBe(true);
    expect(guard.isAllowed("https://evil.com")).toBe(false);
  });

  it("blocked takes precedence over allowed", () => {
    const guard = new DomainGuard({
      allowedDomains: ["*.example.com"],
      blockedDomains: ["evil.example.com"],
    });
    expect(guard.isAllowed("https://good.example.com")).toBe(true);
    expect(guard.isAllowed("https://evil.example.com")).toBe(false);
  });

  it("blocks trackers by default", () => {
    const guard = new DomainGuard({ blockTrackers: true });
    expect(guard.isAllowed("https://google-analytics.com/collect")).toBe(false);
    expect(guard.isAllowed("https://facebook.net/pixel")).toBe(false);
    expect(guard.isAllowed("https://example.com")).toBe(true);
  });

  it("logs blocked requests", () => {
    const guard = new DomainGuard({ allowedDomains: ["example.com"], logBlocked: true });
    guard.isAllowed("https://blocked.com/page");
    expect(guard.blockedCount).toBe(1);
    expect(guard.getBlocked()[0].domain).toBe("blocked.com");
  });

  it("allows adding domains at runtime", () => {
    const guard = new DomainGuard({ allowedDomains: ["example.com"] });
    expect(guard.isAllowed("https://new.com")).toBe(false);
    guard.allow("new.com");
    expect(guard.isAllowed("https://new.com")).toBe(true);
  });

  it("handles invalid URLs gracefully", () => {
    const guard = new DomainGuard();
    expect(guard.isAllowed("not-a-url")).toBe(false);
  });
});
