// ──────────────────────────────────────────────────────────────────────────────
// @inspect/data - Sitemap Parser
// ──────────────────────────────────────────────────────────────────────────────

/** Parsed sitemap entry */
export interface SitemapEntry {
  url: string;
  lastMod?: string;
  changeFreq?: string;
  priority?: number;
}

/**
 * Parse sitemap XML content.
 * Supports standard sitemaps and sitemap index files.
 */
export class SitemapParser {
  /**
   * Parse a sitemap XML string into entries.
   */
  static parse(xml: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];

    // Check if this is a sitemap index
    const indexEntries = xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi);
    for (const match of indexEntries) {
      const block = match[1];
      const locMatch = block.match(/<loc[^>]*>(.*?)<\/loc>/i);
      if (locMatch) {
        entries.push({ url: locMatch[1].trim() });
      }
    }

    // Parse individual URL entries
    const urlEntries = xml.matchAll(/<url>([\s\S]*?)<\/url>/gi);
    for (const match of urlEntries) {
      const block = match[1];
      const entry: SitemapEntry = { url: "" };

      const locMatch = block.match(/<loc[^>]*>(.*?)<\/loc>/i);
      if (locMatch) entry.url = locMatch[1].trim();

      const lastModMatch = block.match(/<lastmod[^>]*>(.*?)<\/lastmod>/i);
      if (lastModMatch) entry.lastMod = lastModMatch[1].trim();

      const changeFreqMatch = block.match(/<changefreq[^>]*>(.*?)<\/changefreq>/i);
      if (changeFreqMatch) entry.changeFreq = changeFreqMatch[1].trim();

      const priorityMatch = block.match(/<priority[^>]*>(.*?)<\/priority>/i);
      if (priorityMatch) entry.priority = parseFloat(priorityMatch[1].trim());

      if (entry.url) entries.push(entry);
    }

    return entries;
  }

  /**
   * Extract just URLs from a sitemap.
   */
  static extractUrls(xml: string): string[] {
    return this.parse(xml)
      .map((e) => e.url)
      .filter((url) => url.startsWith("http"));
  }
}
