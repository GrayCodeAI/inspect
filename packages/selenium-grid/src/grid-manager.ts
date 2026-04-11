import { Effect, Layer, Ref, Schedule, Schema, ServiceMap } from "effect";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import {
  GridError,
  HubConnectionError,
  NodeUnavailableError,
  SessionCreationError,
} from "./errors.js";
import type { NodeRegistry } from "./node-registry.js";

export interface GridCapabilities {
  browserName: string;
  browserVersion?: string;
  platformName?: string;
  [key: string]: unknown;
}

export interface GridSession {
  sessionId: string;
  nodeId: string;
  capabilities: GridCapabilities;
}

export class GridManager extends ServiceMap.Service<
  GridManager,
  {
    readonly getStatus: Effect.Effect<GridStatus, GridError | HubConnectionError>;
    readonly createSession: (
      capabilities: GridCapabilities,
    ) => Effect.Effect<GridSession, GridError | SessionCreationError | NodeUnavailableError>;
    readonly closeSession: (
      sessionId: string,
    ) => Effect.Effect<void, GridError>;
    readonly getNodeCount: Effect.Effect<number, GridError>;
    readonly getAvailableNodes: Effect.Effect<GridNode[], GridError>;
  }
>()("@inspect/selenium-grid/GridManager") {
  static make = Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const nodeRegistry = yield* NodeRegistry;
    const hubUrlRef = yield* Ref.make(DEFAULT_HUB_URL);
    const sessionCountRef = yield* Ref.make(0);

    const hubUrl = (url: string) => Ref.set(hubUrlRef, url);

    const getStatus = Effect.gen(function* () {
      const url = yield* Ref.get(hubUrlRef);
      const statusUrl = `${url}/status`;

      const response = yield* httpClient
        .get(statusUrl)
        .pipe(Effect.catchCause((cause) => new HubConnectionError({ hubUrl: url, cause })));

      const body = yield* response.json.pipe(
        Effect.catchCause((cause) => new GridError({ reason: "Failed to parse hub status", cause })),
      );

      const nodes = yield* nodeRegistry.listAll();
      const availableNodes = nodes.filter((node) => node.status === "available");

      const currentSessions = yield* sessionCountRef.pipe(Ref.get);

      return {
        hubUrl: url,
        totalNodes: nodes.length,
        availableNodes: availableNodes.length,
        activeSessions: currentSessions,
        status: availableNodes.length > 0 ? ("ready" as const) : ("degraded" as const),
      };
    });

    const createSession = (capabilities: GridCapabilities) =>
      Effect.gen(function* () {
        const url = yield* Ref.get(hubUrlRef);

        const matchingNode = yield* nodeRegistry
          .findByBrowser(capabilities.browserName)
          .pipe(
            Effect.catchTag("NoSuchElementError", () =>
              new NodeUnavailableError({
                nodeId: "unknown",
                browserName: capabilities.browserName,
              }).asEffect(),
            ),
          );

        const sessionResponse = yield* httpClient
          .execute(
            HttpClientRequest.post(`${url}/session`).pipe(
              HttpClientRequest.bodyJson({
                capabilities: {
                  alwaysMatch: capabilities,
                  firstMatch: [{}],
                },
              }),
            ),
          )
          .pipe(
            Effect.catchCause((cause) =>
              new SessionCreationError({ capabilities, cause }).asEffect(),
            ),
          );

        const responseBody = yield* sessionResponse.json.pipe(
          Effect.catchCause((cause) =>
            new SessionCreationError({ capabilities, cause }).asEffect(),
          ),
        );

        const sessionId = responseBody.value?.sessionId ?? responseBody.sessionId;

        if (!sessionId) {
          return yield* new SessionCreationError({
            capabilities,
            cause: "No sessionId in response",
          });
        }

        yield* Ref.update(sessionCountRef, (count) => count + 1);

        return {
          sessionId,
          nodeId: matchingNode.nodeId,
          capabilities,
        };
      }).pipe(
        Effect.withSpan("GridManager.createSession"),
        Effect.annotateCurrentSpan({ capabilities }),
      );

    const closeSession = (sessionId: string) =>
      Effect.gen(function* () {
        const url = yield* Ref.get(hubUrlRef);

        yield* httpClient
          .delete_(`${url}/session/${sessionId}`)
          .pipe(
            Effect.catchCause((cause) =>
              new GridError({ reason: `Failed to close session ${sessionId}`, cause }).asEffect(),
            ),
          );

        yield* Ref.update(sessionCountRef, (count) => Math.max(0, count - 1));
        yield* Effect.logDebug("Session closed", { sessionId });
      }).pipe(Effect.withSpan("GridManager.closeSession"));

    const getNodeCount = nodeRegistry.countAll();

    const getAvailableNodes = Effect.gen(function* () {
      const nodes = yield* nodeRegistry.listAll();
      return nodes.filter((node) => node.status === "available");
    });

    return {
      hubUrl,
      getStatus,
      createSession,
      closeSession,
      getNodeCount,
      getAvailableNodes,
    } as const;
  });

  static layer = Layer.effect(this, this.make).pipe(
    Layer.provide(NodeRegistry.layer),
    Layer.provide(HttpClient.layer),
  );
}

export interface GridStatus {
  hubUrl: string;
  totalNodes: number;
  availableNodes: number;
  activeSessions: number;
  status: "ready" | "degraded";
}

export interface GridNode {
  nodeId: string;
  uri: string;
  status: "available" | "busy" | "unavailable";
  browsers: string[];
  maxSessions: number;
  activeSessions: number;
}

const DEFAULT_HUB_URL = "http://localhost:4444";
