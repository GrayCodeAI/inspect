import { Effect, Layer, Option, Ref, Schema, ServiceMap } from "effect";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { GridError, NodeUnavailableError } from "./errors.js";
import type { GridNode } from "./grid-manager.js";

export interface NodeRegistration {
  nodeId: string;
  uri: string;
  browsers: string[];
  maxSessions: number;
}

export class NodeRegistry extends ServiceMap.Service<
  NodeRegistry,
  {
    readonly register: (
      registration: NodeRegistration,
    ) => Effect.Effect<void, GridError>;
    readonly unregister: (
      nodeId: string,
    ) => Effect.Effect<void, GridError>;
    readonly findByBrowser: (
      browserName: string,
    ) => Effect.Effect<GridNode, NodeUnavailableError>;
    readonly listAll: Effect.Effect<GridNode[], GridError>;
    readonly countAll: Effect.Effect<number, GridError>;
    readonly refreshFromHub: Effect.Effect<void, GridError>;
  }
>()("@inspect/selenium-grid/NodeRegistry") {
  static make = Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const nodesRef = yield* Ref.make<Map<string, GridNode>>(new Map());
    const hubUrlRef = yield* Ref.make(DEFAULT_HUB_URL);

    const register = (registration: NodeRegistration) =>
      Effect.gen(function* () {
        const node: GridNode = {
          nodeId: registration.nodeId,
          uri: registration.uri,
          status: "available",
          browsers: registration.browsers,
          maxSessions: registration.maxSessions,
          activeSessions: 0,
        };

        yield* Ref.update(nodesRef, (nodes) => {
          const updated = new Map(nodes);
          updated.set(registration.nodeId, node);
          return updated;
        });

        yield* Effect.logInfo("Node registered", {
          nodeId: registration.nodeId,
          browsers: registration.browsers,
        });
      }).pipe(Effect.withSpan("NodeRegistry.register"));

    const unregister = (nodeId: string) =>
      Effect.gen(function* () {
        yield* Ref.update(nodesRef, (nodes) => {
          const updated = new Map(nodes);
          updated.delete(nodeId);
          return updated;
        });

        yield* Effect.logDebug("Node unregistered", { nodeId });
      }).pipe(Effect.withSpan("NodeRegistry.unregister"));

    const findByBrowser = (browserName: string) =>
      Effect.gen(function* () {
        const nodes = yield* Ref.get(nodesRef);

        for (const node of nodes.values()) {
          if (
            node.status === "available" &&
            node.browsers.some((b) => b.toLowerCase() === browserName.toLowerCase())
          ) {
            return node;
          }
        }

        return yield* new NodeUnavailableError({
          nodeId: "unknown",
          browserName,
        });
      }).pipe(Effect.withSpan("NodeRegistry.findByBrowser"));

    const listAll = Effect.gen(function* () {
      const nodes = yield* Ref.get(nodesRef);
      return Array.from(nodes.values());
    });

    const countAll = Effect.gen(function* () {
      const nodes = yield* Ref.get(nodesRef);
      return nodes.size;
    });

    const refreshFromHub = Effect.gen(function* () {
      const hubUrl = yield* Ref.get(hubUrlRef);

      const response = yield* httpClient
        .get(`${hubUrl}/status`)
        .pipe(Effect.catchCause((cause) => new GridError({ reason: "Hub refresh failed", cause })));

      const body = yield* response.json.pipe(
        Effect.catchCause((cause) => new GridError({ reason: "Failed to parse hub status", cause })),
      );

      // Parse hub status and update registry
      const hubNodes = parseHubStatus(body);

      yield* Ref.set(
        nodesRef,
        new Map(hubNodes.map((node) => [node.nodeId, node])),
      );

      yield* Effect.logDebug("Node registry refreshed from hub", {
        nodeCount: hubNodes.length,
      });
    }).pipe(Effect.withSpan("NodeRegistry.refreshFromHub"));

    return {
      register,
      unregister,
      findByBrowser,
      listAll,
      countAll,
      refreshFromHub,
    } as const;
  });

  static layer = Layer.effect(this, this.make).pipe(Layer.provide(HttpClient.layer));
}

function parseHubStatus(body: unknown): GridNode[] {
  const nodes: GridNode[] = [];

  if (
    typeof body === "object" &&
    body !== null &&
    "value" in body &&
    typeof body.value === "object" &&
    body.value !== null &&
    "nodes" in body.value &&
    Array.isArray(body.value.nodes)
  ) {
    for (const nodeData of body.value.nodes) {
      if (typeof nodeData === "object" && nodeData !== null && "id" in nodeData) {
        const node: GridNode = {
          nodeId: String(nodeData.id),
          uri: String(nodeData.uri ?? ""),
          status: nodeData.stereotypes?.length > 0 ? ("available" as const) : ("unavailable" as const),
          browsers: extractBrowsers(nodeData),
          maxSessions: nodeData.maxSessionCount ?? 1,
          activeSessions: nodeData.sessionCount ?? 0,
        };
        nodes.push(node);
      }
    }
  }

  return nodes;
}

function extractBrowsers(nodeData: Record<string, unknown>): string[] {
  const browsers: string[] = [];

  if ("stereotypes" in nodeData && Array.isArray(nodeData.stereotypes)) {
    for (const stereotype of nodeData.stereotypes) {
      if (
        typeof stereotype === "object" &&
        stereotype !== null &&
        "capabilities" in stereotype &&
        typeof stereotype.capabilities === "string"
      ) {
        try {
          const caps = JSON.parse(stereotype.capabilities);
          if (caps.browserName) {
            browsers.push(caps.browserName);
          }
        } catch {
          // Skip malformed stereotypes
        }
      }
    }
  }

  return browsers;
}

const DEFAULT_HUB_URL = "http://localhost:4444";
