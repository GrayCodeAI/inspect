// ============================================================================
// @inspect/workflow - Validation Block
// ============================================================================

import { runInNewContext } from "node:vm";
import type { WorkflowBlock } from "@inspect/core";
import { WorkflowContext } from "../engine/context.js";

/** Validation result */
export interface ValidationResult {
  passed: boolean;
  condition?: string;
  message: string;
  actual?: unknown;
  expected?: unknown;
  details?: Record<string, unknown>;
}

/**
 * ValidationBlock validates page state, data values, or conditions.
 * Returns a boolean result indicating whether validation passed.
 * Supports expression-based conditions, equality checks, and custom validators.
 */
export class ValidationBlock {
  private pageValidator?: (
    condition: string,
    context: WorkflowContext,
  ) => Promise<boolean>;

  /**
   * Register a page state validator (integrates with browser).
   */
  setPageValidator(
    validator: (
      condition: string,
      context: WorkflowContext,
    ) => Promise<boolean>,
  ): void {
    this.pageValidator = validator;
  }

  /**
   * Execute the validation block.
   *
   * Parameters:
   * - condition: JS expression to evaluate (uses context vars)
   * - variable: context variable to check
   * - expected: expected value for equality check
   * - operator: comparison operator (eq, ne, gt, lt, gte, lte, contains, matches, exists, type)
   * - message: custom failure message
   * - pageCondition: condition to check against page state (requires page validator)
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<ValidationResult> {
    const params = block.parameters;
    const condition = params.condition
      ? context.render(String(params.condition))
      : undefined;
    const variable = params.variable
      ? String(params.variable)
      : undefined;
    const expected = params.expected;
    const operator = String(params.operator ?? "eq");
    const customMessage = params.message
      ? context.render(String(params.message))
      : undefined;
    const pageCondition = params.pageCondition
      ? context.render(String(params.pageCondition))
      : undefined;

    // Page state validation
    if (pageCondition && this.pageValidator) {
      try {
        const passed = await this.pageValidator(pageCondition, context);
        return {
          passed,
          condition: pageCondition,
          message: passed
            ? "Page validation passed"
            : customMessage ?? `Page validation failed: ${pageCondition}`,
        };
      } catch (error) {
        return {
          passed: false,
          condition: pageCondition,
          message:
            error instanceof Error
              ? error.message
              : `Page validation error: ${String(error)}`,
        };
      }
    }

    // Variable comparison validation
    if (variable !== undefined) {
      const actual = context.get(variable);
      return this.compareValues(actual, expected, operator, variable, customMessage);
    }

    // Expression-based validation
    if (condition) {
      return this.evaluateCondition(condition, context, customMessage);
    }

    // Fallback: check lastOutput is truthy
    const lastOutput = context.get("lastOutput");
    const passed = Boolean(lastOutput);
    return {
      passed,
      message: passed
        ? "Validation passed (lastOutput is truthy)"
        : customMessage ?? "Validation failed (lastOutput is falsy)",
      actual: lastOutput,
    };
  }

  /**
   * Compare actual vs expected using the given operator.
   */
  private compareValues(
    actual: unknown,
    expected: unknown,
    operator: string,
    variableName: string,
    customMessage?: string,
  ): ValidationResult {
    let passed = false;

    switch (operator.toLowerCase()) {
      case "eq":
      case "equals":
      case "==":
        passed = this.deepEqual(actual, expected);
        break;

      case "ne":
      case "not_equals":
      case "!=":
        passed = !this.deepEqual(actual, expected);
        break;

      case "gt":
      case ">":
        passed = Number(actual) > Number(expected);
        break;

      case "lt":
      case "<":
        passed = Number(actual) < Number(expected);
        break;

      case "gte":
      case ">=":
        passed = Number(actual) >= Number(expected);
        break;

      case "lte":
      case "<=":
        passed = Number(actual) <= Number(expected);
        break;

      case "contains":
        if (typeof actual === "string" && typeof expected === "string") {
          passed = actual.includes(expected);
        } else if (Array.isArray(actual)) {
          passed = actual.includes(expected);
        }
        break;

      case "matches":
        if (typeof actual === "string" && typeof expected === "string") {
          passed = new RegExp(expected).test(actual);
        }
        break;

      case "exists":
        passed = actual !== undefined && actual !== null;
        break;

      case "not_exists":
        passed = actual === undefined || actual === null;
        break;

      case "type":
        passed = this.getTypeName(actual) === String(expected).toLowerCase();
        break;

      case "truthy":
        passed = Boolean(actual);
        break;

      case "falsy":
        passed = !actual;
        break;

      case "empty":
        passed = this.isEmpty(actual);
        break;

      case "not_empty":
        passed = !this.isEmpty(actual);
        break;

      default:
        return {
          passed: false,
          message: `Unknown operator: ${operator}`,
          actual,
          expected,
        };
    }

    return {
      passed,
      message: passed
        ? `Validation passed: ${variableName} ${operator} ${JSON.stringify(expected)}`
        : customMessage ??
          `Validation failed: ${variableName} (${JSON.stringify(actual)}) ${operator} ${JSON.stringify(expected)}`,
      actual,
      expected,
      details: { operator, variable: variableName },
    };
  }

  /**
   * Evaluate a JS expression as a condition.
   */
  private evaluateCondition(
    condition: string,
    context: WorkflowContext,
    customMessage?: string,
  ): ValidationResult {
    const sandbox = { ...context.toObject(), __result: false };

    try {
      sandbox.__result = runInNewContext(`Boolean(${condition})`, sandbox, {
        timeout: 5_000,
      });
    } catch (error) {
      return {
        passed: false,
        condition,
        message:
          error instanceof Error
            ? `Condition evaluation error: ${error.message}`
            : `Condition evaluation error: ${String(error)}`,
      };
    }

    const passed = Boolean(sandbox.__result);
    return {
      passed,
      condition,
      message: passed
        ? `Condition passed: ${condition}`
        : customMessage ?? `Condition failed: ${condition}`,
    };
  }

  /**
   * Deep equality comparison.
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === "object") {
      const strA = JSON.stringify(a);
      const strB = JSON.stringify(b);
      return strA === strB;
    }

    return false;
  }

  /**
   * Check if a value is empty.
   */
  private isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;
    return false;
  }

  /**
   * Get the type name of a value.
   */
  private getTypeName(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }
}
