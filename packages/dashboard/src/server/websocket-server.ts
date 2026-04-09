// ──────────────────────────────────────────────────────────────────────────────
// @inspect/dashboard - WebSocket Server
// Real-time communication for test execution updates
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, ServiceMap, PubSub, Ref, Option } from "effect";
import type { DashboardMessage, TestExecution } from "../types/index.js";
import { DEFAULT_DASHBOARD_CONFIG } from "../types/index.js";

// Type imports for ws (will be resolved at runtime)
interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: "message", handler: (data: { toString(): string }) => void): void;
  on(event: "close", handler: () => void): void;
  on(event: "error", handler: (error: Error) => void): void;
}

interface WebSocketServerLike {
  on(
    event: "connection",
    handler: (ws: WebSocketLike, req: { socket: { remoteAddress?: string } }) => void,
  ): void;
  close(callback?: () => void): void;
}

/** Client connection metadata */
interface ClientConnection {
  id: string;
  ws: WebSocketLike;
  subscribedSessions: Set<string>;
  connectedAt: number;
}

/** WebSocket server service */
export class DashboardWebSocketServer extends ServiceMap.Service<DashboardWebSocketServer>()(
  "@inspect/dashboard/WebSocketServer",
  {
    make: Effect.gen(function* () {
      const config = DEFAULT_DASHBOARD_CONFIG;
      const clientsRef = yield* Ref.make<Map<string, ClientConnection>>(new Map());
      const messagePubSub = yield* PubSub.unbounded<DashboardMessage>();
      const testHistoryRef = yield* Ref.make<Map<string, TestExecution>>(new Map());

      let wss: WebSocketServerLike | null = null;

      const generateClientId = (): string =>
        `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const broadcast = (message: DashboardMessage, sessionId?: string) =>
        Effect.gen(function* () {
          const clients = yield* Ref.get(clientsRef);
          const messageStr = JSON.stringify(message);

          for (const [clientId, client] of Array.from(clients.entries())) {
            if (sessionId && !client.subscribedSessions.has(sessionId)) {
              continue;
            }

            if (client.ws.readyState === 1) {
              // WebSocket.OPEN = 1
              yield* Effect.try({
                try: () => client.ws.send(messageStr),
                catch: (error) =>
                  new Error(`Failed to send to client ${clientId}: ${String(error)}`),
              }).pipe(Effect.ignore);
            }
          }
        });

      const handleClientMessage = (clientId: string, data: string) =>
        Effect.gen(function* () {
          try {
            const msg = JSON.parse(data) as { type: string; sessionId?: string };
            const clients = yield* Ref.get(clientsRef);
            const client = clients.get(clientId);

            if (!client) return;

            switch (msg.type) {
              case "subscribe": {
                if (msg.sessionId) {
                  client.subscribedSessions.add(msg.sessionId);
                  yield* Effect.logInfo(`Client subscribed`, {
                    clientId,
                    sessionId: msg.sessionId,
                  });

                  const history = yield* Ref.get(testHistoryRef);
                  const test = history.get(msg.sessionId);
                  if (test) {
                    client.ws.send(
                      JSON.stringify({
                        type: "test:state",
                        test,
                        timestamp: Date.now(),
                      }),
                    );
                  }
                }
                break;
              }

              case "unsubscribe": {
                if (msg.sessionId) {
                  client.subscribedSessions.delete(msg.sessionId);
                  yield* Effect.logInfo(`Client unsubscribed`, {
                    clientId,
                    sessionId: msg.sessionId,
                  });
                }
                break;
              }

              case "ping": {
                client.ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
                break;
              }

              case "get:history": {
                const history = yield* Ref.get(testHistoryRef);
                const tests = Array.from(history.values())
                  .sort((a, b) => b.startTime - a.startTime)
                  .slice(0, 50);

                client.ws.send(
                  JSON.stringify({
                    type: "history:response",
                    tests,
                    timestamp: Date.now(),
                  }),
                );
                break;
              }
            }
          } catch (error) {
            yield* Effect.logWarning("Failed to handle client message", {
              error: String(error),
              clientId,
            });
          }
        });

      const start = Effect.gen(function* () {
        yield* Effect.logInfo("Starting Dashboard WebSocket server", { port: config.port });

        const ws = yield* Effect.tryPromise({
          try: () => import("ws"),
          catch: (error) => new Error(`Failed to import ws: ${String(error)}`),
        });

        const WebSocketServer = ws.WebSocketServer as unknown as new (options: {
          port: number;
          host: string;
        }) => WebSocketServerLike;

        wss = new WebSocketServer({ port: config.port, host: config.host });

        wss.on("connection", (ws: WebSocketLike, req: { socket: { remoteAddress?: string } }) => {
          const clientId = generateClientId();
          const client: ClientConnection = {
            id: clientId,
            ws,
            subscribedSessions: new Set(),
            connectedAt: Date.now(),
          };

          Effect.runSync(
            Ref.update(clientsRef, (clients) => {
              const newClients = new Map(clients);
              newClients.set(clientId, client);
              return newClients;
            }),
          );

          Effect.runSync(
            Effect.logInfo(`Client connected`, { clientId, ip: req.socket.remoteAddress }),
          );

          ws.send(
            JSON.stringify({
              type: "connected",
              clientId,
              timestamp: Date.now(),
              serverVersion: "0.1.0",
            }),
          );

          ws.on("message", (data) => {
            Effect.runSync(handleClientMessage(clientId, data.toString()));
          });

          ws.on("close", () => {
            Effect.runSync(
              Effect.gen(function* () {
                yield* Ref.update(clientsRef, (clients: Map<string, ClientConnection>) => {
                  const newClients = new Map(clients);
                  newClients.delete(clientId);
                  return newClients;
                });
                yield* Effect.logInfo(`Client disconnected`, { clientId });
              }),
            );
          });

          ws.on("error", (error) => {
            Effect.runSync(Effect.logError(`WebSocket error`, { clientId, error: error.message }));
          });
        });

        yield* Effect.logInfo(
          `Dashboard WebSocket server listening on ws://${config.host}:${config.port}`,
        );
      });

      const stop = Effect.gen(function* () {
        yield* Effect.logInfo("Stopping Dashboard WebSocket server");

        if (wss) {
          const clients = yield* Ref.get(clientsRef);
          for (const client of clients.values()) {
            client.ws.close();
          }

          yield* Effect.tryPromise({
            try: () =>
              new Promise<void>((resolve) => {
                wss?.close(() => resolve());
              }),
            catch: (error) => new Error(`Failed to close WebSocket server: ${String(error)}`),
          });

          wss = null;
        }

        yield* Ref.set(clientsRef, new Map());
        yield* Effect.logInfo("Dashboard WebSocket server stopped");
      });

      const emit = (message: DashboardMessage) =>
        Effect.gen(function* () {
          // Store in history for test events
          if (message.type === "test:started") {
            yield* Ref.update(testHistoryRef, (history) => {
              const newHistory = new Map(history);
              newHistory.set(message.sessionId, {
                id: (message as { testId: string }).testId,
                name: (message as { testName: string }).testName,
                url: (message as { url: string }).url,
                status: "running",
                startTime: (message as { startTime: number }).startTime,
                steps: [],
                sessionId: message.sessionId,
              });
              return newHistory;
            });
          } else if (message.type === "test:completed") {
            yield* Ref.update(testHistoryRef, (history) => {
              const newHistory = new Map(history);
              const test = newHistory.get(message.sessionId);
              if (test) {
                test.status = (message as { success: boolean }).success ? "completed" : "failed";
                test.endTime = Date.now();
                test.duration = (message as { duration: number }).duration;
                test.error = (message as { error?: string }).error;
              }
              return newHistory;
            });
          }

          yield* broadcast(message, message.sessionId);
          yield* PubSub.publish(messagePubSub, message);
        });

      const getTestHistory = (sessionId?: string) =>
        Effect.gen(function* () {
          const history = yield* Ref.get(testHistoryRef);
          if (sessionId) {
            const test = history.get(sessionId);
            return test ? Option.some(test) : Option.none();
          }
          return Option.some(
            Array.from(history.values()).sort((a, b) => b.startTime - a.startTime),
          );
        });

      const getConnectedClients = () =>
        Effect.gen(function* () {
          const clients = yield* Ref.get(clientsRef);
          return clients.size;
        });

      const subscribe = () => PubSub.subscribe(messagePubSub);

      return {
        start,
        stop,
        emit,
        getTestHistory,
        getConnectedClients,
        subscribe,
        config,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make);
}
