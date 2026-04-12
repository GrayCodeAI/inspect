import { Schema } from "effect";

export class GherkinParseError extends Schema.ErrorClass<GherkinParseError>("GherkinParseError")({
  _tag: Schema.tag("GherkinParseError"),
  file: Schema.String,
  line: Schema.Number,
}) {
  get displayMessage(): string {
    return `Failed to parse ${this.file} at line ${this.line}`;
  }
}

export class ScenarioExecutionError extends Schema.ErrorClass<ScenarioExecutionError>(
  "ScenarioExecutionError",
)({
  _tag: Schema.tag("ScenarioExecutionError"),
  scenario: Schema.String,
  step: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Failed to execute step "${this.step}" in scenario "${this.scenario}"`;
  }
}

export class StepDefinitionNotFoundError extends Schema.ErrorClass<StepDefinitionNotFoundError>(
  "StepDefinitionNotFoundError",
)({
  _tag: Schema.tag("StepDefinitionNotFoundError"),
  stepText: Schema.String,
}) {
  get displayMessage(): string {
    return `No step definition found for "${this.stepText}"`;
  }
}
