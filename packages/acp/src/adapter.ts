import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  Cause,
  Config,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Schema,
  ServiceMap,
  String as Str,
} from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { AgentProvider } from "./types.js";

const ACP_AUTH_CHECK_TIMEOUT = "3 seconds" as const;

const ACP_AUTH_CHECK_TIMEOUT = "3 seconds" as const;

export class AcpStreamError extends Schema.ErrorClass<AcpStreamError>("AcpStreamError")({
  _tag: Schema.tag("AcpStreamError"),
  cause: Schema.Unknown,
}) {
  displayName = `An unexpected error occurred while streaming`;
  message = `Streaming failed: ${this.cause}`;
}

export class AcpProviderNotInstalledError extends Schema.ErrorClass<AcpProviderNotInstalledError>(
  "AcpProviderNotInstalledError",
)({
  _tag: Schema.tag("AcpProviderNotInstalledError"),
  provider: AgentProvider,
}) {
  displayName = `${Str.capitalize(this.provider)} is not installed`;
  message = Match.value(this.provider).pipe(
    Match.when(
      "claude",
      () =>
        "Claude Code is not installed. Install it from https://code.claude.com/docs/en/overview#native-install-recommended, or use codex agent with \`inspect -a codex\`.",
    ),
    Match.when(
      "codex",
      () =>
        "Codex CLI is not installed. Install it with \`npm install -g @openai/codex\`, or use Claude Code by removing the \`--agent codex\` option.",
    ),
    Match.when(
      "copilot",
      () =>
        "GitHub Copilot CLI is not installed. Install it with \`npm install -g @github/copilot\`, or use Claude Code with \`inspect -a claude\`.",
    ),
    Match.when(
      "gemini",
      () =>
        "Gemini CLI is not installed. Install it with \`npm install -g @google/gemini-cli\`, or use Claude Code with \`inspect -a claude\`.",
    ),
    Match.when(
      "cursor",
      () =>
        "Cursor agent CLI is not installed. Install it from https://cursor.com/docs/cli/acp, or use Claude Code with \`inspect -a claude\`.",
    ),
    Match.when(
      "opencode",
      () =>
        "OpenCode is not installed. Install it with \`npm install -g opencode-ai\`, or use Claude Code with \`inspect -a claude\`.",
    ),
    Match.when(
      "droid",
      () =>
        "Factory Droid is not installed. Install it with \`npm install -g droid\`, or use Claude Code with \`inspect -a claude\`.",
    ),
    Match.orElse(
      () => "Your coding agent CLI is not installed. Please install it and then re-run inspect.",
    ),
  );
}

export class AcpProviderUnauthenticatedError extends Schema.ErrorClass<AcpProviderUnauthenticatedError>(
  "AcpProviderUnauthenticatedError",
)({
  _tag: Schema.tag("AcpProviderUnauthenticatedError"),
  provider: AgentProvider,
}) {
  displayName = `Your ${this.provider} agent is not authenticated`;
  message = Match.value(this.provider).pipe(
    Match.when("claude", () => "Please log in using \`claude login\`, and then re-run inspect."),
    Match.when("codex", () => "Please log in using \`codex login\`, and then re-run inspect."),
    Match.when("copilot", () => "Please log in using \`gh auth login\`, and then re-run inspect."),
    Match.when(
      "gemini",
      () => "Please log in using \`gemini auth login\`, and then re-run inspect.",
    ),
    Match.when("cursor", () => "Please log in using \`agent login\`, and then re-run inspect."),
    Match.when(
      "opencode",
      () => "Please log in using \`opencode auth login\`, and then re-run inspect.",
    ),
    Match.when(
      "droid",
      () =>
        "Please set the FACTORY_API_KEY environment variable (get one at app.factory.ai/settings/api-keys), and then re-run inspect.",
    ),
    Match.orElse(() => "Please sign in to your coding agent, and then re-run inspect."),
  );
}

export class AcpProviderUsageLimitError extends Schema.ErrorClass<AcpProviderUsageLimitError>(
  "AcpProviderUsageLimitError",
)({
  _tag: Schema.tag("AcpProviderUsageLimitError"),
  provider: AgentProvider,
}) {
  displayName = `Your ${this.provider} agent has exceeded its usage limits`;
  message = `Usage limits exceeded for ${this.provider}. Please check your plan and billing.`;
}

export class AcpSessionCreateError extends Schema.ErrorClass<AcpSessionCreateError>(
  "AcpSessionCreateError",
)({
  _tag: Schema.tag("AcpSessionCreateError"),
  cause: Schema.Unknown,
}) {
  displayName = `Creating a chat session failed`;
  message = `Creating session failed: ${Cause.pretty(Cause.fail(this.cause))}`;
}

export class AcpConnectionInitError extends Schema.ErrorClass<AcpConnectionInitError>(
  "AcpConnectionInitError",
)({
  _tag: Schema.tag("AcpConnectionInitError"),
  cause: Schema.Unknown,
}) {
  message = `Init connection failed: ${this.cause}`;
}

export class AcpAdapterNotFoundError extends Schema.ErrorClass<AcpAdapterNotFoundError>(
  "AcpAdapterNotFoundError",
)({
  _tag: Schema.tag("AcpAdapterNotFoundError"),
  packageName: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `ACP adapter not found: ${this.packageName}. Error: ${Cause.pretty(
    Cause.fail(this.cause),
  )}`;
}

const makeRequire = () =>
  createRequire(typeof __filename !== "undefined" ? __filename : import.meta.url);

const resolvePackageDir = (require: NodeRequire, packageName: string): string => {
  try {
    return dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    const paths = require.resolve.paths(packageName) ?? [];
    for (const searchPath of paths) {
      const candidate = join(searchPath, packageName);
      try {
        const content = JSON.parse(readFileSync(join(candidate, "package.json"), "utf-8"));
        if (content.name === packageName) return candidate;
      } catch {}
    }
    throw new Error(`Cannot find package root for ${packageName}`);
  }
};

const resolvePackageBin = (packageName: string): string => {
  const require = makeRequire();
  const packageDir = resolvePackageDir(require, packageName);
  const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8"));

  if (typeof packageJson.bin === "string") {
    return join(packageDir, packageJson.bin);
  }
  if (typeof packageJson.bin === "object" && packageJson.bin !== null) {
    const firstBinPath = String(Object.values(packageJson.bin)[0]);
    return join(packageDir, firstBinPath);
  }
  if (packageJson.main) {
    return join(packageDir, packageJson.main);
  }
  throw new Error(`Cannot resolve bin entry for ${packageName}`);
};

export class AcpAdapter extends ServiceMap.Service<
  AcpAdapter,
  {
    readonly provider: AgentProvider;
    readonly bin: string;
    readonly args: readonly string[];
    readonly env: Record<string, string>;
  }
>()("@inspect/AcpAdapter") {
  static layerCodex = Layer.effect(AcpAdapter)(
    Effect.try({
      try: () => {
        const require = makeRequire();
        const binPath = require.resolve("@zed-industries/codex-acp/bin/codex-acp.js");
        return AcpAdapter.of({
          provider: "codex",
          bin: process.execPath,
          args: [binPath],
          env: {},
        });
      },
      catch: (cause) =>
        new AcpAdapterNotFoundError({
          packageName: "@zed-industries/codex-acp",
          cause,
        }),
    }),
  );

  static layerClaude = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const AuthSchema = Schema.Struct({ loggedIn: Schema.Boolean });

      yield* ChildProcess.make(`claude`, ["auth", "status"]).pipe(
        spawner.string,
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(AuthSchema))),
        Effect.flatMap(({ loggedIn }) =>
          loggedIn
            ? Effect.void
            : new AcpProviderUnauthenticatedError({
                provider: "claude",
              }).asEffect(),
        ),
        Effect.catchReason("PlatformError", "NotFound", () =>
          new AcpProviderNotInstalledError({ provider: "claude" }).asEffect(),
        ),
      );

      return yield* Effect.try({
        try: () => {
          const require = makeRequire();
          const binPath = require.resolve("@zed-industries/claude-agent-acp/dist/index.js");
          return AcpAdapter.of({
            provider: "claude",
            bin: process.execPath,
            args: [binPath],
            env: {},
          });
        },
        catch: (cause) =>
          new AcpAdapterNotFoundError({
            packageName: "@zed-industries/claude-agent-acp",
            cause: cause as unknown,
          }),
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerCopilot = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      yield* ChildProcess.make("gh", ["auth", "token"]).pipe(
        spawner.string,
        Effect.flatMap((token) =>
          token.trim().length > 0
            ? Effect.void
            : new AcpProviderUnauthenticatedError({ provider: "copilot" }).asEffect(),
        ),
        Effect.catchTag("PlatformError", () =>
          new AcpProviderUnauthenticatedError({ provider: "copilot" }).asEffect(),
        ),
      );

      return yield* Effect.try({
        try: () => {
          const binPath = resolvePackageBin("@github/copilot");
          return AcpAdapter.of({
            provider: "copilot",
            bin: process.execPath,
            args: [binPath, "--acp"],
            env: {},
          });
        },
        catch: (cause) =>
          new AcpAdapterNotFoundError({
            packageName: "@github/copilot",
            cause: cause as unknown,
          }),
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerGemini = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const homeOption = yield* Config.option(
        Config.string("HOME").pipe(Config.orElse(() => Config.string("USERPROFILE"))),
      );
      const homedir = Option.isSome(homeOption)
        ? homeOption.value
        : yield* new AcpProviderUnauthenticatedError({ provider: "gemini" });
      const accountsPath = `${homedir}/.gemini/google_accounts.json`;
      const AccountsSchema = Schema.Struct({ active: Schema.String });

      yield* fileSystem.readFileString(accountsPath).pipe(
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(AccountsSchema))),
        Effect.flatMap(({ active }) =>
          active.length > 0
            ? Effect.void
            : new AcpProviderUnauthenticatedError({ provider: "gemini" }).asEffect(),
        ),
        Effect.catchReason("PlatformError", "NotFound", () =>
          new AcpProviderUnauthenticatedError({ provider: "gemini" }).asEffect(),
        ),
        Effect.catchTag("SchemaError", () =>
          new AcpProviderUnauthenticatedError({ provider: "gemini" }).asEffect(),
        ),
      );

      return yield* Effect.try({
        try: () => {
          const binPath = resolvePackageBin("@google/gemini-cli");
          return AcpAdapter.of({
            provider: "gemini",
            bin: process.execPath,
            args: [binPath, "--acp"],
            env: {},
          });
        },
        catch: (cause) =>
          new AcpAdapterNotFoundError({
            packageName: "@google/gemini-cli",
            cause: cause as unknown,
          }),
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerCursor = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      yield* ChildProcess.make("agent", ["--version"]).pipe(
        spawner.string,
        Effect.timeoutOrElse({
          duration: ACP_AUTH_CHECK_TIMEOUT,
          onTimeout: () => new AcpProviderNotInstalledError({ provider: "cursor" }).asEffect(),
        }),
        Effect.catchReason("PlatformError", "NotFound", () =>
          new AcpProviderNotInstalledError({ provider: "cursor" }).asEffect(),
        ),
      );

      yield* ChildProcess.make("agent", ["auth", "whoami"]).pipe(
        spawner.string,
        Effect.flatMap((output) =>
          output.trim().length > 0
            ? Effect.void
            : new AcpProviderUnauthenticatedError({ provider: "cursor" }).asEffect(),
        ),
        Effect.timeoutOrElse({
          duration: ACP_AUTH_CHECK_TIMEOUT,
          onTimeout: () => new AcpProviderUnauthenticatedError({ provider: "cursor" }).asEffect(),
        }),
        Effect.catchTag("PlatformError", () =>
          new AcpProviderUnauthenticatedError({ provider: "cursor" }).asEffect(),
        ),
      );

      return AcpAdapter.of({
        provider: "cursor",
        bin: "agent",
        args: ["acp"],
        env: {},
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerDroid = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      yield* ChildProcess.make("droid", ["--version"]).pipe(
        spawner.string,
        Effect.timeoutOrElse({
          duration: ACP_AUTH_CHECK_TIMEOUT,
          onTimeout: () => new AcpProviderNotInstalledError({ provider: "droid" }).asEffect(),
        }),
        Effect.catchReason("PlatformError", "NotFound", () =>
          new AcpProviderNotInstalledError({ provider: "droid" }).asEffect(),
        ),
      );

      const apiKeyOption = yield* Config.option(Config.string("FACTORY_API_KEY"));
      if (!Option.isSome(apiKeyOption) || apiKeyOption.value.trim().length === 0) {
        return yield* new AcpProviderUnauthenticatedError({ provider: "droid" });
      }

      return AcpAdapter.of({
        provider: "droid",
        bin: "droid",
        args: ["exec", "--output-format", "acp"],
        env: {},
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));

  static layerOpencode = Layer.effect(AcpAdapter)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      yield* ChildProcess.make("opencode", ["--version"]).pipe(
        spawner.string,
        Effect.timeoutOrElse({
          duration: ACP_AUTH_CHECK_TIMEOUT,
          onTimeout: () => new AcpProviderNotInstalledError({ provider: "opencode" }).asEffect(),
        }),
        Effect.catchReason("PlatformError", "NotFound", () =>
          new AcpProviderNotInstalledError({ provider: "opencode" }).asEffect(),
        ),
      );

      yield* ChildProcess.make("opencode", ["auth", "list"]).pipe(
        spawner.string,
        Effect.flatMap((output) =>
          output.trim().length > 0
            ? Effect.void
            : new AcpProviderUnauthenticatedError({ provider: "opencode" }).asEffect(),
        ),
        Effect.timeoutOrElse({
          duration: ACP_AUTH_CHECK_TIMEOUT,
          onTimeout: () => new AcpProviderUnauthenticatedError({ provider: "opencode" }).asEffect(),
        }),
        Effect.catchTag("PlatformError", () =>
          new AcpProviderUnauthenticatedError({ provider: "opencode" }).asEffect(),
        ),
      );

      return AcpAdapter.of({
        provider: "opencode",
        bin: "opencode",
        args: ["acp"],
        env: {},
      });
    }),
  ).pipe(Layer.provide(NodeServices.layer));
}
