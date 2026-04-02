import { Effect, Layer, Schema, ServiceMap } from "effect";

export class ToolDefinition extends Schema.Class<ToolDefinition>("ToolDefinition")({
  name: Schema.String,
  description: Schema.String,
  parameters: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
      required: Schema.Boolean,
    }),
  ),
}) {}

export class ToolRegistryService extends ServiceMap.Service<ToolRegistryService>()(
  "@tools/Registry",
  {
    make: Effect.gen(function* () {
      const register = Effect.fn("Registry.register")(function* (tool: ToolDefinition) {
        yield* Effect.annotateCurrentSpan({ toolName: tool.name });

        yield* Effect.logInfo("Tool registered", { name: tool.name });

        return true;
      });

      const get = Effect.fn("Registry.get")(function* (name: string) {
        yield* Effect.annotateCurrentSpan({ name });

        const tool = new ToolDefinition({
          name,
          description: `Tool ${name}`,
          parameters: [],
        });

        return tool;
      });

      const list = Effect.fn("Registry.list")(function* () {
        yield* Effect.annotateCurrentSpan({ action: "list" });

        const tools = [
          new ToolDefinition({
            name: "click",
            description: "Click on an element",
            parameters: [{ name: "selector", type: "string", required: true }],
          }),
          new ToolDefinition({
            name: "type",
            description: "Type text into an element",
            parameters: [
              { name: "selector", type: "string", required: true },
              { name: "text", type: "string", required: true },
            ],
          }),
        ];

        yield* Effect.logDebug("Tools listed", { count: tools.length });

        return tools;
      });

      return { register, get, list } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
