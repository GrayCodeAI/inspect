import { Effect, Layer, ServiceMap } from "effect";
import * as Error from "./errors.js";
import * as Types from "./types.js";

export class WorkflowExporter extends ServiceMap.Service<WorkflowExporter>()(
  "@inspect/workflow-recording/WorkflowExporter",
  {
    make: Effect.gen(function* () {
      const toJson = (workflow: Types.Workflow) =>
        Effect.gen(function* () {
          const json = JSON.stringify(workflow, null, 2);
          yield* Effect.logInfo("Workflow exported to JSON", { workflowId: workflow.id });
          return json;
        }).pipe(Effect.withSpan("WorkflowExporter.toJson"));

      const toYaml = (workflow: Types.Workflow) =>
        Effect.gen(function* () {
          // Simple YAML conversion without external dependency
          const lines: string[] = [];
          lines.push(`id: ${workflow.id}`);
          lines.push(`name: ${workflow.name}`);
          if (workflow.description) {
            lines.push(`description: ${workflow.description}`);
          }
          lines.push(`startUrl: ${workflow.startUrl}`);
          lines.push(`createdAt: ${workflow.createdAt}`);
          lines.push("events:");

          for (const event of workflow.events) {
            lines.push(`  - type: ${event.type}`);
            lines.push(`    timestamp: ${event.timestamp}`);
            lines.push(`    url: ${event.url}`);
            lines.push(`    title: ${event.title}`);

            // Add event-specific fields
            switch (event.type) {
              case "navigate":
                lines.push(`    targetUrl: ${event.targetUrl}`);
                break;
              case "click":
                lines.push(`    selector: ${event.selector}`);
                lines.push(`    x: ${event.x}`);
                lines.push(`    y: ${event.y}`);
                if (event.text) {
                  lines.push(`    text: ${event.text}`);
                }
                break;
              case "type":
                lines.push(`    selector: ${event.selector}`);
                lines.push(`    value: ${event.isPassword ? "***" : event.value}`);
                break;
              case "select":
                lines.push(`    selector: ${event.selector}`);
                lines.push(`    value: ${event.value}`);
                lines.push(`    text: ${event.text}`);
                break;
              case "scroll":
                lines.push(`    x: ${event.x}`);
                lines.push(`    y: ${event.y}`);
                break;
              case "hover":
                lines.push(`    selector: ${event.selector}`);
                break;
              case "keypress":
                lines.push(`    key: ${event.key}`);
                lines.push(`    code: ${event.code}`);
                break;
              case "wait":
                lines.push(`    durationMs: ${event.durationMs}`);
                if (event.condition) {
                  lines.push(`    condition: ${event.condition}`);
                }
                break;
              case "assertion":
                lines.push(`    assertionType: ${event.assertionType}`);
                if (event.selector) {
                  lines.push(`    selector: ${event.selector}`);
                }
                lines.push(`    expectedValue: ${event.expectedValue}`);
                break;
            }
          }

          const yaml = lines.join("\n");
          yield* Effect.logInfo("Workflow exported to YAML", { workflowId: workflow.id });
          return yaml;
        }).pipe(Effect.withSpan("WorkflowExporter.toYaml"));

      const toTypeScript = (workflow: Types.Workflow) =>
        Effect.gen(function* () {
          const lines: string[] = [];
          lines.push(`import { test, expect } from "@playwright/test";`);
          lines.push("");
          lines.push(`test("${workflow.name}", async ({ page }) => {`);
          lines.push(`  // Workflow: ${workflow.name}`);
          if (workflow.description) {
            lines.push(`  // Description: ${workflow.description}`);
          }
          lines.push(`  // Generated at: ${new Date(workflow.createdAt).toISOString()}`);
          lines.push("");

          for (const event of workflow.events) {
            switch (event.type) {
              case "navigate":
                lines.push(`  await page.goto("${event.targetUrl}");`);
                break;
              case "click":
                lines.push(`  await page.click("${event.selector}");`);
                break;
              case "type":
                if (event.isPassword) {
                  lines.push(`  await page.fill("${event.selector}", process.env.PASSWORD || "");`);
                } else {
                  lines.push(`  await page.fill("${event.selector}", "${event.value}");`);
                }
                break;
              case "select":
                lines.push(`  await page.selectOption("${event.selector}", "${event.value}");`);
                break;
              case "scroll":
                lines.push(`  await page.evaluate(() => window.scrollTo(${event.x}, ${event.y}));`);
                break;
              case "hover":
                lines.push(`  await page.hover("${event.selector}");`);
                break;
              case "keypress":
                lines.push(`  await page.keyboard.press("${event.key}");`);
                break;
              case "wait":
                if (event.condition) {
                  lines.push(`  await page.waitForSelector("${event.condition}");`);
                } else {
                  lines.push(`  await page.waitForTimeout(${event.durationMs});`);
                }
                break;
              case "assertion":
                switch (event.assertionType) {
                  case "text-present":
                    lines.push(
                      `  await expect(page.locator("body")).toContainText("${event.expectedValue}");`,
                    );
                    break;
                  case "element-visible":
                    lines.push(`  await expect(page.locator("${event.selector}")).toBeVisible();`);
                    break;
                  case "url-matches":
                    lines.push(`  await expect(page).toHaveURL(/${event.expectedValue}/);`);
                    break;
                }
                break;
            }
          }

          lines.push("});");

          const code = lines.join("\n");
          yield* Effect.logInfo("Workflow exported to TypeScript", { workflowId: workflow.id });
          return code;
        }).pipe(Effect.withSpan("WorkflowExporter.toTypeScript"));

      const toPlaywright = (workflow: Types.Workflow) =>
        Effect.gen(function* () {
          // Alias for toTypeScript with Playwright-specific output
          return yield* toTypeScript(workflow);
        }).pipe(Effect.withSpan("WorkflowExporter.toPlaywright"));

      const exportWorkflow = (workflow: Types.Workflow, format: Types.ExportFormat) =>
        Effect.gen(function* () {
          switch (format) {
            case "json":
              return yield* toJson(workflow);
            case "yaml":
              return yield* toYaml(workflow);
            case "typescript":
            case "playwright":
              return yield* toTypeScript(workflow);
            default:
              return yield* new Error.WorkflowExportError({
                workflowId: workflow.id,
                format,
                cause: `Unsupported format: ${format}`,
              });
          }
        }).pipe(Effect.withSpan("WorkflowExporter.exportWorkflow"));

      const saveToFile = (content: string, path: string) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise({
            try: async () => {
              const fs = await import("node:fs/promises");
              await fs.writeFile(path, content, "utf-8");
            },
            catch: (cause) =>
              new Error.WorkflowExportError({
                workflowId: "unknown",
                format: "file",
                cause,
              }),
          });
          yield* Effect.logInfo("Workflow saved to file", { path });
          return path;
        }).pipe(Effect.withSpan("WorkflowExporter.saveToFile"));

      return {
        toJson,
        toYaml,
        toTypeScript,
        toPlaywright,
        exportWorkflow,
        saveToFile,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
