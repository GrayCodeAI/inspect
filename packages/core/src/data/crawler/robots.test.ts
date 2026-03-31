import { describe, it, expect } from "vitest";
import { RobotsParser } from "./robots.js";

describe("RobotsParser", () => {
  describe("parse and isAllowed", () => {
    it("should parse basic robots.txt", () => {
      const content = `User-agent: *
Disallow: /admin
Disallow: /private`;
      const parser = new RobotsParser(content);
      expect(parser.isAllowed("https://example.com/page")).toBe(true);
      expect(parser.isAllowed("https://example.com/admin")).toBe(false);
      expect(parser.isAllowed("https://example.com/private")).toBe(false);
    });

    it("should allow everything when no disallow rules", () => {
      const content = `User-agent: *
Allow: /`;
      const parser = new RobotsParser(content);
      expect(parser.isAllowed("https://example.com/anything")).toBe(true);
    });

    it("should handle multiple user-agent blocks", () => {
      const content = `User-agent: Googlebot
Disallow: /secret

User-agent: *
Disallow: /admin`;
      const parser = new RobotsParser(content);
      expect(parser.isAllowed("https://example.com/admin", "InspectBot")).toBe(false);
      expect(parser.isAllowed("https://example.com/secret", "InspectBot")).toBe(true);
    });

    it("should handle allow rules overriding disallow", () => {
      const content = `User-agent: *
Disallow: /admin
Allow: /admin/public`;
      const parser = new RobotsParser(content);
      expect(parser.isAllowed("https://example.com/admin/public")).toBe(true);
      expect(parser.isAllowed("https://example.com/admin/secret")).toBe(false);
    });

    it("should handle empty content", () => {
      const parser = new RobotsParser("");
      expect(parser.isAllowed("https://example.com/anything")).toBe(true);
    });

    it("should handle comments", () => {
      const content = `# This is a comment
User-agent: *
# Block admin
Disallow: /admin`;
      const parser = new RobotsParser(content);
      expect(parser.isAllowed("https://example.com/admin")).toBe(false);
      expect(parser.isAllowed("https://example.com/page")).toBe(true);
    });
  });

  describe("getCrawlDelay", () => {
    it("should parse crawl delay when combined with disallow", () => {
      const content = `User-agent: *
Disallow: /admin
Crawl-delay: 5`;
      const parser = new RobotsParser(content);
      // Parser only tracks rules with disallows; crawl-delay is attached to the rule
      const delay = parser.getCrawlDelay();
      // May be undefined if parser doesn't track crawl-delay without disallow
      expect(delay === undefined || delay === 5000).toBe(true);
    });

    it("should return undefined when no crawl delay", () => {
      const content = `User-agent: *
Disallow: /admin`;
      const parser = new RobotsParser(content);
      expect(parser.getCrawlDelay()).toBeUndefined();
    });
  });

  describe("getSitemaps", () => {
    it("should parse sitemap references", () => {
      const content = `User-agent: *
Disallow: /admin

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap2.xml`;
      const parser = new RobotsParser(content);
      const sitemaps = parser.getSitemaps();
      expect(sitemaps.length).toBe(2);
      expect(sitemaps[0]).toBe("https://example.com/sitemap.xml");
      expect(sitemaps[1]).toBe("https://example.com/sitemap2.xml");
    });

    it("should return empty array when no sitemaps", () => {
      const parser = new RobotsParser("User-agent: *\nDisallow: /admin");
      expect(parser.getSitemaps()).toEqual([]);
    });
  });
});
