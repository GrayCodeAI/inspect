import { describe, it, expect } from "vitest";
import { SitemapParser } from "./sitemap.js";

describe("SitemapParser", () => {
  describe("parse", () => {
    it("should parse standard sitemap XML", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page1</loc>
    <lastmod>2024-01-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/page2</loc>
    <lastmod>2024-01-02</lastmod>
  </url>
</urlset>`;

      const entries = SitemapParser.parse(xml);
      expect(entries.length).toBe(2);
      expect(entries[0].url).toBe("https://example.com/page1");
      expect(entries[0].lastMod).toBe("2024-01-01");
      expect(entries[0].changeFreq).toBe("daily");
      expect(entries[0].priority).toBe(0.8);
      expect(entries[1].url).toBe("https://example.com/page2");
    });

    it("should parse sitemap index XML", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap2.xml</loc>
  </sitemap>
</sitemapindex>`;

      const entries = SitemapParser.parse(xml);
      expect(entries.length).toBe(2);
      expect(entries[0].url).toBe("https://example.com/sitemap1.xml");
      expect(entries[1].url).toBe("https://example.com/sitemap2.xml");
    });

    it("should return empty array for empty XML", () => {
      const entries = SitemapParser.parse("");
      expect(entries).toEqual([]);
    });

    it("should return empty array for invalid XML", () => {
      const entries = SitemapParser.parse("not xml at all");
      expect(entries).toEqual([]);
    });

    it("should handle URLs with special characters", () => {
      const xml = `<urlset>
        <url><loc>https://example.com/search?q=hello%20world</loc></url>
      </urlset>`;
      const entries = SitemapParser.parse(xml);
      expect(entries.length).toBe(1);
      expect(entries[0].url).toContain("hello%20world");
    });
  });

  describe("extractUrls", () => {
    it("should extract only URLs", () => {
      const xml = `<urlset>
        <url><loc>https://example.com/a</loc></url>
        <url><loc>https://example.com/b</loc></url>
      </urlset>`;
      const urls = SitemapParser.extractUrls(xml);
      expect(urls).toEqual(["https://example.com/a", "https://example.com/b"]);
    });

    it("should filter out non-HTTP URLs", () => {
      const xml = `<urlset>
        <url><loc>ftp://example.com/a</loc></url>
        <url><loc>https://example.com/b</loc></url>
      </urlset>`;
      const urls = SitemapParser.extractUrls(xml);
      expect(urls).toEqual(["https://example.com/b"]);
    });
  });
});
