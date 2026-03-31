import { fileURLToPath } from "node:url";
import * as acp from "@agentclientprotocol/sdk";
import {
  Cause,
  Duration,
  Effect,
  FiberMap,
  Layer,
  Option,
  Queue,
  Ref,
  Schema,
  ServiceMap,
  Stream,
} from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  AcpAdapter,
  AcpAdapterNotFoundError,
  AcpConnectionInitError,
  AcpProviderUnauthenticatedError,
  AcpProviderUsageLimitError,
  AcpSessionCreateError,
  AcpStreamError,
} from "./adapter.js";
import { AcpSessionUpdate, AgentProvider } from "./types.js";
import type { AcpConfigOption } from "@inspect/shared";

const ACP_STREAM_INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

const hasStringMessage = (cause: unknown): cause is { message: string } =>
  typeof cause === "object" &&
  cause !== null &&
  "message" in cause &&
  typeof (cause as { message: string }).message === "string";

type SessionQueueError = Cause.Done | AcpStreamError;

export class AcpClient extends ServiceMap.Service<AcpClient>()("@inspect/AcpClient", {
  make: Effect.gen(function* () {
    const adapter = yield* AcpAdapter;
    const streamFiberMap = yield* FiberMap.make<SessionId>();
    const writableQueue = yield* Queue.unbounded<Uint8Array>();
    const sessionUpdatesMap = new Map<
      SessionId,
      Queue.Queue<AcpSessionUpdate, SessionQueueError>
    >();

    const client: acp.Client = {
      requestPermission: (params) =>
        Promise.resolve({
          outcome: {
            outcome: "selected" as const,
            optionId:
              params.options.find(
                (option) => option.kind === "allow_always" || option.kind === "allow_once",
              )?.optionId ?? params.options[0].optionId,
          },
        }),
      sessionUpdate: async ({ sessionId, update }) => {
        const updatesQueue = sessionUpdatesMap.get(SessionId.makeUnsafe(sessionId));
        if (updatesQueue === undefined) return;
        try {
          const decoded = Schema.decodeUnknownSync(AcpSessionUpdate)(update);
          Queue.offerUnsafe(updatesQueue, decoded);
        } catch {}
      },
    };

    const childProcess = yield* Effect.tryPromise({
      try: () => acp.spawnProcess(adapter.bin, adapter.args, { env: adapter.env, extendEnv: true }),
      catch: (cause) => new AcpConnectionInitError({ cause: cause as unknown }),
    });

    const readable = Stream.toReadableStream(childProcess.stdout);
    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => void Queue.offerUnsafe(writableQueue, chunk),
    });
    const ndJsonStream = acp.ndJsonStream(writable, readable);
    const connection = new acp.ClientSideConnection((_agent) => client, ndJsonStream);

    const browserMcpBinPath = fileURLToPath(new URL("./browser-mcp.js", import.meta.url));

    const buildMcpServers = (
      env: ReadonlyArray<{ name: string; value: string }>,
    ): acp.McpServer[] => [
      {
        command: process.execPath,
        args: [browserMcpBinPath],
        env: [...env],
        name: "browser",
      },
    ];

    yield* Effect.tryPromise({
      try: () => connection.initialize({ protocolVersion: acp.PROTOCOL_VERSION }),
      catch: (cause) => new AcpConnectionInitError({ cause: cause as unknown }),
    });

    const createSession = Effect.fn("AcpClient.createSession")(function* (
      cwd: string,
      mcpEnv: ReadonlyArray<{ name: string; value: string }> = [],
      systemPrompt: Option.Option<string> = Option.none(),
    ) {
      const mcpServers = buildMcpServers(mcpEnv);
      return yield* Effect.tryPromise({
        try: () =>
          connection.newSession({
            cwd,
            mcpServers,
            ...(adapter.provider === "claude" && Option.isSome(systemPrompt)
              ? { _meta: { systemPrompt: systemPrompt.value } }
              : {}),
          }),
        catch: (cause) => {
          const message = hasStringMessage(cause) ? cause.message : String(cause);
          const USAGE_LIMIT_ERRORS = ["out of usage", "limits exceeded", "usage exceeded"];
          const AUTH_ERRORS = ["authentication"];
          if (AUTH_ERRORS.some((error) => message.toLowerCase().includes(error))) {
            return new AcpProviderUnauthenticatedError({
              provider: adapter.provider as AgentProvider,
            });
          }
          if (USAGE_LIMIT_ERRORS.some((error) => message.toLowerCase().includes(error))) {
            return new AcpProviderUsageLimitError({ provider: adapter.provider as AgentProvider });
          }
          return new AcpSessionCreateError({ cause: cause as unknown });
        },
      }).pipe(
        Effect.tap((response) =>
          Effect.gen(function* () {
            const sessionId = SessionId.makeUnsafe(response.sessionId);
            const updatesQueue = yield* Queue.unbounded<AcpSessionUpdate, SessionQueueError>();
            sessionUpdatesMap.set(sessionId, updatesQueue);

            if ((response as any).configOptions && (response as any).configOptions.length > 0) {
              const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Unknown))(
                (response as any).configOptions,
              );
              if (decoded.length > 0) {
                const configUpdate: AcpSessionUpdate = {
                  sessionUpdate: "config_option_update",
                  configOptions: decoded,
                } as unknown as AcpSessionUpdate;
                Queue.offerUnsafe(updatesQueue, configUpdate);
              }
            }
          }),
        ),
        Effect.map(({ sessionId }) => SessionId.makeUnsafe(sessionId)),
      );
    });

    const getQueueBySessionId = Effect.fn("AcpClient.getQueueBySessionId")(function* (
      sessionId: SessionId,
    ) {
      const existing = sessionUpdatesMap.get(sessionId);
      if (!existing) {
        return yield* Effect.die(
          `Session ${sessionId} not initialized, did you forget to call createSession?`,
        );
      }
      return existing;
    });

    const stream = Effect.fn("AcpClient.stream")(function* ({
      prompt,
      sessionId: sessionIdOption,
      cwd,
      mcpEnv = [],
      systemPrompt = Option.none(),
      modelPreference,
    }: {
      sessionId: Option.Option<SessionId>;
      prompt: string;
      cwd: string;
      mcpEnv?: ReadonlyArray<{ name: string; value: string }>;
      systemPrompt?: Option.Option<string>;
      modelPreference?: { configId: string; value: string };
    }) {
      const sessionId = Option.isSome(sessionIdOption)
        ? sessionIdOption.value
        : yield* createSession(cwd, mcpEnv, systemPrompt);

      const updatesQueue = yield* getQueueBySessionId(sessionId);
      const lastActivityAt = yield* Ref.make(Date.now());

      if (modelPreference) {
        yield* setConfigOption(sessionId, modelPreference.configId, modelPreference.value).pipe(
          Effect.tap(() =>
            Effect.logInfo("Model preference applied", {
              configId: modelPreference.configId,
              value: modelPreference.value,
            }),
          ),
          Effect.tapErrorTag("AcpStreamError", (error) =>
            Effect.logWarning("Failed to apply model preference", {
              error: error.message,
            }),
          ),
          Effect.catchTag("AcpStreamError", () => Effect.void),
        );
      }

      const effectivePrompt =
        adapter.provider !== "claude" && Option.isSome(systemPrompt)
          ? `${systemPrompt.value}\n\n${prompt}`
          : prompt;

      yield* Effect.tryPromise({
        try: () =>
          connection.prompt({
            sessionId,
            prompt: [{ type: "text", text: effectivePrompt }],
          }),
        catch: (cause) => new AcpStreamError({ cause: cause as unknown }),
      }).pipe(
        Effect.tap(() => Queue.end(updatesQueue)),
        FiberMap.run(streamFiberMap, sessionId, { startImmediately: true }),
      );

      const checkInactivity = Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(ACP_STREAM_INACTIVITY_TIMEOUT_MS));
        const lastActivity = yield* Ref.get(lastActivityAt);
        const elapsed = Date.now() - lastActivity;
        return elapsed >= ACP_STREAM_INACTIVITY_TIMEOUT_MS;
      });
      const inactivityWatchdog = Effect.gen(function* () {
        const isStalled = yield* Effect.repeat(checkInactivity, {
          while: (stalled) => !stalled,
        });
        if (isStalled) {
          yield* Queue.fail(
            updatesQueue,
            new AcpStreamError({
              cause: `Agent produced no output for ${ACP_STREAM_INACTIVITY_TIMEOUT_MS / 1000}s — the agent may be stalled`,
            }),
          );
        }
      });
      yield* inactivityWatchdog.pipe(Effect.forkScoped);

      const isMeaningfulActivity = (update: AcpSessionUpdate): boolean =>
        update.sessionUpdate === "agent_message_chunk" ||
        update.sessionUpdate === "agent_thought_chunk" ||
        update.sessionUpdate === "tool_call" ||
        update.sessionUpdate === "tool_call_update";

      return Stream.fromQueue(updatesQueue).pipe(
        Stream.tap((update) =>
          isMeaningfulActivity(update) ? Ref.set(lastActivityAt, Date.now()) : Effect.void,
        ),
      );
    }, Stream.unwrap);

    const setConfigOption = Effect.fn("AcpClient.setConfigOption")(function* (
      sessionId: SessionId,
      configId: string,
      value: string | boolean,
    ) {
      yield* Effect.annotateCurrentSpan({ sessionId, configId });
      const response = yield* Effect.tryPromise({
        try: () =>
          connection.setSessionConfigOption({
            sessionId,
            configId,
            ...(typeof value === "boolean" ? { type: "boolean" as const, value } : { value }),
          }),
        catch: (cause) => new AcpStreamError({ cause: cause as unknown }),
      });
      yield* Effect.logInfo("ACP config option set", { configId, value });
      return response;
    });

    const fetchConfigOptions = Effect.fn("AcpClient.fetchConfigOptions")(function* (cwd: string) {
      const sessionId = yield* createSession(cwd);
      const queue = sessionUpdatesMap.get(sessionId);
      if (!queue) return [] as AcpConfigOption[];

      const configOptions: AcpConfigOption[] = [];
      let update = yield* Queue.poll(queue);
      while (update._tag === "Some") {
        const val = update.value as any;
        if (val.sessionUpdate === "config_option_update") {
          configOptions.push(...val.configOptions);
        }
        update = yield* Queue.poll(queue);
      }

      yield* Effect.logInfo("ACP config options fetched", {
        sessionId,
        count: configOptions.length,
      });
      return configOptions;
    });

    return {
      createSession,
      stream,
      setConfigOption,
      fetchConfigOptions,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
  static layerCodex = this.layer.pipe(Layer.provide(AcpAdapter.layerCodex));
  static layerClaude = this.layer.pipe(Layer.provide(AcpAdapter.layerClaude));
  static layerCopilot = this.layer.pipe(Layer.provide(AcpAdapter.layerCopilot));
  static layerGemini = this.layer.pipe(Layer.provide(AcpAdapter.layerGemini));
  static layerCursor = this.layer.pipe(Layer.provide(AcpAdapter.layerCursor));
  static layerOpencode = this.layer.pipe(Layer.provide(AcpAdapter.layerOpencode));
  static layerDroid = this.layer.pipe(Layer.provide(AcpAdapter.layerDroid));
}
