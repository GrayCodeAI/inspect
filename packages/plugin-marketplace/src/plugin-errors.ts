import { Schema } from "effect";

export class PluginLoadError extends Schema.ErrorClass<PluginLoadError>("PluginLoadError")({
  _tag: Schema.tag("PluginLoadError"),
  name: Schema.String,
  version: Schema.String,
  cause: Schema.String,
}) {
  message = `Failed to load plugin ${this.name}@${this.version}: ${this.cause}`;
}

export class PluginHookError extends Schema.ErrorClass<PluginHookError>("PluginHookError")({
  _tag: Schema.tag("PluginHookError"),
  hook: Schema.String,
  plugin: Schema.String,
  cause: Schema.String,
}) {
  message = `Hook "${this.hook}" failed in plugin ${this.plugin}: ${this.cause}`;
}

export class PluginNotFoundError extends Schema.ErrorClass<PluginNotFoundError>(
  "PluginNotFoundError",
)({
  _tag: Schema.tag("PluginNotFoundError"),
  name: Schema.String,
}) {
  message = `Plugin not found: ${this.name}`;
}

export class PluginVersionConflictError extends Schema.ErrorClass<PluginVersionConflictError>(
  "PluginVersionConflictError",
)({
  _tag: Schema.tag("PluginVersionConflictError"),
  name: Schema.String,
  required: Schema.String,
  installed: Schema.String,
}) {
  message = `Plugin ${this.name} requires inspect ${this.required} but ${this.installed} is installed`;
}

export class InvalidPluginManifestError extends Schema.ErrorClass<InvalidPluginManifestError>(
  "InvalidPluginManifestError",
)({
  _tag: Schema.tag("InvalidPluginManifestError"),
  reason: Schema.String,
}) {
  message = `Invalid plugin manifest: ${this.reason}`;
}
