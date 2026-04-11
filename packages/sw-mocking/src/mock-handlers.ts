// ──────────────────────────────────────────────────────────────────────────────
// Mock Handlers Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { SWMockingError } from "./errors.js";
import { MockRoute } from "./sw-generator.js";

export class MockRequest extends Schema.Class<MockRequest>("MockRequest")({
  url: Schema.String,
  method: Schema.String,
  headers: Schema.Record(Schema.String, Schema.String),
  body: Schema.optional(Schema.String),
}) {}

export class MockResponse extends Schema.Class<MockResponse>("MockResponse")({
  status: Schema.Number,
  body: Schema.String,
  headers: Schema.Record(Schema.String, Schema.String),
  delay: Schema.Number,
}) {}

export type RequestHandler = (
  request: MockRequest,
) => Effect.Effect<MockResponse | null, SWMockingError>;

export interface MockHandlersService {
  readonly addHandler: (
    pattern: string,
    handler: RequestHandler,
  ) => Effect.Effect<void>;
  readonly addRoute: (route: MockRoute) => Effect.Effect<void>;
  readonly match: (
    request: MockRequest,
  ) => Effect.Effect<MockResponse | null, SWMockingError>;
  readonly clear: () => Effect.Effect<void>;
  readonly getRoutes: Effect.Effect<MockRoute[]>;
}

export class MockHandlers extends ServiceMap.Service<
  MockHandlers,
  MockHandlersService
>()("@inspect/MockHandlers") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const routes: MockRoute[] = [];
      const customHandlers: Array<{ pattern: string; handler: RequestHandler }> = [];

      const addHandler = (pattern: string, handler: RequestHandler) =>
        Effect.sync(() => {
          customHandlers.push({ pattern, handler });
        }).pipe(
          Effect.tap(() =>
            Effect.logDebug("Custom mock handler added", { pattern }),
          ),
          Effect.withSpan("MockHandlers.addHandler"),
        );

      const addRoute = (route: MockRoute) =>
        Effect.sync(() => {
          routes.push(route);
        }).pipe(
          Effect.tap(() =>
            Effect.logDebug("Mock route added", {
              pattern: route.pattern,
              method: route.method,
            }),
          ),
          Effect.withSpan("MockHandlers.addRoute"),
        );

      const match = (request: MockRequest) =>
        Effect.gen(function* () {
          const url = new URL(request.url);

          for (const custom of customHandlers) {
            const regex = new RegExp(custom.pattern);
            if (regex.test(url.pathname)) {
              const response = yield* custom.handler(request);
              if (response) return response;
            }
          }

          for (const route of routes) {
            const regex = new RegExp(route.pattern);
            const matchesPath = regex.test(url.pathname);
            const matchesMethod =
              route.method === "ANY" || route.method === request.method;

            if (matchesPath && matchesMethod) {
              return new MockResponse({
                status: route.status,
                body: route.body ?? "",
                headers: route.headers ?? {},
                delay: route.delay,
              });
            }
          }

          return null;
        }).pipe(
          Effect.matchEffect({
            onSuccess: (result) => Effect.succeed(result),
            onFailure: (cause) =>
              Effect.fail(
                new SWMockingError({
                  message: `Failed to match request: ${String(cause)}`,
                  cause,
                }),
              ),
          }),
          Effect.withSpan("MockHandlers.match"),
        );

      const clear = () =>
        Effect.sync(() => {
          routes.length = 0;
          customHandlers.length = 0;
        }).pipe(
          Effect.tap(() => Effect.logInfo("All mock handlers cleared")),
          Effect.withSpan("MockHandlers.clear"),
        );

      const getRoutes = Effect.sync(() => [...routes]).pipe(
        Effect.withSpan("MockHandlers.getRoutes"),
      );

      return { addHandler, addRoute, match, clear, getRoutes } as const;
    }),
  );
}
