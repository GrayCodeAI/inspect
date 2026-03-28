// ============================================================================
// @inspect/credentials - Email OTP Poller
// ============================================================================

import * as net from "node:net";
import * as tls from "node:tls";
import { createLogger } from "@inspect/observability";

const logger = createLogger("credentials/email-poll");

/** Email polling configuration */
export interface EmailPollerConfig {
  /** IMAP server hostname */
  host: string;
  /** IMAP server port (default: 993 for SSL) */
  port?: number;
  /** Use SSL/TLS (default: true) */
  secure?: boolean;
  /** Account username/email */
  username: string;
  /** Account password or app password */
  password: string;
  /** Mailbox to check (default: INBOX) */
  mailbox?: string;
  /** Polling interval in ms (default: 5000) */
  pollInterval?: number;
  /** Maximum polling duration in ms (default: 120000) */
  maxWait?: number;
  /** Regex patterns to extract OTP codes */
  patterns?: RegExp[];
  /** Only check emails received after this timestamp */
  sinceTimestamp?: number;
  /** From address filter */
  fromFilter?: string;
  /** Subject filter */
  subjectFilter?: string;
}

/** Extracted OTP result */
export interface OTPResult {
  code: string;
  source: "email";
  fromAddress?: string;
  subject?: string;
  receivedAt: number;
  extractedAt: number;
}

/** Default OTP patterns */
const DEFAULT_OTP_PATTERNS: RegExp[] = [
  /\b(\d{6})\b/,                          // 6-digit code
  /\b(\d{4})\b/,                           // 4-digit code
  /code[:\s]+(\d{4,8})/i,                  // "code: 123456"
  /verification[:\s]+(\d{4,8})/i,          // "verification: 123456"
  /OTP[:\s]+(\d{4,8})/i,                   // "OTP: 123456"
  /password[:\s]+(\d{4,8})/i,              // "password: 123456"
  /pin[:\s]+(\d{4,8})/i,                   // "pin: 1234"
  /token[:\s]+([A-Za-z0-9]{4,8})/i,        // "token: ABC123"
];

/**
 * EmailPoller polls an email inbox via IMAP to extract OTP verification
 * codes. Supports regex pattern matching, from/subject filtering, and
 * configurable polling intervals.
 */
export class EmailPoller {
  private config: Required<EmailPollerConfig>;
  private patterns: RegExp[];

  constructor(config: EmailPollerConfig) {
    this.config = {
      port: 993,
      secure: true,
      mailbox: "INBOX",
      pollInterval: 5_000,
      maxWait: 120_000,
      patterns: [],
      sinceTimestamp: Date.now(),
      fromFilter: "",
      subjectFilter: "",
      ...config,
    };
    this.patterns =
      this.config.patterns.length > 0
        ? this.config.patterns
        : DEFAULT_OTP_PATTERNS;
  }

  /**
   * Poll for an OTP code until found or timeout.
   */
  async pollForOTP(): Promise<OTPResult | null> {
    const startTime = Date.now();
    const maxWait = this.config.maxWait;

    while (Date.now() - startTime < maxWait) {
      try {
        const result = await this.checkForOTP();
        if (result) return result;
      } catch (error) {
        logger.error("Email poll error", {
          error: error instanceof Error ? error.message : error,
        });
      }

      // Wait before next poll
      await new Promise((r) => setTimeout(r, this.config.pollInterval));
    }

    return null;
  }

  /**
   * Check inbox once for OTP codes.
   */
  async checkForOTP(): Promise<OTPResult | null> {
    const emails = await this.fetchRecentEmails();

    for (const email of emails) {
      // Apply filters
      if (
        this.config.fromFilter &&
        !email.from.toLowerCase().includes(this.config.fromFilter.toLowerCase())
      ) {
        continue;
      }
      if (
        this.config.subjectFilter &&
        !email.subject
          .toLowerCase()
          .includes(this.config.subjectFilter.toLowerCase())
      ) {
        continue;
      }

      // Check if email is new enough
      if (email.date < this.config.sinceTimestamp) continue;

      // Try to extract OTP from body
      const code = this.extractOTP(email.body);
      if (code) {
        return {
          code,
          source: "email",
          fromAddress: email.from,
          subject: email.subject,
          receivedAt: email.date,
          extractedAt: Date.now(),
        };
      }

      // Also try subject line
      const subjectCode = this.extractOTP(email.subject);
      if (subjectCode) {
        return {
          code: subjectCode,
          source: "email",
          fromAddress: email.from,
          subject: email.subject,
          receivedAt: email.date,
          extractedAt: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Extract an OTP code from text using configured patterns.
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
   * Fetch recent emails via simplified IMAP.
   * This is a minimal IMAP implementation for OTP retrieval.
   */
  private fetchRecentEmails(): Promise<
    Array<{
      from: string;
      subject: string;
      body: string;
      date: number;
    }>
  > {
    return new Promise((resolve, reject) => {
      const socket = this.config.secure
        ? tls.connect({
            host: this.config.host,
            port: this.config.port,
            rejectUnauthorized: false,
          })
        : net.createConnection(this.config.port, this.config.host);

      let buffer = "";
      let step = 0;
      let tagCounter = 0;
      const emails: Array<{
        from: string;
        subject: string;
        body: string;
        date: number;
      }> = [];

      const nextTag = (): string => `A${++tagCounter}`;

      const commands = [
        () => `${nextTag()} LOGIN "${this.config.username}" "${this.config.password}"\r\n`,
        () => `${nextTag()} SELECT "${this.config.mailbox}"\r\n`,
        () => {
          const since = new Date(this.config.sinceTimestamp);
          const dateStr = since
            .toUTCString()
            .replace(/\s\d{2}:\d{2}:\d{2}\s.*/, "");
          return `${nextTag()} SEARCH SINCE "${dateStr}"\r\n`;
        },
      ];

      let fetchIds: string[] = [];
      let fetchStep = 0;
      let currentEmailData = "";
      let inFetch = false;

      socket.setEncoding("utf-8");
      socket.setTimeout(30_000);

      socket.on("data", (data: string) => {
        buffer += data;

        // Process complete lines
        while (buffer.includes("\r\n")) {
          const lineEnd = buffer.indexOf("\r\n");
          const line = buffer.substring(0, lineEnd);
          buffer = buffer.substring(lineEnd + 2);

          if (inFetch) {
            currentEmailData += line + "\n";
            if (line.includes("FLAGS") || /^A\d+\s/.test(line)) {
              inFetch = false;
              // Parse the email data
              const email = this.parseEmailData(currentEmailData);
              if (email) emails.push(email);
              currentEmailData = "";
              fetchStep++;
              if (fetchStep < fetchIds.length) {
                socket.write(
                  `${nextTag()} FETCH ${fetchIds[fetchStep]} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])\r\n`,
                );
                inFetch = true;
              } else {
                socket.write(`${nextTag()} LOGOUT\r\n`);
              }
            }
            continue;
          }

          // Check for server greeting
          if (step === 0 && line.startsWith("* OK")) {
            socket.write(commands[step]());
            step++;
            continue;
          }

          // Check for command completion
          if (/^A\d+\s+OK/.test(line)) {
            if (step < commands.length) {
              socket.write(commands[step]());
              step++;
            }
            continue;
          }

          // Parse SEARCH results
          if (line.startsWith("* SEARCH")) {
            const ids = line
              .replace("* SEARCH", "")
              .trim()
              .split(/\s+/)
              .filter(Boolean);
            // Get last 5 messages (most recent)
            fetchIds = ids.slice(-5);
            if (fetchIds.length > 0) {
              fetchStep = 0;
              socket.write(
                `${nextTag()} FETCH ${fetchIds[fetchStep]} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])\r\n`,
              );
              inFetch = true;
            } else {
              socket.write(`${nextTag()} LOGOUT\r\n`);
            }
            continue;
          }

          // Handle BYE
          if (line.startsWith("* BYE")) {
            // Server is closing
          }

          // Handle errors
          if (/^A\d+\s+(NO|BAD)/.test(line)) {
            socket.destroy();
            reject(new Error(`IMAP error: ${line}`));
            return;
          }
        }
      });

      socket.on("end", () => resolve(emails));
      socket.on("error", (err: Error) =>
        reject(new Error(`IMAP connection error: ${err.message}`)),
      );
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("IMAP connection timed out"));
      });
    });
  }

  /**
   * Parse raw email data into structured format.
   */
  private parseEmailData(
    raw: string,
  ): { from: string; subject: string; body: string; date: number } | null {
    try {
      const fromMatch = raw.match(/From:\s*(.+)/i);
      const subjectMatch = raw.match(/Subject:\s*(.+)/i);
      const dateMatch = raw.match(/Date:\s*(.+)/i);

      const from = fromMatch ? fromMatch[1].trim() : "";
      const subject = subjectMatch ? subjectMatch[1].trim() : "";
      const dateStr = dateMatch ? dateMatch[1].trim() : "";
      const date = dateStr ? new Date(dateStr).getTime() : Date.now();

      // Extract body (everything after the headers)
      const headerEnd = raw.indexOf("\n\n");
      const body = headerEnd !== -1 ? raw.substring(headerEnd + 2) : raw;

      return { from, subject, body, date };
    } catch (error) {
      logger.debug("Failed to parse email data", { error });
      return null;
    }
  }
}
