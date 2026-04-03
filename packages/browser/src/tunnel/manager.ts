// ──────────────────────────────────────────────────────────────────────────────
// TunnelManager — Secure tunnel for cloud agent control of local browser
// Wraps Cloudflare Tunnel / ngrok for remote browser access
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Option, Schema, ServiceMap } from "effect";
import { spawn, ChildProcess } from "node:child_process";

export const TunnelProvider = Schema.Literal("ngrok", "cloudflare", "localtunnel");
export type TunnelProvider = typeof TunnelProvider.Type;

export class TunnelConfig extends Schema.Class<TunnelConfig>("TunnelConfig")({
  provider: TunnelProvider,
  port: Schema.Number,
  authToken: Schema.optional(Schema.String),
  subdomain: Schema.optional(Schema.String),
}) {}

export class TunnelResult extends Schema.Class<TunnelResult>("TunnelResult")({
  url: Schema.String,
  publicUrl: Schema.String,
  provider: Schema.String,
}) {}

export class TunnelError extends Schema.ErrorClass<TunnelError>("TunnelError")({
  _tag: Schema.tag("TunnelError"),
  provider: Schema.String,
  message: Schema.String,
}) {
  message = this.message;
}

export class TunnelTimeoutError extends Schema.ErrorClass<TunnelTimeoutError>("TunnelTimeoutError")(
  {
    _tag: Schema.tag("TunnelTimeoutError"),
    provider: Schema.String,
  },
) {
  message = `Tunnel ${this.provider} failed to start within timeout`;
}

const TUNNEL_TIMEOUT_MS = 30000;

/** Start a tunnel to expose the local browser port. */
const startTunnel = (config: TunnelConfig) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ provider: config.provider, port: config.port });

    switch (config.provider) {
      case "ngrok":
        return yield* startNgrok(config);
      case "cloudflare":
        return yield* startCloudflare(config);
      case "localtunnel":
        return yield* startLocaltunnel(config);
      default:
        return yield* startLocaltunnel(config);
    }
  });

/** Stop the active tunnel. */
const stopTunnel = (process: Option.Option<ChildProcess>) =>
  Effect.gen(function* () {
    if (Option.isSome(process)) {
      yield* Effect.sync(() => process.value.kill("SIGTERM"));
      yield* Effect.logInfo("Tunnel process terminated");
    }
  });

/** Start ngrok tunnel. */
const startNgrok = (config: TunnelConfig) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ provider: "ngrok" });

    if (Option.isSome(config.authToken)) {
      yield* Effect.tryPromise({
        try: () =>
          new Promise<void>((resolve, reject) => {
            const proc = spawn("ngrok", ["config", "add-authtoken", config.authToken.value], {
              stdio: "pipe",
            });
            proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("Auth failed"))));
            proc.on("error", reject);
          }),
        catch: (cause) =>
          new TunnelError({
            provider: "ngrok",
            message: `Failed to configure auth: ${String(cause)}`,
          }),
      });
    }

    const args = ["http", String(config.port)];
    if (Option.isSome(config.subdomain)) {
      args.push("--subdomain", config.subdomain.value);
    }

    const ngrokProcess = spawn("ngrok", args, { stdio: "pipe" });
    const tunnelUrl = yield* waitForTunnelUrl(
      ngrokProcess,
      /https:\/\/[a-z0-9-]+\.ngrok-free\.app/,
    );

    yield* Effect.logInfo("Ngrok tunnel started", { url: tunnelUrl });

    return new TunnelResult({
      url: `http://localhost:${config.port}`,
      publicUrl: tunnelUrl,
      provider: "ngrok",
    });
  });

/** Start cloudflare tunnel. */
const startCloudflare = (config: TunnelConfig) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ provider: "cloudflare" });

    const cfProcess = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${config.port}`], {
      stdio: "pipe",
    });

    const tunnelUrl = yield* waitForTunnelUrl(
      cfProcess,
      /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
    );

    yield* Effect.logInfo("Cloudflare tunnel started", { url: tunnelUrl });

    return new TunnelResult({
      url: `http://localhost:${config.port}`,
      publicUrl: tunnelUrl,
      provider: "cloudflare",
    });
  });

/** Start localtunnel. */
const startLocaltunnel = (config: TunnelConfig) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({ provider: "localtunnel" });

    const args = ["--port", String(config.port)];
    if (Option.isSome(config.subdomain)) {
      args.push("--subdomain", config.subdomain.value);
    }

    const ltProcess = spawn("lt", args, { stdio: "pipe" });
    const tunnelUrl = yield* waitForTunnelUrl(ltProcess, /https:\/\/[a-z0-9-]+\.loca\.lt/);

    yield* Effect.logInfo("Localtunnel started", { url: tunnelUrl });

    return new TunnelResult({
      url: `http://localhost:${config.port}`,
      publicUrl: tunnelUrl,
      provider: "localtunnel",
    });
  });

/** Wait for tunnel URL from process output. */
const waitForTunnelUrl = (process: ChildProcess, pattern: RegExp) =>
  Effect.gen(function* () {
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => process),
      (proc) =>
        Effect.gen(function* () {
          const url = yield* Effect.async<string, TunnelTimeoutError>((resume) => {
            const timeout = setTimeout(() => {
              resume(
                Effect.fail(
                  new TunnelTimeoutError({
                    provider: "unknown",
                  }),
                ),
              );
            }, TUNNEL_TIMEOUT_MS);

            const onData = (data: Buffer) => {
              const match = data.toString().match(pattern);
              if (match) {
                clearTimeout(timeout);
                cleanup();
                resume(Effect.succeed(match[0]));
              }
            };

            const cleanup = () => {
              proc.stdout?.off("data", onData);
              proc.stderr?.off("data", onData);
            };

            proc.stdout?.on("data", onData);
            proc.stderr?.on("data", onData);
          });

          return url;
        }),
      (proc, exit) =>
        Effect.sync(() => {
          if (exit._tag === "Failure") {
            proc.kill("SIGTERM");
          }
        }),
    );
  });

/** TunnelManager service for dependency injection. */
export class TunnelManager extends ServiceMap.Service<TunnelManager>()("@browser/TunnelManager", {
  make: Effect.gen(function* () {
    let activeProcess: Option.Option<ChildProcess> = Option.none();
    let activeUrl = "";

    const start = (config: TunnelConfig) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({ provider: config.provider });

        if (Option.isSome(activeProcess)) {
          yield* stopTunnel(activeProcess);
        }

        const result = yield* startTunnel(config);
        activeUrl = result.publicUrl;

        yield* Effect.logInfo("Tunnel started", {
          provider: config.provider,
          publicUrl: result.publicUrl,
        });

        return result;
      });

    const stop = Effect.gen(function* () {
      yield* stopTunnel(activeProcess);
      activeProcess = Option.none();
      activeUrl = "";
      yield* Effect.logInfo("Tunnel stopped");
    });

    const getPublicUrl = Effect.sync(() => activeUrl);

    return {
      start,
      stop,
      getPublicUrl,
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
