// ──────────────────────────────────────────────────────────────────────────────
// @inspect/data - Link Extractor
// ──────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@inspect/observability";

const logger = createLogger("data/link-extractor");

/** Extracted link info */
export interface ExtractedLink {
  url: string;
  text: string;
  rel?: string;
  type: "navigation" | "resource" | "external" | "anchor" | "mailto" | "tel";
}

/**
 * Extract links from HTML content with classification.
 */
export class LinkExtractor {
  /**
   * Extract all links from HTML content.
   */
  static extract(html: string, baseUrl: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const hrefMatches = html.matchAll(/<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi);

    for (const match of hrefMatches) {
      const attrs = match[1];
      const innerText = match[2].replace(/<[^>]+>/g, "").trim();

      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) continue;

      const href = hrefMatch[1];
      const relMatch = attrs.match(/rel\s*=\s*["']([^"']+)["']/i);
      const rel = relMatch ? relMatch[1] : undefined;

      const linkType = LinkExtractor.classifyLink(href);

      let resolvedUrl: string;
      try {
        if (linkType === "anchor" || linkType === "mailto" || linkType === "tel") {
          resolvedUrl = href;
        } else {
          resolvedUrl = new URL(href, baseUrl).href.split("#")[0];
        }
      } catch (error) {
        logger.debug("Failed to resolve URL, skipping link", { href, baseUrl, error });
        continue;
      }

      links.push({
        url: resolvedUrl,
        text: innerText.slice(0, 200),
        rel,
        type: linkType,
      });
    }

    return links;
  }

  /**
   * Extract only internal navigation links.
   */
  static extractInternal(html: string, baseUrl: string): ExtractedLink[] {
    return this.extract(html, baseUrl).filter(
      (l) => l.type === "navigation" || l.type === "anchor",
    );
  }

  /**
   * Extract only external links.
   */
  static extractExternal(html: string, baseUrl: string): ExtractedLink[] {
    return this.extract(html, baseUrl).filter((l) => l.type === "external");
  }

  private static classifyLink(href: string): ExtractedLink["type"] {
    if (href.startsWith("#")) return "anchor";
    if (href.startsWith("mailto:")) return "mailto";
    if (href.startsWith("tel:")) return "tel";
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return "external";
    }
    return "navigation";
  }
}
