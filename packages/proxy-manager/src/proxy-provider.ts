import { Config, Effect, Layer, ServiceMap } from "effect";
import { ProxyPool } from "./proxy-pool.js";
import type { ProxyServer } from "./proxy-pool.js";
import { ProxyProviderError } from "./errors.js";

const _listProviderConfig = Config.all({
  proxies: Config.string("PROXY_LIST"),
  delimiter: Config.withDefault(Config.string("PROXY_DELIMITER"), "\n"),
});

export type ListProviderConfig = Config.Success<typeof _listProviderConfig>;

const _brightDataConfig = Config.all({
  apiKey: Config.string("BRIGHTDATA_API_KEY"),
  zone: Config.string("BRIGHTDATA_ZONE"),
  endpoint: Config.withDefault(
    Config.string("BRIGHTDATA_ENDPOINT"),
    "https://brightdata.com/api/proxy",
  ),
});

export type BrightDataConfig = Config.Success<typeof _brightDataConfig>;

const _oxylabsConfig = Config.all({
  username: Config.string("OXYLABS_USERNAME"),
  password: Config.string("OXYLABS_PASSWORD"),
  endpoint: Config.withDefault(Config.string("OXYLABS_ENDPOINT"), "https://oxylabs.io/api/proxy"),
});

export type OxylabsConfig = Config.Success<typeof _oxylabsConfig>;

const _scraperAPIConfig = Config.all({
  apiKey: Config.string("SCRAPERAPI_API_KEY"),
  endpoint: Config.withDefault(Config.string("SCRAPERAPI_ENDPOINT"), "https://api.scraperapi.com"),
});

export type ScraperAPIConfig = Config.Success<typeof _scraperAPIConfig>;

export type ProxyProviderConfig =
  | ListProviderConfig
  | BrightDataConfig
  | OxylabsConfig
  | ScraperAPIConfig;

export class ProxyProvider extends ServiceMap.Service<ProxyProvider>()(
  "@proxy-manager/ProxyProvider",
  {
    make: Effect.gen(function* () {
      const pool = yield* ProxyPool;

      const loadFromList = Effect.fn("ProxyProvider.loadFromList")(function* (
        config: ListProviderConfig,
      ) {
        const proxyLines = config.proxies.split(config.delimiter);
        const proxies: ProxyServer[] = [];

        for (const line of proxyLines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;

          const proxy = parseProxyUrl(trimmed);
          if (proxy) {
            proxies.push(proxy);
          }
        }

        yield* pool.addMany(proxies);

        return yield* Effect.logInfo("Loaded proxies from list", {
          count: proxies.length,
        });
      });

      const loadFromBrightData = Effect.fn("ProxyProvider.loadFromBrightData")(function* (
        _config: BrightDataConfig,
      ) {
        return yield* new ProxyProviderError({
          provider: "brightdata",
          cause: "BrightData API integration not yet implemented",
        });
      });

      const loadFromOxylabs = Effect.fn("ProxyProvider.loadFromOxylabs")(function* (
        _config: OxylabsConfig,
      ) {
        return yield* new ProxyProviderError({
          provider: "oxylabs",
          cause: "Oxylabs API integration not yet implemented",
        });
      });

      const loadFromScraperAPI = Effect.fn("ProxyProvider.loadFromScraperAPI")(function* (
        _config: ScraperAPIConfig,
      ) {
        return yield* new ProxyProviderError({
          provider: "scraperapi",
          cause: "ScraperAPI integration not yet implemented",
        });
      });

      return {
        loadFromList,
        loadFromBrightData,
        loadFromOxylabs,
        loadFromScraperAPI,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make).pipe(Layer.provideMerge(ProxyPool.layer));
}

function parseProxyUrl(url: string): ProxyServer | undefined {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(":", "") as ProxyServer["protocol"];

    if (!["http", "https", "socks4", "socks5"].includes(protocol)) {
      return undefined;
    }

    return {
      url,
      protocol: protocol as ProxyServer["protocol"],
      host: parsed.hostname,
      port: parseInt(parsed.port, 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
    };
  } catch {
    return undefined;
  }
}
