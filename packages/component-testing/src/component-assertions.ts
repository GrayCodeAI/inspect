import type { Page } from "playwright";
import { Effect, Layer, ServiceMap } from "effect";
import { ComponentAssertionError } from "./errors.js";

export interface SnapshotData {
  readonly component: string;
  readonly dom: string;
  readonly timestamp: string;
}

export class ComponentAssertions extends ServiceMap.Service<
  ComponentAssertions,
  {
    readonly assertVisible: (
      selector: string,
    ) => Effect.Effect<void, ComponentAssertionError>;
    readonly assertHidden: (
      selector: string,
    ) => Effect.Effect<void, ComponentAssertionError>;
    readonly assertText: (
      selector: string,
      expected: string,
    ) => Effect.Effect<void, ComponentAssertionError>;
    readonly assertContainsText: (
      selector: string,
      text: string,
    ) => Effect.Effect<void, ComponentAssertionError>;
    readonly assertAttribute: (
      selector: string,
      attribute: string,
      expected: string,
    ) => Effect.Effect<void, ComponentAssertionError>;
    readonly assertCount: (
      selector: string,
      expected: number,
    ) => Effect.Effect<void, ComponentAssertionError>;
    readonly assertSnapshot: (
      component: string,
      selector: string,
      expected: string,
    ) => Effect.Effect<void, ComponentAssertionError>;
    readonly assertNoErrors: () => Effect.Effect<void, ComponentAssertionError>;
  }
>()("@component-testing/ComponentAssertions") {
  static layer = (page: Page) =>
    Layer.succeed(this, {
      assertVisible: (selector: string) =>
        assertWithLocator(page, "assertVisible", selector, "element to be visible", async (loc) => {
          const isVisible = await loc.isVisible();
          if (!isVisible) {
            return { pass: false, actual: "hidden or not found" };
          }
          return { pass: true, actual: "visible" };
        }),

      assertHidden: (selector: string) =>
        assertWithLocator(page, "assertHidden", selector, "element to be hidden", async (loc) => {
          const count = await loc.count();
          if (count === 0) return { pass: true, actual: "not found" };
          const isHidden = await loc.isHidden();
          return { pass: isHidden, actual: isHidden ? "hidden" : "visible" };
        }),

      assertText: (selector: string, expected: string) =>
        assertWithLocator(page, "assertText", selector, `text to be "${expected}"`, async (loc) => {
          const actual = await loc.textContent();
          const trimmed = actual?.trim() ?? "";
          return { pass: trimmed === expected, actual: trimmed };
        }),

      assertContainsText: (selector: string, text: string) =>
        assertWithLocator(page, "assertContainsText", selector, `text to contain "${text}"`, async (loc) => {
          const actual = await loc.textContent();
          const trimmed = actual?.trim() ?? "";
          return { pass: trimmed.includes(text), actual: trimmed };
        }),

      assertAttribute: (selector: string, attribute: string, expected: string) =>
        assertWithLocator(page, "assertAttribute", selector, `attribute "${attribute}" to be "${expected}"`, async (loc) => {
          const actual = await loc.getAttribute(attribute);
          return { pass: actual === expected, actual: actual ?? "" };
        }),

      assertCount: (selector: string, expected: number) =>
        assertWithLocator(page, "assertCount", selector, `count to be ${expected}`, async (loc) => {
          const actual = await loc.count();
          return { pass: actual === expected, actual: String(actual) };
        }),

      assertSnapshot: (component: string, selector: string, expected: string) =>
        assertWithLocator(page, "assertSnapshot", selector, "snapshot to match", async (loc) => {
          const actual = await loc.evaluate((el) => el.outerHTML);
          return { pass: actual === expected, actual };
        }),

      assertNoErrors: () =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ assertion: "assertNoErrors" });

          const errors = yield* Effect.tryPromise({
            try: () =>
              page.evaluate(() => {
                const win = window as Record<string, unknown>;
                const captured: string[] = [];
                if (win.__inspectCapturedErrors) {
                  captured.push(...win.__inspectCapturedErrors);
                }
                return captured;
              }),
            catch: (cause) =>
              new ComponentAssertionError({
                assertion: "assertNoErrors",
                expected: "no errors",
                actual: String(cause),
              }),
          });

          if (errors.length > 0) {
            return yield* Effect.fail(
              new ComponentAssertionError({
                assertion: "assertNoErrors",
                expected: "no errors",
                actual: errors.join("; "),
              }),
            );
          }
        }).pipe(Effect.withSpan("ComponentAssertions.assertNoErrors")),
    });
}

function assertWithLocator(
  page: Page,
  assertion: string,
  selector: string,
  expected: string,
  fn: (loc: ReturnType<Page["locator"]>) => Promise<{ pass: boolean; actual: string }>,
): Effect.Effect<void, ComponentAssertionError> {
  return Effect.tryPromise({
    try: async () => {
      const loc = page.locator(selector);
      const result = await fn(loc);
      if (!result.pass) {
        throw new ComponentAssertionError({
          assertion,
          expected,
          actual: result.actual,
        });
      }
    },
    catch: (cause) => {
      if (cause instanceof ComponentAssertionError) return cause;
      return new ComponentAssertionError({
        assertion,
        expected,
        actual: String(cause),
      });
    },
  }).pipe(Effect.asVoid, Effect.withSpan(`ComponentAssertions.${assertion}`));
}
