import { Effect, Layer, Schema, ServiceMap } from "effect";

export class DiffHunk extends Schema.Class<DiffHunk>("DiffHunk")({
  file: Schema.String,
  addedLines: Schema.Number,
  removedLines: Schema.Number,
  content: Schema.String,
}) {}

export class ImpactedArea extends Schema.Class<ImpactedArea>("ImpactedArea")({
  type: Schema.Literals(["component", "page", "api", "style", "config"] as const),
  name: Schema.String,
  files: Schema.Array(Schema.String),
  risk: Schema.Literals(["low", "medium", "high"] as const),
}) {}

export class DiffRunner extends ServiceMap.Service<DiffRunner, {
  readonly analyze: (diff: string) => Effect.Effect<{ hunks: readonly DiffHunk[]; areas: readonly ImpactedArea[] }>;
}>()("@inspect/DiffRunner") {
  static layer = Layer.effect(this,
    Effect.gen(function* () {
      const analyze = function(diff: string): Effect.Effect<{ hunks: readonly DiffHunk[]; areas: readonly ImpactedArea[] }> {
        return Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ diffLength: diff.length });
          const hunks: DiffHunk[] = [];
          const areas: ImpactedArea[] = [];
          const filePattern = /^\+\+\+ b\/(.+)$/gm;
          let match: RegExpExecArray | null;
          while ((match = filePattern.exec(diff)) !== null) {
            const file = match[1];
            hunks.push(new DiffHunk({ file, addedLines: 0, removedLines: 0, content: "" }));
            if (file.includes("components/")) areas.push(new ImpactedArea({ type: "component", name: file, files: [file], risk: "medium" }));
            else if (file.includes("pages/") || file.includes("routes/")) areas.push(new ImpactedArea({ type: "page", name: file, files: [file], risk: "high" }));
            else if (file.includes("api/")) areas.push(new ImpactedArea({ type: "api", name: file, files: [file], risk: "high" }));
          }
          return { hunks: hunks as unknown as readonly DiffHunk[], areas: areas as unknown as readonly ImpactedArea[] };
        });
      };
      return { analyze } as const;
    }),
  );
}
