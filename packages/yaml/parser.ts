// ============================================================================
// YAML Test Parser
// ============================================================================

import { readFile } from "node:fs/promises";

/** Supported step types in a YAML test definition */
export type YAMLStepType =
  | "navigate"
  | "click"
  | "type"
  | "select"
  | "hover"
  | "scroll"
  | "wait"
  | "screenshot"
  | "assertVisible"
  | "assertHidden"
  | "assertText"
  | "assertUrl"
  | "assertTitle"
  | "assertValue"
  | "assertChecked"
  | "assertCount"
  | "lighthouse"
  | "a11y"
  | "extract"
  | "run"
  | "press"
  | "upload"
  | "download";

/** A single step in a YAML test definition */
export interface YAMLStep {
  /** Step type / action */
  action: YAMLStepType;
  /** CSS selector, XPath, or text-based target */
  selector?: string;
  /** URL for navigate, or value for type/select */
  value?: string;
  /** Text content to type or assert */
  text?: string;
  /** URL pattern to assert */
  url?: string;
  /** Wait duration in ms */
  timeout?: number;
  /** Screenshot file path */
  path?: string;
  /** Key to press */
  key?: string;
  /** Lighthouse categories */
  categories?: string[];
  /** A11y standard */
  standard?: string;
  /** Variable name to store extracted value */
  variable?: string;
  /** Description of what this step does */
  description?: string;
  /** Expected count for assertCount */
  count?: number;
  /** Scroll direction */
  direction?: "up" | "down" | "left" | "right";
  /** Scroll amount in pixels */
  amount?: number;
  /** File path for upload */
  filePath?: string;
  /** Whether to full-page screenshot */
  fullPage?: boolean;
}

/** Complete YAML test definition */
export interface TestDefinition {
  /** Test name */
  name: string;
  /** Test description */
  description?: string;
  /** Base URL for the test */
  baseUrl?: string;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Browser to use */
  browser?: "chromium" | "firefox" | "webkit";
  /** Whether to run headless */
  headless?: boolean;
  /** Default timeout for all steps */
  timeout?: number;
  /** Test tags for filtering */
  tags?: string[];
  /** Variables that can be interpolated in steps */
  variables?: Record<string, string>;
  /** Setup steps to run before main steps */
  setup?: YAMLStep[];
  /** Main test steps */
  steps: YAMLStep[];
  /** Teardown steps to run after main steps */
  teardown?: YAMLStep[];
}

/** Validation error */
export interface ValidationError {
  path: string;
  message: string;
}

// Simple YAML parser (handles the subset we need without external dependencies)
function parseYAML(text: string): unknown {
  // First try native JSON (YAML is a superset of JSON)
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to YAML parsing
  }

  const lines = text.split("\n");
  return parseYAMLLines(lines, 0, 0).value;
}

interface ParseResult {
  value: unknown;
  nextLine: number;
}

function parseYAMLLines(lines: string[], startLine: number, baseIndent: number): ParseResult {
  const result: Record<string, unknown> = {};
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const indent = line.length - trimmed.length;

    // If dedented, return
    if (indent < baseIndent) {
      return { value: result, nextLine: i };
    }

    // Array item
    if (trimmed.startsWith("- ")) {
      const arr: unknown[] = [];
      while (i < lines.length) {
        const arrLine = lines[i];
        const arrTrimmed = arrLine.trimStart();
        const arrIndent = arrLine.length - arrTrimmed.length;

        if (arrTrimmed === "" || arrTrimmed.startsWith("#")) {
          i++;
          continue;
        }
        if (arrIndent < indent) break;

        if (arrTrimmed.startsWith("- ")) {
          const itemContent = arrTrimmed.slice(2).trim();
          // Check if item has sub-properties
          if (itemContent.includes(":")) {
            const colonIdx = itemContent.indexOf(":");
            const key = itemContent.slice(0, colonIdx).trim();
            const val = itemContent.slice(colonIdx + 1).trim();
            const obj: Record<string, unknown> = {};
            obj[key] = parseYAMLValue(val);

            // Check for continuation lines
            i++;
            while (i < lines.length) {
              const subLine = lines[i];
              const subTrimmed = subLine.trimStart();
              const subIndent = subLine.length - subTrimmed.length;

              if (subTrimmed === "" || subTrimmed.startsWith("#")) {
                i++;
                continue;
              }
              if (subIndent <= indent) break;
              if (subTrimmed.startsWith("- ")) break;

              if (subTrimmed.includes(":")) {
                const subColonIdx = subTrimmed.indexOf(":");
                const subKey = subTrimmed.slice(0, subColonIdx).trim();
                const subVal = subTrimmed.slice(subColonIdx + 1).trim();
                obj[subKey] = parseYAMLValue(subVal);
              }
              i++;
            }
            arr.push(obj);
          } else {
            arr.push(parseYAMLValue(itemContent));
            i++;
          }
        } else {
          break;
        }
      }
      return { value: arr, nextLine: i };
    }

    // Key: value
    if (trimmed.includes(":")) {
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim();
      const rawVal = trimmed.slice(colonIdx + 1).trim();

      if (rawVal === "" || rawVal === "|" || rawVal === ">") {
        // Check if next lines are indented (nested object or array)
        i++;
        if (i < lines.length) {
          const nextLine = lines[i];
          const nextTrimmed = nextLine.trimStart();
          const nextIndent = nextLine.length - nextTrimmed.length;

          if (nextIndent > indent) {
            if (nextTrimmed.startsWith("- ")) {
              const sub = parseYAMLLines(lines, i, nextIndent);
              result[key] = sub.value;
              i = sub.nextLine;
            } else {
              const sub = parseYAMLLines(lines, i, nextIndent);
              result[key] = sub.value;
              i = sub.nextLine;
            }
          }
        }
      } else {
        result[key] = parseYAMLValue(rawVal);
        i++;
      }
    } else {
      i++;
    }
  }

  return { value: result, nextLine: i };
}

function parseYAMLValue(val: string): unknown {
  if (val === "true" || val === "True" || val === "TRUE") return true;
  if (val === "false" || val === "False" || val === "FALSE") return false;
  if (val === "null" || val === "~" || val === "Null" || val === "NULL") return null;
  if (val === "") return null;

  // Remove quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }

  // Try number
  const num = Number(val);
  if (!isNaN(num) && val.trim() !== "") return num;

  // Inline array
  if (val.startsWith("[") && val.endsWith("]")) {
    try {
      return JSON.parse(val);
    } catch {
      return val
        .slice(1, -1)
        .split(",")
        .map((s) => parseYAMLValue(s.trim()));
    }
  }

  return val;
}

/**
 * YAMLParser reads and validates YAML test definition files.
 */
export class YAMLParser {
  /**
   * Parse a YAML test file into a TestDefinition.
   */
  async parse(filePath: string): Promise<TestDefinition> {
    const content = await readFile(filePath, "utf-8");
    return this.parseContent(content);
  }

  /**
   * Parse YAML content string into a TestDefinition.
   */
  parseContent(content: string): TestDefinition {
    const raw = parseYAML(content) as Record<string, unknown>;
    const errors = this.validate(raw);

    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
      throw new Error(`Invalid YAML test definition:\n${errorMessages}`);
    }

    return this.transform(raw);
  }

  /**
   * Validate the raw parsed object against the test schema.
   */
  private validate(raw: Record<string, unknown>): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!raw.name && !raw.test) {
      errors.push({ path: "name", message: "Test name is required" });
    }

    if (!raw.steps || !Array.isArray(raw.steps)) {
      errors.push({ path: "steps", message: "Steps array is required" });
    } else {
      for (let i = 0; i < raw.steps.length; i++) {
        const step = raw.steps[i] as Record<string, unknown> | undefined;
        if (!step) {
          errors.push({ path: `steps[${i}]`, message: "Step cannot be empty" });
          continue;
        }
        if (!step.action && !step.type) {
          errors.push({ path: `steps[${i}].action`, message: "Step action is required" });
        }
      }
    }

    return errors;
  }

  /**
   * Transform raw parsed data into a typed TestDefinition.
   */
  private transform(raw: Record<string, unknown>): TestDefinition {
    const transformStep = (s: Record<string, unknown>): YAMLStep => ({
      action: ((s.action ?? s.type) as YAMLStepType) ?? "navigate",
      selector: s.selector as string | undefined,
      value: s.value as string | undefined,
      text: s.text as string | undefined,
      url: s.url as string | undefined,
      timeout: s.timeout as number | undefined,
      path: s.path as string | undefined,
      key: s.key as string | undefined,
      categories: s.categories as string[] | undefined,
      standard: s.standard as string | undefined,
      variable: s.variable as string | undefined,
      description: (s.description ?? s.desc) as string | undefined,
      count: s.count as number | undefined,
      direction: s.direction as "up" | "down" | "left" | "right" | undefined,
      amount: s.amount as number | undefined,
      filePath: (s.filePath ?? s.file_path ?? s.file) as string | undefined,
      fullPage: (s.fullPage ?? s.full_page) as boolean | undefined,
    });

    const steps = ((raw.steps ?? []) as Array<Record<string, unknown>>).map(transformStep);
    const setup = raw.setup
      ? (raw.setup as Array<Record<string, unknown>>).map(transformStep)
      : undefined;
    const teardown = raw.teardown
      ? (raw.teardown as Array<Record<string, unknown>>).map(transformStep)
      : undefined;

    const viewport = raw.viewport as Record<string, unknown> | undefined;

    return {
      name: ((raw.name ?? raw.test) as string) ?? "Unnamed Test",
      description: raw.description as string | undefined,
      baseUrl: (raw.baseUrl ?? raw.base_url) as string | undefined,
      viewport: viewport
        ? { width: (viewport.width as number) ?? 1280, height: (viewport.height as number) ?? 720 }
        : undefined,
      browser: raw.browser as "chromium" | "firefox" | "webkit" | undefined,
      headless: raw.headless as boolean | undefined,
      timeout: raw.timeout as number | undefined,
      tags: raw.tags as string[] | undefined,
      variables: raw.variables as Record<string, string> | undefined,
      setup,
      steps,
      teardown,
    };
  }
}
