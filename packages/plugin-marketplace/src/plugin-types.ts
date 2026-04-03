import { Schema } from "effect";

export const PluginHookName = Schema.Literals([
  "beforeTest",
  "afterTest",
  "beforeStep",
  "afterStep",
  "onError",
  "onAssertion",
  "onNavigation",
  "onScreenshot",
] as const);
export type PluginHookName = typeof PluginHookName.Type;

export const PluginStatus = Schema.Literals(["loaded", "active", "error", "disabled"] as const);
export type PluginStatus = typeof PluginStatus.Type;

export const PluginHook = Schema.Struct({
  name: PluginHookName,
  priority: Schema.Number,
  handler: Schema.String,
});
export interface PluginHook extends Schema.Schema.Type<typeof PluginHook> {}

export const PluginManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  description: Schema.String,
  author: Schema.String,
  hooks: Schema.Array(PluginHook),
  dependencies: Schema.Record(Schema.String, Schema.String),
  inspectVersion: Schema.String,
});
export interface PluginManifest extends Schema.Schema.Type<typeof PluginManifest> {}

export const PluginInfo = Schema.Struct({
  manifest: PluginManifest,
  status: PluginStatus,
  loadTime: Schema.Number,
  error: Schema.Option(Schema.String),
  path: Schema.String,
});
export interface PluginInfo extends Schema.Schema.Type<typeof PluginInfo> {}
