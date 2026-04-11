import type { Page } from "playwright";
import { Effect, Layer, ServiceMap } from "effect";
import { ComponentMountError } from "./errors.js";
import { FrameworkDetector, type FrameworkType } from "./framework-detector.js";

export interface MountOptions<PropsT = Record<string, unknown>> {
  readonly component: string;
  readonly props?: PropsT;
  readonly container?: string;
  readonly framework?: FrameworkType;
  readonly waitForSelector?: string;
  readonly timeout?: number;
}

export interface MountedComponent {
  readonly id: string;
  readonly selector: string;
  readonly framework: FrameworkType;
  readonly update: (props: Record<string, unknown>) => Effect.Effect<void, ComponentMountError>;
  readonly unmount: () => Effect.Effect<void>;
}

export class ComponentMounter extends ServiceMap.Service<
  ComponentMounter,
  {
    readonly mount: <PropsT>(
      options: MountOptions<PropsT>,
    ) => Effect.Effect<MountedComponent, ComponentMountError>;
  }
>()("@component-testing/ComponentMounter") {
  static layer = (page: Page) =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const detector = yield* FrameworkDetector;
        let nextId = 0;

        const mount = <PropsT>(options: MountOptions<PropsT>) =>
          Effect.gen(function* () {
            yield* Effect.annotateCurrentSpan({
              component: options.component,
              framework: options.framework,
            });

            const framework = options.framework ?? (yield* detector.detect()).type;

            if (framework === "unknown") {
              yield* Effect.logWarning(
                "No framework detected, using generic mount",
              );
            }

            const componentId = `component-${nextId++}`;
            const containerSelector = options.container ?? "#component-root";

            // Ensure container exists in the page
            yield* Effect.tryPromise({
              try: () =>
                page.evaluate((container) => {
                  let el = document.querySelector(container) as HTMLElement | null;
                  if (!el) {
                    el = document.createElement("div");
                    el.id = container.startsWith("#") ? container.slice(1) : container;
                    document.body.appendChild(el);
                  }
                }, containerSelector),
              catch: (cause) =>
                new ComponentMountError({
                  component: options.component,
                  framework,
                  cause: String(cause),
                }),
            });

            if (options.waitForSelector) {
              yield* Effect.tryPromise({
                try: () =>
                  page.waitForSelector(options.waitForSelector!, { timeout: options.timeout }),
                catch: (cause) =>
                  new ComponentMountError({
                    component: options.component,
                    framework,
                    cause: String(cause),
                  }),
              });
            }

            return {
              id: componentId,
              selector: containerSelector,
              framework,
              update: (props: Record<string, unknown>) =>
                updateProps(page, componentId, props, framework),
              unmount: () => unmountComponent(page, componentId, containerSelector),
            } as const;
          }).pipe(
            Effect.catchTags({
              FrameworkDetectionError: Effect.die,
            }),
            Effect.withSpan("ComponentMounter.mount"),
          );

        return { mount } as const;
      }),
    ).pipe(
      Layer.provide(FrameworkDetector.layer(page)),
    );
}

function updateProps(
  page: Page,
  componentId: string,
  props: Record<string, unknown>,
  framework: FrameworkType,
): Effect.Effect<void, ComponentMountError> {
  return Effect.tryPromise({
    try: () =>
      page.evaluate(
        ({ id, props: p }) => {
          document.dispatchEvent(new CustomEvent(`inspect-update-${id}`, { detail: p }));
        },
        { id: componentId, props },
      ),
    catch: (cause) =>
      new ComponentMountError({
        component: componentId,
        framework,
        cause: String(cause),
      }),
  }).pipe(Effect.asVoid);
}

function unmountComponent(
  page: Page,
  componentId: string,
  container: string,
): Effect.Effect<void> {
  return Effect.promise(async () => {
    try {
      await page.evaluate(({ sel, id }) => {
        const el = document.querySelector(sel);
        if (el) {
          el.innerHTML = "";
          document.dispatchEvent(new CustomEvent(`inspect-unmount-${id}`));
        }
      }, { sel: container, id: componentId });
    } catch {
      // Ignore errors during unmount
    }
  });
}
