import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import {
  AcpClient,
  SessionId,
  AcpProviderNotInstalledError,
  AcpProviderUnauthenticatedError,
  AcpConnectionInitError,
  AcpAdapterNotFoundError,
  AcpStreamError,
  AcpSessionCreateError,
  AcpProviderUsageLimitError,
} from "./index.js";
import { AcpSessionUpdate, AgentStreamOptions } from "./types.js";
import type { AgentBackend } from "./detect.js";
import type { AcpConfigOption } from "@inspect/shared";
import { PlatformError } from "effect/PlatformError";

export type AgentLayerError =
  | PlatformError
  | Schema.SchemaError
  | AcpProviderNotInstalledError
  | AcpProviderUnauthenticatedError
  | AcpConnectionInitError
  | AcpAdapterNotFoundError;

export class Agent extends ServiceMap.Service<
  Agent,
  {
    readonly stream: (
      options: AgentStreamOptions,
    ) => Stream.Stream<
      AcpSessionUpdate,
      | AcpStreamError
      | AcpSessionCreateError
      | AcpProviderUnauthenticatedError
      | AcpProviderUsageLimitError
    >;
    readonly createSession: (
      cwd: string,
    ) => Effect.Effect<
      SessionId,
      AcpSessionCreateError | AcpProviderUnauthenticatedError | AcpProviderUsageLimitError
    >;
    readonly setConfigOption: (
      sessionId: SessionId,
      configId: string,
      value: string | boolean,
    ) => Effect.Effect<unknown, AcpStreamError>;
    readonly fetchConfigOptions: (
      cwd: string,
    ) => Effect.Effect<
      readonly AcpConfigOption[],
      AcpSessionCreateError | AcpProviderUnauthenticatedError | AcpProviderUsageLimitError
    >;
  }
>()("@inspect/Agent") {
  static layerAcp = Layer.effect(Agent)(
    Effect.gen(function* () {
      const acpClient = yield* AcpClient;
      return Agent.of({
        createSession: (cwd) => acpClient.createSession(cwd),
        stream: (options) =>
          acpClient.stream({
            cwd: options.cwd,
            sessionId: options.sessionId,
            prompt: options.prompt,
            mcpEnv: options.mcpEnv,
            systemPrompt: options.systemPrompt,
            modelPreference: options.modelPreference,
          }),
        setConfigOption: (sessionId, configId, value) =>
          acpClient.setConfigOption(sessionId as SessionId, configId, value),
        fetchConfigOptions: (cwd) => acpClient.fetchConfigOptions(cwd),
      });
    }),
  ).pipe(Layer.provide(AcpClient.layer));

  static layerCodex = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCodex));
  static layerClaude = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerClaude));
  static layerCopilot = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCopilot));
  static layerGemini = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerGemini));
  static layerCursor = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerCursor));
  static layerOpencode = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerOpencode));
  static layerDroid = Agent.layerAcp.pipe(Layer.provide(AcpAdapter.layerDroid));

  static layerFor = (backend: AgentBackend): Layer.Layer<Agent, AgentLayerError> => {
    const layers: Record<AgentBackend, Layer.Layer<Agent, AgentLayerError>> = {
      claude: Agent.layerClaude,
      codex: Agent.layerCodex,
      copilot: Agent.layerCopilot,
      gemini: Agent.layerGemini,
      cursor: Agent.layerCursor,
      opencode: Agent.layerOpencode,
      droid: Agent.layerDroid,
    };
    return layers[backend];
  };
}
