// ============================================================================
// @inspect/workflow - Code Block (Sandboxed JS/TS Execution)
// ============================================================================

import { createContext, runInNewContext, type Context } from "node:vm";
import type { WorkflowBlock } from "@inspect/core";
import { WorkflowContext } from "../engine/context.js";
import { createLogger } from "@inspect/core";

const logger = createLogger("workflow/blocks/code");

/** Result of a code block execution */
export interface CodeBlockResult {
  output: unknown;
  logs: string[];
  duration: number;
}

/**
 * CodeBlock executes sandboxed JavaScript/TypeScript code using Node.js vm module.
 * The sandbox provides restricted globals to prevent dangerous operations
 * while still allowing useful data processing.
 */
export class CodeBlock {
  private defaultTimeout: number;
  private allowedModules: Set<string>;

  constructor(options?: { defaultTimeout?: number; allowedModules?: string[] }) {
    this.defaultTimeout = options?.defaultTimeout ?? 10_000;
    this.allowedModules = new Set(options?.allowedModules ?? []);
  }

  /**
   * Execute a code block with sandboxed JavaScript.
   *
   * The code receives:
   * - params: all context parameters
   * - context: same as params (alias)
   * - console.log/warn/error: captured to logs array
   * - Standard JS globals: JSON, Math, Date, Array, Object, etc.
   *
   * The code should set `result` or return a value from the async wrapper.
   */
  async execute(block: WorkflowBlock, context: WorkflowContext): Promise<CodeBlockResult> {
    const params = block.parameters;
    const code = context.render(String(params.code ?? ""));
    const timeout = (params.timeout as number) ?? this.defaultTimeout;
    const language = String(params.language ?? "javascript").toLowerCase();

    if (!code.trim()) {
      throw new Error("Code block requires non-empty code");
    }

    const logs: string[] = [];
    const startTime = Date.now();

    // Build restricted sandbox
    const sandbox = this.createSandbox(context, logs);
    createContext(sandbox);

    let processedCode = code;

    // For TypeScript, strip type annotations (basic transpilation)
    if (language === "typescript" || language === "ts") {
      processedCode = this.stripTypeAnnotations(code);
    }

    // Wrap code in an async IIFE that captures the return value
    const wrappedCode = `
      (async () => {
        try {
          const __fn = async () => {
            ${processedCode}
          };
          const __result = await __fn();
          if (__result !== undefined) {
            __output = __result;
          }
        } catch (e) {
          __error = e.message || String(e);
          throw e;
        }
      })()
    `;

    try {
      await runInNewContext(wrappedCode, sandbox, {
        timeout,
        filename: `code-block-${block.id}.js`,
        breakOnSigint: true,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Script execution timed out")) {
        throw new Error(`Code execution timed out after ${timeout}ms`, { cause: error });
      }
      throw new Error(`Code execution failed: ${msg}`, { cause: error });
    }

    const duration = Date.now() - startTime;

    // Get the output value - check both __output and result
    const output = sandbox.__output !== undefined ? sandbox.__output : sandbox.result;

    return { output, logs, duration };
  }

  /**
   * Create a sandboxed context with restricted globals.
   */
  private createSandbox(
    context: WorkflowContext,
    logs: string[],
  ): Context & Record<string, unknown> {
    const contextData = context.toObject();

    return {
      // Captured output
      __output: undefined,
      __error: undefined,
      result: undefined,

      // Context data
      params: { ...contextData },
      context: { ...contextData },
      data: contextData,

      // Console with capture
      console: {
        log: (...args: unknown[]) => {
          logs.push(args.map((a) => this.formatLogArg(a)).join(" "));
        },
        warn: (...args: unknown[]) => {
          logs.push(`[WARN] ${args.map((a) => this.formatLogArg(a)).join(" ")}`);
        },
        error: (...args: unknown[]) => {
          logs.push(`[ERROR] ${args.map((a) => this.formatLogArg(a)).join(" ")}`);
        },
        info: (...args: unknown[]) => {
          logs.push(`[INFO] ${args.map((a) => this.formatLogArg(a)).join(" ")}`);
        },
        debug: (...args: unknown[]) => {
          logs.push(`[DEBUG] ${args.map((a) => this.formatLogArg(a)).join(" ")}`);
        },
      },

      // Safe standard globals
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      Symbol,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      URIError,

      // Utility functions
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
      btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),

      // Structured clone
      structuredClone: (obj: unknown) => JSON.parse(JSON.stringify(obj)),

      // Timing (safe subset — setInterval is blocked to prevent long-running loops)
      setTimeout: (fn: () => void, ms: number) => {
        const capped = Math.min(ms, 10_000);
        return setTimeout(fn, capped);
      },
      clearTimeout,
      setInterval: () => {
        throw new Error(
          "setInterval is not allowed in workflow code blocks. Use setTimeout instead.",
        );
      },
      clearInterval,

      // Iterators and typed arrays
      Uint8Array,
      Int8Array,
      Uint16Array,
      Int16Array,
      Uint32Array,
      Int32Array,
      Float32Array,
      Float64Array,
      ArrayBuffer,
      DataView,
      TextEncoder,
      TextDecoder,

      // Utility helpers injected into sandbox
      sleep: (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.min(ms, 10_000))),

      // No access to:
      // - require / import (no module loading)
      // - process (no env/exit)
      // - fs, net, child_process (no I/O)
      // - global, globalThis (no escape)
      // - eval, Function constructor (no code generation beyond what vm allows)
    };
  }

  /**
   * Format a value for log output.
   */
  private formatLogArg(arg: unknown): string {
    if (typeof arg === "string") return arg;
    if (arg === undefined) return "undefined";
    if (arg === null) return "null";
    try {
      return JSON.stringify(arg, null, 2);
    } catch (error) {
      logger.debug("Failed to stringify log argument", { error });
      return String(arg);
    }
  }

  /**
   * Basic TypeScript to JavaScript transpilation.
   * Strips type annotations, interfaces, and type keywords.
   * This is a simplified approach - for full TS support, use a proper compiler.
   */
  private stripTypeAnnotations(code: string): string {
    let result = code;

    // Remove interface declarations
    result = result.replace(/interface\s+\w+\s*\{[^}]*\}/g, "");

    // Remove type alias declarations
    result = result.replace(/type\s+\w+\s*=\s*[^;]+;/g, "");

    // Remove type annotations from variables (let x: string = ...)
    result = result.replace(/((?:let|const|var)\s+\w+)\s*:\s*[^=;,)]+\s*(=)/g, "$1 $2");

    // Remove function parameter type annotations
    result = result.replace(
      /(\w+)\s*:\s*(?:string|number|boolean|any|unknown|void|never|object|Record<[^>]+>|Array<[^>]+>|\w+(?:\[\])?)\s*([,)=])/g,
      "$1$2",
    );

    // Remove return type annotations
    result = result.replace(
      /\)\s*:\s*(?:string|number|boolean|any|unknown|void|never|object|Promise<[^>]+>|Record<[^>]+>|Array<[^>]+>|\w+(?:\[\])?)\s*(\{|=>)/g,
      ") $1",
    );

    // Remove 'as Type' casts
    result = result.replace(/\s+as\s+\w+(?:<[^>]+>)?/g, "");

    // Remove angle bracket casts
    result = result.replace(/<\w+(?:<[^>]+>)?>\s*(?=\()/g, "");

    // Remove non-null assertions
    result = result.replace(/!(?=\.|\[|;|\s*[,)])/g, "");

    return result;
  }
}
