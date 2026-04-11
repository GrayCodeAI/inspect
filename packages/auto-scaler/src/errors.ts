import { Schema } from "effect";

export class AutoScalerError extends Schema.ErrorClass<AutoScalerError>("AutoScalerError")({
  _tag: Schema.tag("AutoScalerError"),
  component: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Auto scaler error${this.component ? ` (${this.component})` : ""}: ${this.message}`;
  }
}
