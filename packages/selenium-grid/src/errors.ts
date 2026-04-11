import { Schema } from "effect";

export class GridError extends Schema.ErrorClass<GridError>("GridError")({
  _tag: Schema.tag("GridError"),
  reason: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Selenium Grid error: ${this.reason}`;
}

export class NodeUnavailableError extends Schema.ErrorClass<NodeUnavailableError>(
  "NodeUnavailableError",
)({
  _tag: Schema.tag("NodeUnavailableError"),
  nodeId: Schema.String,
  browserName: Schema.String,
}) {
  message = `Grid node "${this.nodeId}" with browser "${this.browserName}" is unavailable`;
}

export class HubConnectionError extends Schema.ErrorClass<HubConnectionError>(
  "HubConnectionError",
)({
  _tag: Schema.tag("HubConnectionError"),
  hubUrl: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to connect to Selenium Grid hub at ${this.hubUrl}`;
}

export class SessionCreationError extends Schema.ErrorClass<SessionCreationError>(
  "SessionCreationError",
)({
  _tag: Schema.tag("SessionCreationError"),
  capabilities: Schema.Unknown,
  cause: Schema.Unknown,
}) {
  message = `Failed to create session with capabilities: ${JSON.stringify(this.capabilities)}`;
}
