// ──────────────────────────────────────────────────────────────────────────────
// Service Worker Generator
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { SWMockingError } from "./errors.js";

export class MockRoute extends Schema.Class<MockRoute>("MockRoute")({
  pattern: Schema.String,
  method: Schema.Literals(["GET", "POST", "PUT", "DELETE", "PATCH", "ANY"] as const),
  status: Schema.Number,
  body: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  delay: Schema.Number,
}) {}

export class SwConfig extends Schema.Class<SwConfig>("SwConfig")({
  scope: Schema.String,
  cacheName: Schema.String,
  routes: Schema.Array(MockRoute),
  fallbackToNetwork: Schema.Boolean,
}) {}

export interface SwGeneratorService {
  readonly generate: (config: SwConfig) => Effect.Effect<string, SWMockingError>;
  readonly generateScript: (
    routes: readonly MockRoute[],
    scope?: string,
  ) => Effect.Effect<string, SWMockingError>;
}

export class SwGenerator extends ServiceMap.Service<SwGenerator, SwGeneratorService>()(
  "@inspect/SwGenerator",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const escapeString = (str: string): string =>
        str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");

      const generateScript = (routes: readonly MockRoute[], _scope = "/") =>
        Effect.sync(() => {
          const routesArray = routes
            .map(
              (route) => `{
        pattern: '${escapeString(route.pattern)}',
        method: '${route.method}',
        status: ${route.status},
        body: ${route.body ? `'${escapeString(route.body)}'` : "null"},
        headers: ${JSON.stringify(route.headers ?? {})},
        delay: ${route.delay}
      }`,
            )
            .join(",\n      ");

          return `/* eslint-disable */
// Auto-generated Service Worker for Mocking
const CACHE_NAME = 'sw-mock-cache';
const MOCK_ROUTES = [
      ${routesArray}
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== location.origin) return;

  const matchingRoute = MOCK_ROUTES.find((route) => {
    const regex = new RegExp(route.pattern);
    const matchesPath = regex.test(url.pathname);
    const matchesMethod = route.method === 'ANY' || route.method === request.method;
    return matchesPath && matchesMethod;
  });

  if (!matchingRoute) {
    ${"// Fallback to network"}
    return;
  }

  event.respondWith(
    new Promise((resolve) => {
      setTimeout(() => {
        const headers = new Headers(matchingRoute.headers);
        headers.set('X-Mocked', 'true');

        const response = new Response(matchingRoute.body, {
          status: matchingRoute.status,
          headers,
        });

        resolve(response);
      }, matchingRoute.delay);
    })
  );
});`;
        }).pipe(
          Effect.matchEffect({
            onSuccess: (result) => Effect.succeed(result),
            onFailure: (cause) =>
              Effect.fail(
                new SWMockingError({
                  message: `Failed to generate SW script: ${String(cause)}`,
                  cause,
                }),
              ),
          }),
          Effect.withSpan("SwGenerator.generateScript"),
        );

      const generate = (config: SwConfig) =>
        generateScript(config.routes, config.scope).pipe(Effect.withSpan("SwGenerator.generate"));

      return { generate, generateScript } as const;
    }),
  );
}
