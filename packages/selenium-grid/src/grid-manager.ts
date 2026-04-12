import { Effect, Layer, Ref, ServiceMap } from "effect";
import {
  GridError,
  HubConnectionError,
  NodeUnavailableError,
  SessionCreationError,
} from "./errors.js";
import { NodeRegistry } from "./node-registry.js";

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
    readonly closeSession: (sessionId: string) => Effect.Effect<void, GridError>;
    readonly getNodeCount: Effect.Effect<number, GridError>;
    readonly getAvailableNodes: Effect.Effect<GridNode[], GridError>;
  }
>()("@inspect/selenium-grid/GridManager") {
  static make = Effect.gen(function* () {
    const nodeRegistry = yield* NodeRegistry;
    const hubUrlRef = yield* Ref.make(DEFAULT_HUB_URL);
    const sessionCountRef = yield* Ref.make(0);
    const sessionsRef = yield* Ref.make<Map<string, GridSession>>(new Map());

    const hubUrl = (url: string) => Ref.set(hubUrlRef, url);

    const getStatus = Effect.gen(function* () {
      const url = yield* Ref.get(hubUrlRef);

      const nodes = yield* nodeRegistry.listAll;
      const availableNodes = nodes.filter((node: GridNode) => node.status === "available");

      const currentSessions = yield* Ref.get(sessionCountRef);

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
        const matchingNode = yield* nodeRegistry.findByBrowser(capabilities.browserName);

        const sessionId = `grid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        const session: GridSession = {
          sessionId,
          nodeId: matchingNode.nodeId,
          capabilities,
        };

        yield* Ref.update(sessionsRef, (sessions) => {
          const updated = new Map(sessions);
          updated.set(sessionId, session);
          return updated;
        });

        yield* Ref.update(sessionCountRef, (count) => count + 1);

        yield* Effect.logInfo("Grid session created", {
          sessionId,
          nodeId: matchingNode.nodeId,
        });

        return session;
      });

    const closeSession = (sessionId: string) =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        const session = sessions.get(sessionId);

        if (!session) {
          return yield* new GridError({
            reason: `Session not found: ${sessionId}`,
            cause: null,
          });
        }

        yield* Ref.update(sessionsRef, (s) => {
          const updated = new Map(s);
          updated.delete(sessionId);
          return updated;
        });

        yield* Ref.update(sessionCountRef, (count) => Math.max(0, count - 1));
        yield* Effect.logDebug("Session closed", { sessionId });
      });

    const getNodeCount = nodeRegistry.countAll;

    const getAvailableNodes = Effect.gen(function* () {
      const nodes = yield* nodeRegistry.listAll;
      return nodes.filter((node: GridNode) => node.status === "available");
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

  static layer = Layer.effect(this, this.make).pipe(Layer.provide(NodeRegistry.layer));
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
