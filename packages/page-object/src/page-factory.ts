// ──────────────────────────────────────────────────────────────────────────────
// Page Factory Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import * as fs from "node:fs/promises";
import { PageElement, PageObject, PageObjectConfig, PageActionResult } from "./page-object.js";

export class PageFactoryConfig extends Schema.Class<PageFactoryConfig>("PageFactoryConfig")({
  format: Schema.Literals(["yaml", "json"] as const),
  path: Schema.String,
}) {}

export class PageDefinition extends Schema.Class<PageDefinition>("PageDefinition")({
  name: Schema.String,
  url: Schema.String,
  elements: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      selector: Schema.String,
      type: Schema.String,
    }),
  ),
}) {}

export interface PageFactoryService {
  readonly loadFromFile: (path: string) => Effect.Effect<PageObjectConfig, Error>;
  readonly createPageObject: (config: PageObjectConfig) => Effect.Effect<PageObject>;
  readonly fromYaml: (yamlContent: string) => Effect.Effect<PageObjectConfig, Error>;
  readonly fromJson: (jsonContent: string) => Effect.Effect<PageObjectConfig, Error>;
}

class DynamicPageObject extends PageObject {
  navigate() {
    return Effect.sync(() => {
      return new PageActionResult({
        success: true,
        elementName: "page",
        action: "navigate",
        duration: 0,
        value: this.url,
      });
    });
  }

  click(elementName: string) {
    return Effect.sync(() => {
      const element = this.getElement(elementName);
      if (!element) {
        return new PageActionResult({
          success: false,
          elementName,
          action: "click",
          duration: 0,
        });
      }
      return new PageActionResult({
        success: true,
        elementName,
        action: "click",
        duration: 0,
      });
    }).pipe(Effect.withSpan("DynamicPageObject.click"));
  }

  fill(elementName: string, value: string) {
    return Effect.sync(() => {
      const element = this.getElement(elementName);
      if (!element) {
        return new PageActionResult({
          success: false,
          elementName,
          action: "fill",
          duration: 0,
          value,
        });
      }
      return new PageActionResult({
        success: true,
        elementName,
        action: "fill",
        duration: 0,
        value,
      });
    }).pipe(Effect.withSpan("DynamicPageObject.fill"));
  }

  getText(elementName: string) {
    return Effect.sync(() => `[text:${elementName}]`).pipe(
      Effect.withSpan("DynamicPageObject.getText"),
    );
  }

  isVisible(_elementName: string) {
    return Effect.sync(() => true).pipe(Effect.withSpan("DynamicPageObject.isVisible"));
  }
}

export class PageFactory extends ServiceMap.Service<PageFactory, PageFactoryService>()(
  "@inspect/PageFactory",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const parseYaml = (yamlContent: string): Record<string, unknown> => {
        const result: Record<string, unknown> = {};
        const lines = yamlContent.split("\n");
        let currentKey: string | undefined;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;

          if (trimmed.includes(":")) {
            const [key, ...valueParts] = trimmed.split(":");
            const value = valueParts.join(":").trim();
            if (!value) {
              currentKey = key.trim();
              result[currentKey] = {};
            } else {
              if (currentKey) {
                (result[currentKey] as Record<string, unknown>)[key.trim()] = value.replace(
                  /"/g,
                  "",
                );
              } else {
                result[key.trim()] = value.replace(/"/g, "");
              }
            }
          }
        }
        return result;
      };

      const fromYaml = (yamlContent: string) =>
        Effect.sync(() => {
          const parsed = parseYaml(yamlContent);
          const elements: PageElement[] = [];

          const pageElements = parsed.elements as
            | Record<string, Record<string, string>>
            | undefined;
          if (pageElements) {
            for (const [name, props] of Object.entries(pageElements)) {
              elements.push(
                new PageElement({
                  name,
                  selector: props.selector ?? "",
                  type: (props.type as PageElement["type"]) ?? "text",
                }),
              );
            }
          }

          return new PageObjectConfig({
            name: (parsed.name as string) ?? "unnamed",
            url: (parsed.url as string) ?? "/",
            elements,
          });
        }).pipe(Effect.withSpan("PageFactory.fromYaml"));

      const fromJson = (jsonContent: string) =>
        Effect.try({
          try: () => {
            const parsed = JSON.parse(jsonContent) as PageDefinition;
            const elements = parsed.elements.map(
              (el) =>
                new PageElement({
                  name: el.name,
                  selector: el.selector,
                  type: (el.type as PageElement["type"]) ?? "text",
                }),
            );

            return new PageObjectConfig({
              name: parsed.name,
              url: parsed.url,
              elements,
            });
          },
          catch: (cause) => new Error(`Failed to parse JSON: ${String(cause)}`),
        }).pipe(Effect.withSpan("PageFactory.fromJson"));

      const loadFromFile = (path: string) =>
        Effect.gen(function* () {
          const content = yield* Effect.tryPromise({
            try: () => fs.readFile(path, "utf-8"),
            catch: (cause) => new Error(`Failed to read file: ${String(cause)}`),
          });
          const isJson = path.endsWith(".json");
          return isJson ? yield* fromJson(content) : yield* fromYaml(content);
        }).pipe(Effect.withSpan("PageFactory.loadFromFile"));

      const createPageObject = (config: PageObjectConfig) =>
        Effect.sync(() => new DynamicPageObject(config)).pipe(
          Effect.withSpan("PageFactory.createPageObject"),
        );

      return { loadFromFile, createPageObject, fromYaml, fromJson } as const;
    }),
  );
}
