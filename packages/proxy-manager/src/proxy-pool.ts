import { Effect, Layer, Option, ServiceMap } from "effect";
import { ProxyHealthCheckError, ProxyPoolExhaustedError } from "./errors.js";

export interface ProxyServer {
  readonly url: string;
  readonly protocol: "http" | "https" | "socks4" | "socks5";
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
}

export interface ProxyHealth {
  readonly proxy: ProxyServer;
  readonly isHealthy: boolean;
  readonly latencyMs: number;
  readonly lastChecked: Date;
}

export interface ProxyPoolStats {
  readonly total: number;
  readonly healthy: number;
  readonly unhealthy: number;
  readonly available: number;
}

export class ProxyPool extends ServiceMap.Service<ProxyPool>()("@proxy-manager/ProxyPool", {
  make: Effect.gen(function* () {
    let proxies: Array<{ proxy: ProxyServer; health: Option.Option<ProxyHealth> }> = [];
    let currentIndex = 0;

    const add = Effect.fn("ProxyPool.add")(function* (proxy: ProxyServer) {
      proxies.push({ proxy, health: Option.none() });
      return yield* Effect.void;
    });

    const addMany = Effect.fn("ProxyPool.addMany")(function* (
      proxyList: ReadonlyArray<ProxyServer>,
    ) {
      for (const proxy of proxyList) {
        proxies.push({ proxy, health: Option.none() });
      }
      return yield* Effect.void;
    });

    const healthCheck = Effect.fn("ProxyPool.healthCheck")(function* (proxy: ProxyServer) {
      const startTime = Date.now();

      return yield* Effect.tryPromise({
        try: async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);

          try {
            await fetch(proxy.url, {
              method: "GET",
              signal: controller.signal,
            });
            clearTimeout(timeout);

            const latency = Date.now() - startTime;
            return {
              proxy,
              isHealthy: true,
              latencyMs: latency,
              lastChecked: new Date(),
            } satisfies ProxyHealth;
          } catch {
            clearTimeout(timeout);
            const latency = Date.now() - startTime;
            return {
              proxy,
              isHealthy: false,
              latencyMs: latency,
              lastChecked: new Date(),
            } satisfies ProxyHealth;
          }
        },
        catch: (cause: unknown) =>
          new ProxyHealthCheckError({
            proxyUrl: proxy.url,
            latency: Date.now() - startTime,
            cause,
          }),
      });
    });

    const checkAll = Effect.fn("ProxyPool.checkAll")(function* () {
      const results: ProxyHealth[] = [];

      for (const { proxy } of proxies) {
        try {
          const health = yield* healthCheck(proxy);
          results.push(health);
          const entry = proxies.find((p) => p.proxy.url === proxy.url);
          if (entry) {
            entry.health = Option.some(health);
          }
        } catch {
          const unhealthy: ProxyHealth = {
            proxy,
            isHealthy: false,
            latencyMs: -1,
            lastChecked: new Date(),
          };
          results.push(unhealthy);
          const entry = proxies.find((p) => p.proxy.url === proxy.url);
          if (entry) {
            entry.health = Option.some(unhealthy);
          }
        }
      }

      return results;
    });

    const getHealthy = Effect.fn("ProxyPool.getHealthy")(function* () {
      const healthyProxies = proxies.filter((entry) =>
        Option.match(entry.health, {
          onNone: () => true,
          onSome: (health: ProxyHealth) => health.isHealthy,
        }),
      );

      if (healthyProxies.length === 0) {
        return yield* new ProxyPoolExhaustedError({
          poolSize: proxies.length,
          failedAttempts: proxies.length,
        });
      }

      const randomIndex = Math.floor(Math.random() * healthyProxies.length);
      return healthyProxies[randomIndex].proxy;
    });

    const getNext = Effect.fn("ProxyPool.getNext")(function* () {
      if (proxies.length === 0) {
        return yield* new ProxyPoolExhaustedError({
          poolSize: 0,
          failedAttempts: 0,
        });
      }

      const proxy = proxies[currentIndex % proxies.length].proxy;
      currentIndex = (currentIndex + 1) % proxies.length;
      return proxy;
    });

    const markUnhealthy = Effect.fn("ProxyPool.markUnhealthy")(function* (
      proxyUrl: string,
      _cause: unknown,
    ) {
      const entry = proxies.find((p) => p.proxy.url === proxyUrl);
      if (entry) {
        entry.health = Option.some({
          proxy: entry.proxy,
          isHealthy: false,
          latencyMs: -1,
          lastChecked: new Date(),
        });
      }
      return yield* Effect.void;
    });

    const getStats = Effect.fn("ProxyPool.getStats")(function* () {
      let healthy = 0;
      let unhealthy = 0;

      for (const entry of proxies) {
        Option.match(entry.health, {
          onNone: () => healthy++,
          onSome: (h: ProxyHealth) => {
            if (h.isHealthy) healthy++;
            else unhealthy++;
          },
        });
      }

      return {
        total: proxies.length,
        healthy,
        unhealthy,
        available: healthy,
      } satisfies ProxyPoolStats;
    });

    const clear = Effect.fn("ProxyPool.clear")(function* () {
      proxies = [];
      currentIndex = 0;
      return yield* Effect.void;
    });

    const remove = Effect.fn("ProxyPool.remove")(function* (proxyUrl: string) {
      const index = proxies.findIndex((p) => p.proxy.url === proxyUrl);
      if (index !== -1) {
        proxies.splice(index, 1);
      }
      return yield* Effect.void;
    });

    return {
      add,
      addMany,
      healthCheck,
      checkAll,
      getHealthy,
      getNext,
      markUnhealthy,
      getStats,
      clear,
      remove,
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
