// ──────────────────────────────────────────────────────────────────────────────
// @inspect/observability - Structured Logging (Pino-compatible format)
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";

/** Log levels ordered by severity */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/** Numeric log levels for comparison */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** Pino-compatible numeric level mapping */
const PINO_LEVELS: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 100,
};

/** Structured log entry (Pino-compatible format) */
export interface LogEntry {
  /** Pino-compatible numeric level */
  level: number;
  /** ISO 8601 timestamp */
  time: number;
  /** Logger name */
  name: string;
  /** Log message */
  msg: string;
  /** Additional context data */
  [key: string]: unknown;
}

/** Logger configuration */
export interface LoggerConfig {
  /** Logger name (appears in log entries) */
  name: string;
  /** Minimum log level (default: from INSPECT_LOG_LEVEL env or "info") */
  level?: LogLevel;
  /** Log file path (default: none, stdout only) */
  filePath?: string;
  /** Whether to also log to stdout (default: true) */
  stdout?: boolean;
  /** Bound context data (included in all log entries) */
  context?: Record<string, unknown>;
  /** Pretty print instead of JSON (for development) */
  pretty?: boolean;
}

/**
 * Logger provides structured JSON logging with Pino-compatible output format.
 * Supports multiple levels, context binding, child loggers, and file output.
 */
export class Logger {
  private name: string;
  private level: LogLevel;
  private levelValue: number;
  private filePath: string | undefined;
  private stdout: boolean;
  private context: Record<string, unknown>;
  private pretty: boolean;

  constructor(config: LoggerConfig) {
    this.name = config.name;
    this.level = config.level ?? getDefaultLogLevel();
    this.levelValue = LOG_LEVEL_VALUES[this.level];
    this.filePath = config.filePath;
    this.stdout = config.stdout ?? true;
    this.context = config.context ?? {};
    this.pretty = config.pretty ?? false;

    // Ensure log directory exists
    if (this.filePath) {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Log a debug-level message.
   */
  debug(msg: string, data?: Record<string, unknown>): void {
    this.log("debug", msg, data);
  }

  /**
   * Log an info-level message.
   */
  info(msg: string, data?: Record<string, unknown>): void {
    this.log("info", msg, data);
  }

  /**
   * Log a warn-level message.
   */
  warn(msg: string, data?: Record<string, unknown>): void {
    this.log("warn", msg, data);
  }

  /**
   * Log an error-level message.
   * Accepts an Error object for stack trace capture.
   */
  error(msg: string, data?: Record<string, unknown> | Error): void {
    let logData: Record<string, unknown> | undefined;

    if (data instanceof Error) {
      logData = {
        err: {
          type: data.name,
          message: data.message,
          stack: data.stack,
        },
      };
    } else {
      logData = data;
    }

    this.log("error", msg, logData);
  }

  /**
   * Create a child logger with additional bound context.
   * The child inherits the parent's configuration and context.
   *
   * @param bindings - Additional context to bind to all child log entries
   * @returns A new Logger instance
   */
  child(bindings: Record<string, unknown>): Logger {
    return new Logger({
      name: this.name,
      level: this.level,
      filePath: this.filePath,
      stdout: this.stdout,
      pretty: this.pretty,
      context: { ...this.context, ...bindings },
    });
  }

  /**
   * Set the minimum log level at runtime.
   */
  setLevel(level: LogLevel): void {
    this.level = level;
    this.levelValue = LOG_LEVEL_VALUES[level];
  }

  /**
   * Get the current log level.
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if a level is enabled.
   */
  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= this.levelValue;
  }

  // ── Private implementation ─────────────────────────────────────────────

  private log(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>,
  ): void {
    if (LOG_LEVEL_VALUES[level] < this.levelValue) return;

    const entry: LogEntry = {
      level: PINO_LEVELS[level],
      time: Date.now(),
      name: this.name,
      msg,
      ...this.context,
      ...data,
    };

    const serialized = this.pretty
      ? this.formatPretty(level, entry)
      : JSON.stringify(entry);

    // Write to stdout
    if (this.stdout) {
      if (level === "error" || level === "warn") {
        process.stderr.write(serialized + "\n");
      } else {
        process.stdout.write(serialized + "\n");
      }
    }

    // Write to file (async, fire-and-forget)
    if (this.filePath) {
      appendFile(this.filePath, serialized + "\n", "utf-8").catch((error) => {
        // Write to stderr to avoid infinite recursion (don't call this.log())
        process.stderr.write(
          `[Logger] Failed to write to log file ${this.filePath}: ${error instanceof Error ? error.message : error}\n`,
        );
      });
    }
  }

  private formatPretty(level: LogLevel, entry: LogEntry): string {
    const time = new Date(entry.time).toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const name = entry.name;
    const msg = entry.msg;

    // Extract extra fields
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (!["level", "time", "name", "msg"].includes(key)) {
        extra[key] = value;
      }
    }

    let line = `${time} ${levelStr} [${name}] ${msg}`;
    if (Object.keys(extra).length > 0) {
      line += " " + JSON.stringify(extra);
    }

    return line;
  }
}

/**
 * Create a logger with sensible defaults.
 * Log level is read from INSPECT_LOG_LEVEL env var.
 * File logging goes to .inspect/logs/{name}.log if configured.
 *
 * @param name - Logger name (e.g. "agent", "browser", "sdk")
 * @param options - Additional configuration
 * @returns A configured Logger instance
 */
export function createLogger(
  name: string,
  options?: {
    level?: LogLevel;
    enableFileLogging?: boolean;
    pretty?: boolean;
    context?: Record<string, unknown>;
  },
): Logger {
  const level = options?.level ?? getDefaultLogLevel();
  const enableFile = options?.enableFileLogging ?? false;

  let filePath: string | undefined;
  if (enableFile) {
    const logsDir = join(process.cwd(), ".inspect", "logs");
    filePath = join(logsDir, `${name}.log`);
  }

  return new Logger({
    name,
    level,
    filePath,
    stdout: true,
    pretty: options?.pretty ?? (process.env.NODE_ENV === "development"),
    context: options?.context,
  });
}

/**
 * Get the default log level from INSPECT_LOG_LEVEL env var.
 */
function getDefaultLogLevel(): LogLevel {
  const envLevel = process.env.INSPECT_LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVEL_VALUES) {
    return envLevel as LogLevel;
  }
  return "info";
}
