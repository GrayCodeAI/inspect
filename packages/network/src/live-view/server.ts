import { Effect } from "effect";
import type { WebSocketServer, WebSocket } from "ws";

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = "localhost";

export interface LiveViewEvent {
  type: "screenshot" | "console" | "network" | "action" | "error" | "complete";
  timestamp: number;
  data: unknown;
}

export interface LiveViewControl {
  sendScreenshot: (screenshot: string) => void;
  sendConsole: (logs: unknown[]) => void;
  sendAction: (action: unknown) => void;
  sendError: (error: string) => void;
  close: () => void;
  getClientCount: () => number;
}

export const createLiveViewServer = (
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
): Effect.Effect<LiveViewControl, Error> =>
  Effect.gen(function* () {
    const wsModule = yield* Effect.tryPromise({
      try: async () => {
        const { WebSocketServer: WSS, WebSocket: WS } = await import("ws");
        return { WebSocketServer: WSS, WebSocket: WS };
      },
      catch: (e: unknown) => new Error(String(e)),
    });

    const WebSocketServer = wsModule.WebSocketServer;
    const WebSocket = wsModule.WebSocket;

    const wss = new WebSocketServer({ port, host });
    const clients = new Set<WebSocket>();

    wss.on("connection", (ws: WebSocket) => {
      clients.add(ws);
      console.log(`Live view client connected (${clients.size} total)`);

      ws.on("close", () => {
        clients.delete(ws);
        console.log(`Live view client disconnected (${clients.size} total)`);
      });
    });

    console.log(`Live view server started on ${host}:${port}`);

    const broadcast = (event: LiveViewEvent) => {
      const message = JSON.stringify(event);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    };

    return {
      sendScreenshot: (screenshot: string) => {
        broadcast({ type: "screenshot", timestamp: Date.now(), data: screenshot });
      },
      sendConsole: (logs: unknown[]) => {
        broadcast({ type: "console", timestamp: Date.now(), data: logs });
      },
      sendAction: (action: unknown) => {
        broadcast({ type: "action", timestamp: Date.now(), data: action });
      },
      sendError: (error: string) => {
        broadcast({ type: "error", timestamp: Date.now(), data: error });
      },
      close: () => {
        for (const client of clients) {
          client.close();
        }
        clients.clear();
        wss.close();
      },
      getClientCount: () => clients.size,
    };
  });
