import { Effect, Schema } from "effect";

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = "localhost";

export interface LiveViewEvent {
  type: "screenshot" | "console" | "network" | "action" | "error" | "complete";
  timestamp: number;
  data: unknown;
}

export class LiveViewServer {
  private wss: any;
  private clients: Set<any> = new Set();
  private port: number;
  private host: string;

  constructor(port = DEFAULT_PORT, host = DEFAULT_HOST) {
    this.port = port;
    this.host = host;
  }

  start(): Effect.Effect<
    {
      sendScreenshot: (screenshot: string) => void;
      sendConsole: (logs: any[]) => void;
      sendAction: (action: any) => void;
      sendError: (error: string) => void;
      close: () => void;
      getClientCount: () => number;
    },
    Error
  > {
    return Effect.gen(function* () {
      const wsModule = yield* Effect.tryPromise({
        try: () => import("ws"),
        catch: (e) => new Error(String(e)),
      });

      const WebSocketServer = wsModule.WebSocketServer;
      const WebSocket = wsModule.WebSocket;

      this.wss = new WebSocketServer({ port: this.port, host: this.host });

      this.wss.on("connection", (ws: any) => {
        this.clients.add(ws);
        console.log(`Live view client connected (${this.clients.size} total)`);

        ws.on("close", () => {
          this.clients.delete(ws);
          console.log(`Live view client disconnected (${this.clients.size} total)`);
        });
      });

      console.log(`Live view server started on ${this.host}:${this.port}`);

      const broadcast = (event: LiveViewEvent) => {
        const message = JSON.stringify(event);
        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        }
      };

      return {
        sendScreenshot: (screenshot: string) => {
          broadcast({ type: "screenshot", timestamp: Date.now(), data: screenshot });
        },
        sendConsole: (logs: any[]) => {
          broadcast({ type: "console", timestamp: Date.now(), data: logs });
        },
        sendAction: (action: any) => {
          broadcast({ type: "action", timestamp: Date.now(), data: action });
        },
        sendError: (error: string) => {
          broadcast({ type: "error", timestamp: Date.now(), data: error });
        },
        close: () => {
          for (const client of this.clients) {
            client.close();
          }
          this.clients.clear();
          this.wss.close();
        },
        getClientCount: () => this.clients.size,
      };
    });
  }
}

export const createLiveViewServer = (port?: number, host?: string) =>
  new LiveViewServer(port, host);
