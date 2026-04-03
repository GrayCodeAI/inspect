import type { Page } from "playwright";
import { Schema } from "effect";

export interface ReplayableAction {
  readonly type: string;
  readonly selector: string;
  readonly value: string;
  readonly options: Record<string, unknown>;
  readonly timestamp: number;
}

export interface CachedAction extends ReplayableAction {
  readonly cacheKey: string;
  readonly hitCount: number;
  readonly lastAccessed: number;
}

export class ReplayableActionSchema extends Schema.Class<ReplayableActionSchema>(
  "ReplayableAction",
)({
  type: Schema.String,
  selector: Schema.String,
  value: Schema.String,
  options: Schema.Record(Schema.String, Schema.Unknown),
  timestamp: Schema.Number,
}) {}

export class CachedActionSchema extends Schema.Class<CachedActionSchema>("CachedAction")({
  type: Schema.String,
  selector: Schema.String,
  value: Schema.String,
  options: Schema.Record(Schema.String, Schema.Unknown),
  timestamp: Schema.Number,
  cacheKey: Schema.String,
  hitCount: Schema.Number,
  lastAccessed: Schema.Number,
}) {}

export const replayAction = (action: ReplayableAction, page: Page) => {
  const execute = async () => {
    switch (action.type) {
      case "click": {
        await page.click(action.selector);
        break;
      }
      case "fill": {
        await page.fill(action.selector, action.value);
        break;
      }
      case "type": {
        await page.type(action.selector, action.value);
        break;
      }
      case "select": {
        await page.selectOption(action.selector, action.value);
        break;
      }
      case "check": {
        await page.check(action.selector);
        break;
      }
      case "uncheck": {
        await page.uncheck(action.selector);
        break;
      }
      case "press": {
        await page.press(action.selector, action.value);
        break;
      }
      case "hover": {
        await page.hover(action.selector);
        break;
      }
      case "navigate": {
        await page.goto(action.value);
        break;
      }
      default: {
        throw new Error(`Unsupported action type: ${action.type}`);
      }
    }
  };
  return execute();
};

export const actionToReplayable = (input: {
  action: string;
  target?: string;
  value?: string;
}): ReplayableAction => {
  return {
    type: input.action,
    selector: input.target ?? "",
    value: input.value ?? "",
    options: {},
    timestamp: Date.now(),
  };
};
