import type { Page } from "playwright";
import { Effect, Layer, ServiceMap } from "effect";
import { FrameworkDetectionError } from "./errors.js";

export type FrameworkType = "react" | "vue" | "angular" | "svelte" | "unknown";

export interface FrameworkInfo {
  readonly type: FrameworkType;
  readonly version: string;
  readonly devtools: boolean;
}

interface WindowWithFrameworks extends Window {
  React?: { version: string };
  Vue?: { version: string };
  ng?: { version?: string; coreTokens: unknown };
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown;
  __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown;
  __svelte?: { version?: string };
}

export class FrameworkDetector extends ServiceMap.Service<
  FrameworkDetector,
  {
    readonly detect: () => Effect.Effect<FrameworkInfo, FrameworkDetectionError>;
  }
>()("@component-testing/FrameworkDetector") {
  static layer = (page: Page) =>
    Layer.succeed(this, {
      detect: () =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ action: "detect" });

          const info = yield* Effect.tryPromise({
            try: () =>
              page.evaluate(() => {
                const win = window as WindowWithFrameworks;
                if (win.React?.version) {
                  return {
                    type: "react" as const,
                    version: win.React.version,
                    devtools: !!win.__REACT_DEVTOOLS_GLOBAL_HOOK__,
                  };
                }
                if (win.Vue?.version) {
                  return {
                    type: "vue" as const,
                    version: win.Vue.version,
                    devtools: !!win.__VUE_DEVTOOLS_GLOBAL_HOOK__,
                  };
                }
                if (win.ng?.coreTokens) {
                  return {
                    type: "angular" as const,
                    version: win.ng.version ?? "unknown",
                    devtools: true,
                  };
                }
                if (win.__svelte) {
                  return {
                    type: "svelte" as const,
                    version: win.__svelte.version ?? "unknown",
                    devtools: true,
                  };
                }
                return {
                  type: "unknown" as const,
                  version: "unknown",
                  devtools: false,
                };
              }),
            catch: (cause) =>
              new FrameworkDetectionError({
                url: page.url() || "unknown",
                cause: String(cause),
              }),
          });

          return info as FrameworkInfo;
        }).pipe(Effect.withSpan("FrameworkDetector.detect")),
    });
}
