// ============================================================================
// @inspect/credentials - SMS OTP Poller
// ============================================================================

import * as http from "node:http";
import * as https from "node:https";
import { createLogger } from "@inspect/observability";

const logger = createLogger("credentials/sms-poll");

/** SMS polling configuration */
export interface SMSPollerConfig {
  /** Webhook/API URL to poll for SMS messages */
  apiUrl: string;
  /** API authentication method */
  authType: "bearer" | "api-key" | "basic" | "none";
  /** Auth token/key */
  authToken?: string;
  /** Auth username (for basic) */
  authUsername?: string;
  /** Auth password (for basic) */
  authPassword?: string;
  /** Custom auth header name */
  authHeaderName?: string;
  /** Phone number to filter (your receiving number) */
  phoneNumber?: string;
  /** Polling interval in ms (default: 5000) */
  pollInterval?: number;
  /** Maximum polling duration in ms (default: 120000) */
  maxWait?: number;
  /** Regex patterns to extract OTP codes */
  patterns?: RegExp[];
  /** Only check messages received after this timestamp */
  sinceTimestamp?: number;
  /** JSON path to messages array in API response */
  messagesPath?: string;
  /** JSON paths for message fields */
  fieldPaths?: {
    body?: string;
    from?: string;
    date?: string;
  };
}

/** Extracted SMS OTP result */
export interface SMSOTPResult {
  code: string;
  source: "sms";
  fromNumber?: string;
  messageBody: string;
  receivedAt: number;
  extractedAt: number;
}

/** Default SMS OTP patterns */
const DEFAULT_SMS_PATTERNS: RegExp[] = [
  /\b(\d{6})\b/,                            // 6-digit code
  /\b(\d{4})\b/,                             // 4-digit code
  /code[:\s]+(\d{4,8})/i,                    // "code: 123456"
  /(?:verification|verify)\s*(?:code)?[:\s]+(\d{4,8})/i,
  /OTP[:\s]+(\d{4,8})/i,
  /(?:pass|pin)[:\s]+(\d{4,8})/i,
  /is[:\s]+(\d{4,8})/i,                      // "Your code is: 123456"
];

/**
 * SMSPoller polls for SMS messages via a configurable HTTP webhook/API
 * and extracts OTP codes using regex patterns. Works with services like
 * Twilio, MessageBird, or any custom SMS gateway exposing an HTTP API.
 */
export class SMSPoller {
  private config: Required<SMSPollerConfig>;
  private patterns: RegExp[];

  constructor(config: SMSPollerConfig) {
    this.config = {
      authToken: "",
      authUsername: "",
      authPassword: "",
      authHeaderName: "X-API-Key",
      phoneNumber: "",
      pollInterval: 5_000,
      maxWait: 120_000,
      patterns: [],
      sinceTimestamp: Date.now(),
      messagesPath: "messages",
      fieldPaths: {
        body: "body",
        from: "from",
        date: "date_sent",
      },
      ...config,
    };
    this.patterns =
      this.config.patterns.length > 0
        ? this.config.patterns
        : DEFAULT_SMS_PATTERNS;
  }

  /**
   * Poll for an OTP code until found or timeout.
   */
  async pollForOTP(): Promise<SMSOTPResult | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.maxWait) {
      try {
        const result = await this.checkForOTP();
        if (result) return result;
      } catch (error) {
        logger.error("SMS poll error", {
          error: error instanceof Error ? error.message : error,
        });
      }

      await new Promise((r) => setTimeout(r, this.config.pollInterval));
    }

    return null;
  }

  /**
   * Check messages once for OTP codes.
   */
  async checkForOTP(): Promise<SMSOTPResult | null> {
    const messages = await this.fetchMessages();

    for (const message of messages) {
      // Check timestamp filter
      if (message.date < this.config.sinceTimestamp) continue;

      // Phone number filter
      if (
        this.config.phoneNumber &&
        message.from &&
        !message.from.includes(this.config.phoneNumber)
      ) {
        continue;
      }

      // Try to extract OTP
      const code = this.extractOTP(message.body);
      if (code) {
        return {
          code,
          source: "sms",
          fromNumber: message.from,
          messageBody: message.body,
          receivedAt: message.date,
          extractedAt: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Extract an OTP code from message text.
   */
  extractOTP(text: string): string | null {
    for (const pattern of this.patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Fetch messages from the SMS API.
   */
  private async fetchMessages(): Promise<
    Array<{ body: string; from: string; date: number }>
  > {
    const response = await this.httpRequest(this.config.apiUrl);
    const parsed = JSON.parse(response);

    // Navigate to messages array using configured path
    let messages = parsed;
    if (this.config.messagesPath) {
      const pathParts = this.config.messagesPath.split(".");
      for (const part of pathParts) {
        if (messages && typeof messages === "object") {
          messages = (messages as Record<string, unknown>)[part];
        }
      }
    }

    if (!Array.isArray(messages)) {
      return [];
    }

    return messages.map(
      (msg: Record<string, unknown>): {
        body: string;
        from: string;
        date: number;
      } => {
        const body = this.getNestedValue(
          msg,
          this.config.fieldPaths.body ?? "body",
        );
        const from = this.getNestedValue(
          msg,
          this.config.fieldPaths.from ?? "from",
        );
        const dateVal = this.getNestedValue(
          msg,
          this.config.fieldPaths.date ?? "date_sent",
        );

        let date: number;
        if (typeof dateVal === "number") {
          date = dateVal;
        } else if (typeof dateVal === "string") {
          date = new Date(dateVal).getTime();
        } else {
          date = Date.now();
        }

        return {
          body: String(body ?? ""),
          from: String(from ?? ""),
          date,
        };
      },
    );
  }

  /**
   * Get a nested value from an object using dot notation.
   */
  private getNestedValue(
    obj: Record<string, unknown>,
    path: string,
  ): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Make an HTTP request.
   */
  private httpRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === "https:";
      const httpModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      switch (this.config.authType) {
        case "bearer":
          if (this.config.authToken) {
            headers["Authorization"] = `Bearer ${this.config.authToken}`;
          }
          break;
        case "api-key":
          if (this.config.authToken) {
            headers[this.config.authHeaderName] = this.config.authToken;
          }
          break;
        case "basic":
          if (this.config.authUsername && this.config.authPassword) {
            headers["Authorization"] = `Basic ${Buffer.from(
              `${this.config.authUsername}:${this.config.authPassword}`,
            ).toString("base64")}`;
          }
          break;
      }

      const req = httpModule.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: "GET",
          headers,
          timeout: 15_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf-8");
            if ((res.statusCode ?? 0) >= 400) {
              reject(
                new Error(
                  `SMS API error (${res.statusCode}): ${body}`,
                ),
              );
              return;
            }
            resolve(body);
          });
        },
      );

      req.on("error", (err) =>
        reject(new Error(`SMS API request failed: ${err.message}`)),
      );
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("SMS API request timed out"));
      });
      req.end();
    });
  }
}
