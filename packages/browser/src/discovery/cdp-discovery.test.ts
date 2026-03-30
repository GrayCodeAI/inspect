import { describe, it, expect } from "vitest";
import { probeCdpPort, getKnownBrowserProfiles } from "./cdp-discovery.js";

describe("CDP Discovery", () => {
  it("should return null for non-existent port", async () => {
    const result = await probeCdpPort("127.0.0.1", 19999);
    expect(result).toBeNull();
  });

  it("should return known browser profile paths", () => {
    const profiles = getKnownBrowserProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBeGreaterThan(0);
  });
});
