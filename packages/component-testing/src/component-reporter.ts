import { Effect, ServiceMap, Layer } from "effect";

export interface ComponentTestResult {
  readonly component: string;
  readonly framework: string;
  readonly passed: number;
  readonly failed: number;
  readonly assertions: ComponentAssertionResult[];
  readonly duration: number;
}

export interface ComponentAssertionResult {
  readonly assertion: string;
  readonly selector: string;
  readonly passed: boolean;
  readonly error?: string;
}

export class ComponentReporter extends ServiceMap.Service<
  ComponentReporter,
  {
    readonly report: (
      results: readonly ComponentTestResult[],
    ) => Effect.Effect<string>;
    readonly reportSummary: (
      results: readonly ComponentTestResult[],
    ) => Effect.Effect<string>;
    readonly reportJSON: (
      results: readonly ComponentTestResult[],
    ) => Effect.Effect<string>;
  }
>()("@component-testing/ComponentReporter") {
  static layer = Layer.succeed(this, {
    report: (results: readonly ComponentTestResult[]) =>
      Effect.sync(() => {
        const total = results.length;
        const passed = results.filter((r) => r.failed === 0).length;
        const failed = total - passed;
        const totalAssertions = results.reduce(
          (sum, r) => sum + r.passed + r.failed,
          0,
        );
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

        return [
          "Component Test Results",
          "=".repeat(50),
          "",
          `Total:     ${total}`,
          `Passed:    ${passed}`,
          `Failed:    ${failed}`,
          `Assertions: ${totalAssertions}`,
          `Duration:  ${(totalDuration / 1000).toFixed(2)}s`,
          "",
          ...results.flatMap((r) => [
            `${r.passed ? "✓" : "✗"} ${r.component} (${r.framework})`,
            `  ${r.passed}/${r.passed + r.failed} assertions passed`,
            `  ${(r.duration / 1000).toFixed(2)}s`,
            ...r.assertions
              .filter((a) => !a.passed)
              .map((a) => `  ✗ ${a.assertion} (${a.selector}): ${a.error}`),
            "",
          ]),
        ].join("\n");
      }),

    reportSummary: (results: readonly ComponentTestResult[]) =>
      Effect.sync(() => {
        const total = results.length;
        const passed = results.filter((r) => r.failed === 0).length;
        return `${passed}/${total} component tests passed`;
      }),

    reportJSON: (results: readonly ComponentTestResult[]) =>
      Effect.sync(() => JSON.stringify(results, undefined, 2)),
  });
}
