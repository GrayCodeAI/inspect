// ──────────────────────────────────────────────────────────────────────────────
// Base PageObject Class
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";

export class PageElement extends Schema.Class<PageElement>("PageElement")({
  name: Schema.String,
  selector: Schema.String,
  type: Schema.Literals(["button", "input", "link", "text", "image", "container"] as const),
}) {}

export class PageObjectConfig extends Schema.Class<PageObjectConfig>("PageObjectConfig")({
  name: Schema.String,
  url: Schema.String,
  elements: Schema.Array(PageElement),
}) {}

export class PageActionResult extends Schema.Class<PageActionResult>("PageActionResult")({
  success: Schema.Boolean,
  elementName: Schema.String,
  action: Schema.String,
  duration: Schema.Number,
  value: Schema.optional(Schema.String),
}) {}

export abstract class PageObject {
  protected config: PageObjectConfig;

  constructor(config: PageObjectConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get url(): string {
    return this.config.url;
  }

  getElement(name: string): PageElement | undefined {
    return this.config.elements.find((el) => el.name === name);
  }

  abstract navigate(): Effect.Effect<PageActionResult, never>;
  abstract click(elementName: string): Effect.Effect<PageActionResult, never>;
  abstract fill(elementName: string, value: string): Effect.Effect<PageActionResult, never>;
  abstract getText(elementName: string): Effect.Effect<string, never>;
  abstract isVisible(elementName: string): Effect.Effect<boolean, never>;
}
