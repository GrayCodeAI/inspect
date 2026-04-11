import type { Page } from "playwright";
import { Effect, FileSystem, Layer, Option, ServiceMap } from "effect";
import type { SnapshotData } from "./component-assertions.js";

export class ComponentSnapshot extends ServiceMap.Service<
  ComponentSnapshot,
  {
    readonly capture: (
      selector: string,
    ) => Effect.Effect<SnapshotData>;
    readonly load: (component: string) => Effect.Effect<Option.Option<SnapshotData>>;
    readonly save: (
      component: string,
      snapshot: SnapshotData,
    ) => Effect.Effect<void>;
    readonly compare: (
      component: string,
      current: string,
    ) => Effect.Effect<{ matches: boolean; diff?: string }>;
  }
>()("@component-testing/ComponentSnapshot") {
  static layer = (page: Page) =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const snapshotDir = ".inspect/snapshots";

        // Ensure snapshot directory exists
        yield* fs.makeDirectory(snapshotDir, { recursive: true }).pipe(
          Effect.catchTags({ PlatformError: () => Effect.void }),
        );

        const capture = (selector: string): Effect.Effect<SnapshotData> =>
          Effect.promise(async () => {
            try {
              const dom = await page.locator(selector).evaluate((el) => el.outerHTML);
              return { component: selector, dom, timestamp: new Date().toISOString() };
            } catch {
              return { component: selector, dom: "", timestamp: new Date().toISOString() };
            }
          });

        const snapshotPath = (component: string) =>
          `${snapshotDir}/${component.replace(/[^a-z0-9]/gi, "-")}.snap.json`;

        const load = (component: string): Effect.Effect<Option.Option<SnapshotData>> =>
          Effect.gen(function* () {
            const path = snapshotPath(component);
            const exists = yield* fs.exists(path);
            if (!exists) return Option.none();
            const content = yield* fs.readFileString(path);
            return Option.some(JSON.parse(content) as SnapshotData);
          }).pipe(
            Effect.catchTags({ PlatformError: () => Effect.succeed(Option.none() as Option.Option<SnapshotData>) }),
          );

        const save = (component: string, snapshot: SnapshotData): Effect.Effect<void> =>
          Effect.gen(function* () {
            const path = snapshotPath(component);
            const content = JSON.stringify(snapshot, undefined, 2);
            yield* fs.writeFile(path, Buffer.from(content, "utf-8"));
          }).pipe(
            Effect.catchTags({ PlatformError: Effect.die }),
          );

        const compare = (component: string, current: string) =>
          Effect.gen(function* () {
            const saved = yield* load(component);
            if (Option.isNone(saved)) return { matches: false, diff: "no baseline snapshot" };
            const matches = saved.value.dom === current;
            return {
              matches,
              diff: matches
                ? undefined
                : "DOM content differs from baseline",
            };
          });

        return { capture, load, save, compare } as const;
      }),
    );
}
