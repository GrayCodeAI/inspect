import { Config, ConfigProvider, Effect } from "effect";

export const inspectConfig = Config.all({
  telemetry: Config.withDefault(Config.boolean("INSPECT_TELEMETRY"), true),
  logLevel: Config.withDefault(Config.string("INSPECT_LOG_LEVEL"), "info"),
  nodeEnv: Config.withDefault(Config.string("NODE_ENV"), "production"),
  inDocker: Config.withDefault(Config.boolean("IN_DOCKER"), false),
  docker: Config.withDefault(Config.boolean("DOCKER"), false),
  jwtSecret: Config.option(Config.string("INSPECT_JWT_SECRET")),
  corsOrigin: Config.withDefault(Config.string("INSPECT_CORS_ORIGIN"), ""),
  otelEndpoint: Config.option(Config.string("OTEL_EXPORTER_OTLP_ENDPOINT")),
  otelHeaders: Config.withDefault(Config.string("OTEL_EXPORTER_OTLP_HEADERS"), ""),
  anthropicApiKey: Config.option(Config.string("ANTHROPIC_API_KEY")),
  openaiApiKey: Config.option(Config.string("OPENAI_API_KEY")),
  googleApiKey: Config.option(Config.string("GOOGLE_API_KEY")),
  geminiApiKey: Config.option(Config.string("GEMINI_API_KEY")),
  githubToken: Config.option(Config.string("GITHUB_TOKEN")),
  ollamaHost: Config.withDefault(Config.string("OLLAMA_HOST"), "http://localhost:11434"),
});

export type InspectConfig = Config.Success<typeof inspectConfig>;

/** Synchronously resolve config from environment */
export function loadFromEnv(): InspectConfig {
  return Effect.runSync(inspectConfig.parse(ConfigProvider.fromEnv()));
}

/** Check if inspect is running in Docker */
export function isDocker(): boolean {
  const c = Config.all({
    inDocker: Config.withDefault(Config.boolean("IN_DOCKER"), false),
    docker: Config.withDefault(Config.boolean("DOCKER"), false),
  });
  const { inDocker, docker } = Effect.runSync(c.parse(ConfigProvider.fromEnv()));
  return inDocker || docker;
}

/** Get a string env var with optional default, throws if unset and no default */
export function getEnv(name: string, defaultValue?: string): string {
  const config =
    defaultValue !== undefined
      ? Config.withDefault(Config.string(name), defaultValue)
      : Config.string(name);
  return Effect.runSync(config.parse(ConfigProvider.fromEnv()));
}

/** Get a boolean env var with optional default */
export function getEnvBool(name: string, defaultValue: boolean = false): boolean {
  return Effect.runSync(
    Config.withDefault(Config.boolean(name), defaultValue).parse(ConfigProvider.fromEnv()),
  );
}

/** Get an integer env var with optional default */
export function getEnvInt(name: string, defaultValue?: number): number {
  const config =
    defaultValue !== undefined
      ? Config.withDefault(Config.int(name), defaultValue)
      : Config.int(name);
  return Effect.runSync(config.parse(ConfigProvider.fromEnv()));
}
