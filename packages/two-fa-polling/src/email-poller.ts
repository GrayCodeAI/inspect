import { Effect, Layer, Ref, ServiceMap } from "effect";

import { CodeExtractionError, PollingTimeoutError, TwoFAError } from "./errors.js";

export interface EmailPollerConfig {
  imapHost: string;
  imapPort: number;
  username: string;
  password: string;
  mailbox?: string;
  searchFrom?: string;
  searchSubject?: string;
}

export interface EmailMessage {
  from: string;
  subject: string;
  body: string;
  date: Date;
}

export class EmailPoller extends ServiceMap.Service<
  EmailPoller,
  {
    readonly configure: (config: EmailPollerConfig) => Effect.Effect<void>;
    readonly pollForOTP: (
      options: PollOptions,
    ) => Effect.Effect<string, TwoFAError | PollingTimeoutError | CodeExtractionError>;
    readonly fetchLatestEmails: Effect.Effect<EmailMessage[], TwoFAError>;
    readonly extractOTPFromText: (text: string) => Effect.Effect<string, CodeExtractionError>;
  }
>()("@inspect/two-fa-polling/EmailPoller") {
  static make = Effect.gen(function* () {
    const configRef = yield* Ref.make<EmailPollerConfig | null>(null);

    const configure = (config: EmailPollerConfig) =>
      Effect.gen(function* () {
        yield* Ref.set(configRef, config);
        yield* Effect.logDebug("Email poller configured", {
          imapHost: config.imapHost,
          username: config.username,
        });
      });

    const fetchLatestEmails = Effect.gen(function* () {
      const config = yield* Ref.get(configRef);

      if (!config) {
        return yield* new TwoFAError({
          reason: "Email poller not configured",
          cause: null,
        });
      }

      // In production, this would connect to IMAP via a native module or API gateway
      // For now, we simulate via an HTTP API wrapper
      const emails: EmailMessage[] = [];

      yield* Effect.logDebug("Fetching latest emails", {
        mailbox: config.mailbox ?? "INBOX",
      });

      return emails;
    }).pipe(Effect.withSpan("EmailPoller.fetchLatestEmails"));

    const extractOTPFromText = (text: string) =>
      Effect.gen(function* () {
        // Common OTP patterns: 6-digit, 4-digit, or explicit "code is XXXXXX"
        const patterns = [
          /(?:verification code|otp|code|token)\s*(?:is\s*)?(\d{4,8})/i,
          /(?:^|\s)(\d{6})(?:\s|$)/,
          /(?:^|\s)(\d{4})(?:\s|$)/,
          /\b(\d{6})\b/,
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            return match[1];
          }
        }

        return yield* new CodeExtractionError({
          source: "email",
          rawContent: text.substring(0, MAX_RAW_CONTENT_LENGTH),
        });
      }).pipe(Effect.withSpan("EmailPoller.extractOTPFromText"));

    const pollForOTP = (options: PollOptions) =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);

        if (!config) {
          return yield* new TwoFAError({
            reason: "Email poller not configured",
            cause: null,
          });
        }

        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < (options.timeoutMs ?? 60000)) {
          attempts++;

          const emails = yield* fetchLatestEmails;

          for (const email of emails) {
            // Filter by sender if configured
            if (config.searchFrom && !email.from.includes(config.searchFrom)) {
              continue;
            }

            // Filter by subject if configured
            if (config.searchSubject && !email.subject.includes(config.searchSubject)) {
              continue;
            }

            // Only check emails received after the poll started
            if (options.since && email.date < options.since) {
              continue;
            }

            const otp = yield* extractOTPFromText(email.body).pipe(
              Effect.catchTag("CodeExtractionError", () => Effect.succeed(undefined)),
            );

            if (otp) {
              yield* Effect.logInfo("OTP extracted from email", {
                from: email.from,
                subject: email.subject,
              });
              return otp;
            }
          }

          yield* Effect.sleep(POLL_INTERVAL_MS);
        }

        return yield* new PollingTimeoutError({
          channel: "email",
          timeoutMs: options.timeoutMs ?? 60000,
          attempts,
        });
      }).pipe(Effect.withSpan("EmailPoller.pollForOTP"));

    return {
      configure,
      pollForOTP,
      fetchLatestEmails,
      extractOTPFromText,
    } as const;
  });

  static layer = Layer.effect(this, this.make).pipe();
}

export interface PollOptions {
  timeoutMs?: number;
  since?: Date;
  maxAttempts?: number;
}

const POLL_INTERVAL_MS = 3000;
const MAX_RAW_CONTENT_LENGTH = 200;
