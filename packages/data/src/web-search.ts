// ──────────────────────────────────────────────────────────────────────────────
// WebSearch — Real-time internet research for agent context augmentation
// Supports multiple search providers (Google, DuckDuckGo, Tavily, SerpAPI)
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from "node:fs";
import * as path from "node:path";

export type SearchProvider = "duckduckgo" | "tavily" | "google" | "serpapi" | "brave";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface WebSearchConfig {
  provider: SearchProvider;
  apiKey?: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeDomains?: string[];
  excludeDomains?: string[];
}

export class WebSearchEngine {
  private config: WebSearchConfig;

  constructor(config?: Partial<WebSearchConfig>) {
    this.config = {
      provider: config?.provider ?? "duckduckgo",
      apiKey: config?.apiKey,
      maxResults: config?.maxResults ?? 10,
      searchDepth: config?.searchDepth ?? "basic",
      includeDomains: config?.includeDomains,
      excludeDomains: config?.excludeDomains,
    };
  }

  /** Search the web and return ranked results. */
  async search(query: string): Promise<SearchResult[]> {
    switch (this.config.provider) {
      case "duckduckgo":
        return this.searchDuckDuckGo(query);
      case "tavily":
        return this.searchTavily(query);
      case "google":
        return this.searchGoogle(query);
      case "serpapi":
        return this.searchSerpAPI(query);
      case "brave":
        return this.searchBrave(query);
      default:
        return this.searchDuckDuckGo(query);
    }
  }

  /** Search and scrape content from top results for deep context. */
  async searchAndExtract(
    query: string,
    maxPages = 3,
  ): Promise<{ query: string; summaries: Array<{ url: string; content: string }> }> {
    const results = await this.search(query);
    const summaries: Array<{ url: string; content: string }> = [];

    for (const result of results.slice(0, maxPages)) {
      try {
        const content = await this.scrapeUrl(result.url);
        summaries.push({ url: result.url, content });
      } catch {
        // Skip pages that fail to scrape
      }
    }

    return { query, summaries };
  }

  /** Scrape a single URL and extract readable text content. */
  async scrapeUrl(url: string): Promise<string> {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    return this.htmlToText(html);
  }

  private async searchDuckDuckGo(query: string): Promise<SearchResult[]> {
    const html = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.text());

    const results: SearchResult[] = [];
    const linkRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const urlRegex = /href="([^"]*?)" class="result__snippet"/g;
    const titleRegex = /class="result__a"[^>]*>([^<]*)<\/a>/g;

    let match;
    while ((match = titleRegex.exec(html)) !== null && results.length < this.config.maxResults!) {
      const title = match[1].replace(/<[^>]*>/g, "").trim();
      results.push({
        title,
        url: "",
        snippet: "",
      });
    }

    // If regex parsing yielded no results, return a placeholder
    if (results.length === 0) {
      return [
        {
          title: `Search results for "${query}"`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          snippet:
            "DuckDuckGo HTML search requires direct browsing. Use a paid provider (Tavily/Google) for programmatic results.",
        },
      ];
    }

    return results;
  }

  private async searchTavily(query: string): Promise<SearchResult[]> {
    if (!this.config.apiKey) {
      return this.searchDuckDuckGo(query);
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        query,
        max_results: this.config.maxResults,
        search_depth: this.config.searchDepth,
        include_domains: this.config.includeDomains,
        exclude_domains: this.config.excludeDomains,
      }),
    });

    const data = (await response.json()) as {
      results: Array<{ title: string; url: string; content: string; score?: number }>;
    };
    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
    }));
  }

  private async searchGoogle(query: string): Promise<SearchResult[]> {
    if (!this.config.apiKey) {
      return this.searchDuckDuckGo(query);
    }

    const cx = process.env.GOOGLE_SEARCH_ENGINE_ID ?? "";
    const url = `https://www.googleapis.com/customsearch/v1?key=${this.config.apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${this.config.maxResults}`;
    const response = await fetch(url);
    const data = (await response.json()) as {
      items?: Array<{ title: string; link: string; snippet: string }>;
    };

    return (data.items ?? []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));
  }

  private async searchSerpAPI(query: string): Promise<SearchResult[]> {
    if (!this.config.apiKey) {
      return this.searchDuckDuckGo(query);
    }

    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${this.config.apiKey}&num=${this.config.maxResults}`;
    const response = await fetch(url);
    const data = (await response.json()) as {
      organic_results?: Array<{ title: string; link: string; snippet: string }>;
    };

    return (data.organic_results ?? []).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));
  }

  private async searchBrave(query: string): Promise<SearchResult[]> {
    if (!this.config.apiKey) {
      return this.searchDuckDuckGo(query);
    }

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${this.config.maxResults}`,
      { headers: { Accept: "application/json", "X-Subscription-Token": this.config.apiKey } },
    );
    const data = (await response.json()) as {
      web?: { results: Array<{ title: string; url: string; description: string }> };
    };

    return (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10000);
  }
}
