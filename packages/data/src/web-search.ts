// ──────────────────────────────────────────────────────────────────────────────
// WebSearch — Real-time internet research for agent context augmentation
// Supports multiple search providers (Google, DuckDuckGo, Tavily, SerpAPI)
// ──────────────────────────────────────────────────────────────────────────────

import { Config, Effect, Layer, Option, Schema, ServiceMap } from "effect";

export const SearchProvider = Schema.Literal("duckduckgo", "tavily", "google", "serpapi", "brave");
export type SearchProvider = typeof SearchProvider.Type;

export class SearchResult extends Schema.Class<SearchResult>("SearchResult")({
  title: Schema.String,
  url: Schema.String,
  snippet: Schema.String,
  score: Schema.optional(Schema.Number),
}) {}

export class WebSearchConfig extends Schema.Class<WebSearchConfig>("WebSearchConfig")({
  provider: SearchProvider,
  apiKey: Schema.optional(Schema.String),
  maxResults: Schema.optional(Schema.Number),
  searchDepth: Schema.optional(Schema.Literal("basic", "advanced")),
  includeDomains: Schema.optional(Schema.Array(Schema.String)),
  excludeDomains: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class SearchError extends Schema.ErrorClass<SearchError>("SearchError")({
  _tag: Schema.tag("SearchError"),
  provider: Schema.String,
  message: Schema.String,
}) {
  message = this.message;
}

export class ScrapingError extends Schema.ErrorClass<ScrapingError>("ScrapingError")({
  _tag: Schema.tag("ScrapingError"),
  url: Schema.String,
  message: Schema.String,
}) {
  message = this.message;
}

const DEFAULT_MAX_RESULTS = 10;
const FETCH_TIMEOUT_MS = 10000;
const SCRAPE_TIMEOUT_MS = 15000;

/** Search the web and return ranked results. */
const search = (query: string, config: WebSearchConfig) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ provider: config.provider, query });

    const results = yield* Effect.gen(function* () {
      switch (config.provider) {
        case "duckduckgo":
          return yield* searchDuckDuckGo(query, config);
        case "tavily":
          return yield* searchTavily(query, config);
        case "google":
          return yield* searchGoogle(query, config);
        case "serpapi":
          return yield* searchSerpAPI(query, config);
        case "brave":
          return yield* searchBrave(query, config);
        default:
          return yield* searchDuckDuckGo(query, config);
      }
    }).pipe(
      Effect.withSpan("WebSearch.search", {
        attributes: { provider: config.provider },
      }),
    );

    yield* Effect.logInfo("Web search completed", {
      provider: config.provider,
      resultCount: results.length,
    });

    return results;
  });

/** Search and scrape content from top results for deep context. */
const searchAndExtract = (query: string, config: WebSearchConfig, maxPages = 3) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ query, maxPages });

    const results = yield* search(query, config);
    const summaries: Array<{ url: string; content: string }> = [];

    for (const result of results.slice(0, maxPages)) {
      const content = yield* scrapeUrl(result.url).pipe(
        Effect.matchEffect({
          onSuccess: (content) => Effect.succeed({ url: result.url, content }),
          onFailure: () => Effect.succeed(Option.none<{ url: string; content: string }>()),
        }),
      );

      if (Option.isSome(content)) {
        summaries.push(content.value);
      }
    }

    yield* Effect.logInfo("Search and extract completed", {
      query,
      pagesScraped: summaries.length,
    });

    return { query, summaries };
  });

/** Scrape a single URL and extract readable text content. */
const scrapeUrl = (url: string) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ url });

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
        }),
      catch: (cause) =>
        new ScrapingError({
          url,
          message: `Failed to fetch: ${String(cause)}`,
        }),
    });

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) =>
        new ScrapingError({
          url,
          message: `Failed to read response: ${String(cause)}`,
        }),
    });

    const text = htmlToText(html);

    yield* Effect.logDebug("URL scraped", { url, contentLength: text.length });

    return text;
  }).pipe(Effect.withSpan("WebSearch.scrapeUrl"));

/** Search using DuckDuckGo HTML interface. */
const searchDuckDuckGo = (query: string, config: WebSearchConfig) =>
  Effect.gen(function* () {
    const maxResults = config.maxResults ?? DEFAULT_MAX_RESULTS;

    const html = yield* Effect.tryPromise({
      try: () =>
        fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).then((r) => r.text()),
      catch: (cause) =>
        new SearchError({
          provider: "duckduckgo",
          message: `Search failed: ${String(cause)}`,
        }),
    });

    const results: SearchResult[] = [];
    const titleRegex = /class="result__a"[^>]*>([^<]*)<\/a>/g;

    let match;
    while ((match = titleRegex.exec(html)) !== null && results.length < maxResults) {
      const title = match[1].replace(/<[^>]*>/g, "").trim();
      results.push(
        new SearchResult({
          title,
          url: "",
          snippet: "",
        }),
      );
    }

    if (results.length === 0) {
      return [
        new SearchResult({
          title: `Search results for "${query}"`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          snippet:
            "DuckDuckGo HTML search requires direct browsing. Use a paid provider (Tavily/Google) for programmatic results.",
        }),
      ];
    }

    return results;
  });

/** Search using Tavily API. */
const searchTavily = (query: string, config: WebSearchConfig) =>
  Effect.gen(function* () {
    if (!config.apiKey) {
      return yield* searchDuckDuckGo(query, config);
    }

    const maxResults = config.maxResults ?? DEFAULT_MAX_RESULTS;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: config.apiKey,
            query,
            max_results: maxResults,
            search_depth: config.searchDepth ?? "basic",
            include_domains: config.includeDomains,
            exclude_domains: config.excludeDomains,
          }),
        }),
      catch: (cause) =>
        new SearchError({
          provider: "tavily",
          message: `API request failed: ${String(cause)}`,
        }),
    });

    const data = yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{
          results: Array<{ title: string; url: string; content: string; score?: number }>;
        }>,
      catch: (cause) =>
        new SearchError({
          provider: "tavily",
          message: `Failed to parse response: ${String(cause)}`,
        }),
    });

    return data.results.map(
      (r) =>
        new SearchResult({
          title: r.title,
          url: r.url,
          snippet: r.content,
          score: r.score,
        }),
    );
  });

/** Search using Google Custom Search API. */
const searchGoogle = (query: string, config: WebSearchConfig) =>
  Effect.gen(function* () {
    if (!config.apiKey) {
      return yield* searchDuckDuckGo(query, config);
    }

    const maxResults = config.maxResults ?? DEFAULT_MAX_RESULTS;

    const searchEngineId = yield* Config.string("GOOGLE_SEARCH_ENGINE_ID").pipe(
      Effect.orElseSucceed(() => ""),
    );

    const url = `https://www.googleapis.com/customsearch/v1?key=${config.apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${maxResults}`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (cause) =>
        new SearchError({
          provider: "google",
          message: `API request failed: ${String(cause)}`,
        }),
    });

    const data = yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{
          items?: Array<{ title: string; link: string; snippet: string }>;
        }>,
      catch: (cause) =>
        new SearchError({
          provider: "google",
          message: `Failed to parse response: ${String(cause)}`,
        }),
    });

    return (data.items ?? []).map(
      (item) =>
        new SearchResult({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
        }),
    );
  });

/** Search using SerpAPI. */
const searchSerpAPI = (query: string, config: WebSearchConfig) =>
  Effect.gen(function* () {
    if (!config.apiKey) {
      return yield* searchDuckDuckGo(query, config);
    }

    const maxResults = config.maxResults ?? DEFAULT_MAX_RESULTS;
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${config.apiKey}&num=${maxResults}`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (cause) =>
        new SearchError({
          provider: "serpapi",
          message: `API request failed: ${String(cause)}`,
        }),
    });

    const data = yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{
          organic_results?: Array<{ title: string; link: string; snippet: string }>;
        }>,
      catch: (cause) =>
        new SearchError({
          provider: "serpapi",
          message: `Failed to parse response: ${String(cause)}`,
        }),
    });

    return (data.organic_results ?? []).map(
      (r) =>
        new SearchResult({
          title: r.title,
          url: r.link,
          snippet: r.snippet,
        }),
    );
  });

/** Search using Brave Search API. */
const searchBrave = (query: string, config: WebSearchConfig) =>
  Effect.gen(function* () {
    if (!config.apiKey) {
      return yield* searchDuckDuckGo(query, config);
    }

    const maxResults = config.maxResults ?? DEFAULT_MAX_RESULTS;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
          {
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": config.apiKey!,
            },
          },
        ),
      catch: (cause) =>
        new SearchError({
          provider: "brave",
          message: `API request failed: ${String(cause)}`,
        }),
    });

    const data = yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{
          web?: { results: Array<{ title: string; url: string; description: string }> };
        }>,
      catch: (cause) =>
        new SearchError({
          provider: "brave",
          message: `Failed to parse response: ${String(cause)}`,
        }),
    });

    return (data.web?.results ?? []).map(
      (r) =>
        new SearchResult({
          title: r.title,
          url: r.url,
          snippet: r.description,
        }),
    );
  });

/** Convert HTML to plain text. */
const htmlToText = (html: string): string => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
};

/** WebSearchEngine service for dependency injection. */
export class WebSearchEngine extends ServiceMap.Service<WebSearchEngine>()(
  "@data/WebSearchEngine",
  {
    make: Effect.gen(function* () {
      return {
        search,
        searchAndExtract,
        scrapeUrl,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
