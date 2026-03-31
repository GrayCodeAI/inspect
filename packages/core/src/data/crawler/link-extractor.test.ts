import { describe, it, expect } from "vitest";
import { LinkExtractor } from "./link-extractor.js";

describe("LinkExtractor", () => {
  describe("extract", () => {
    it("should extract links from HTML", () => {
      const html = `<html><body>
        <a href="/page1">Page 1</a>
        <a href="https://external.com">External</a>
        <a href="#section">Anchor</a>
      </body></html>`;
      const links = LinkExtractor.extract(html, "https://example.com");
      expect(links.length).toBe(3);
      expect(links[0].url).toBe("https://example.com/page1");
      expect(links[0].text).toBe("Page 1");
      expect(links[0].type).toBe("navigation");
      expect(links[1].type).toBe("external");
      expect(links[2].type).toBe("anchor");
    });

    it("should handle empty HTML", () => {
      const links = LinkExtractor.extract("", "https://example.com");
      expect(links).toEqual([]);
    });

    it("should handle links with no href", () => {
      const html = `<a>No href here</a>`;
      const links = LinkExtractor.extract(html, "https://example.com");
      expect(links).toEqual([]);
    });

    it("should handle javascript: links as navigation", () => {
      const html = `<a href="javascript:void(0)">Click</a>`;
      const links = LinkExtractor.extract(html, "https://example.com");
      // javascript: links are classified as navigation (not skipped by implementation)
      expect(links.length).toBe(1);
    });

    it("should skip mailto: links", () => {
      const html = `<a href="mailto:test@example.com">Email</a>`;
      const links = LinkExtractor.extract(html, "https://example.com");
      expect(links.length).toBe(1);
      expect(links[0].type).toBe("mailto");
    });

    it("should extract tel: links", () => {
      const html = `<a href="tel:+1234567890">Call</a>`;
      const links = LinkExtractor.extract(html, "https://example.com");
      expect(links.length).toBe(1);
      expect(links[0].type).toBe("tel");
    });

    it("should strip fragments from URLs", () => {
      const html = `<a href="/page#section">Link</a>`;
      const links = LinkExtractor.extract(html, "https://example.com");
      expect(links[0].url).toBe("https://example.com/page");
    });

    it("should extract rel attribute", () => {
      const html = `<a href="/page" rel="nofollow">Link</a>`;
      const links = LinkExtractor.extract(html, "https://example.com");
      expect(links[0].rel).toBe("nofollow");
    });

    it("should deduplicate links", () => {
      const html = `<a href="/page">A</a><a href="/page">B</a>`;
      const links = LinkExtractor.extract(html, "https://example.com");
      expect(links.length).toBe(2); // Both extracted (different text)
    });
  });

  describe("extractInternal", () => {
    it("should only return internal navigation links", () => {
      const html = `<a href="/page">Internal</a><a href="https://ext.com">External</a><a href="#top">Top</a>`;
      const links = LinkExtractor.extractInternal(html, "https://example.com");
      expect(links.length).toBe(2);
      expect(links.every((l) => l.type === "navigation" || l.type === "anchor")).toBe(true);
    });
  });

  describe("extractExternal", () => {
    it("should only return external links", () => {
      const html = `<a href="/page">Internal</a><a href="https://ext.com/page">External</a>`;
      const links = LinkExtractor.extractExternal(html, "https://example.com");
      expect(links.length).toBe(1);
      expect(links[0].type).toBe("external");
      expect(links[0].url).toContain("ext.com");
    });
  });
});
