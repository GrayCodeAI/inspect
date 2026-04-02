import { Effect, Layer, Schema, ServiceMap } from "effect";

export class CLIConfig extends Schema.Class<CLIConfig>("CLIConfig")({
  baseUrl: Schema.optional(Schema.String),
  headed: Schema.Boolean,
  debug: Schema.Boolean,
  timeout: Schema.Number,
}) {}

export class CLICommand extends Schema.Class<CLICommand>("CLICommand")({
  name: Schema.String,
  args: Schema.Array(Schema.String),
  flags: Schema.Record({ key: Schema.String, value: Schema.String }),
}) {}

export class CLIService extends ServiceMap.Service<CLIService>()("@cli/CLI", {
  make: Effect.gen(function* () {
    const execute = Effect.fn("CLI.execute")(function* (command: CLICommand) {
      yield* Effect.annotateCurrentSpan({ command: command.name });

      yield* Effect.logInfo("CLI command executed", {
        name: command.name,
        args: command.args,
      });

      return true;
    });

    const getConfig = Effect.fn("CLI.getConfig")(function* () {
      yield* Effect.annotateCurrentSpan({ action: "getConfig" });

      const config = new CLIConfig({
        baseUrl: "http://localhost:3000",
        headed: false,
        debug: false,
        timeout: 30000,
      });

      yield* Effect.logDebug("CLI config retrieved");

      return config;
    });

    const parseArgs = Effect.fn("CLI.parseArgs")(function* (args: string[]) {
      yield* Effect.annotateCurrentSpan({ args: args.join(",") });

      const command = new CLICommand({
        name: args[0] || "run",
        args: args.slice(1),
        flags: {},
      });

      yield* Effect.logDebug("CLI args parsed", { name: command.name });

      return command;
    });

    return { execute, getConfig, parseArgs } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
