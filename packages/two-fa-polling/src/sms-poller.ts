import { Effect, Layer, Ref, ServiceMap } from "effect";

import {
  CodeExtractionError,
  PollingTimeoutError,
  TwoFAError,
  UnsupportedChannelError,
} from "./errors.js";

export interface SMSGatewayConfig {
  provider: "twilio" | "vonage" | "plivo" | "custom";
  apiUrl: string;
  apiKey: string;
  apiSecret?: string;
  phoneNumber?: string;
}

export interface SMSMessage {
  from: string;
  to: string;
  body: string;
  timestamp: Date;
  messageId: string;
}

export class SMSPoller extends ServiceMap.Service<
  SMSPoller,
  {
    readonly configure: (
      config: SMSGatewayConfig,
    ) => Effect.Effect<void, TwoFAError>;
    readonly pollForOTP: (
      options: SMSPollOptions,
    ) => Effect.Effect<string, TwoFAError | PollingTimeoutError | CodeExtractionError>;
    readonly fetchLatestSMS: Effect.Effect<SMSMessage[], TwoFAError>;
    readonly extractOTPFromText: (text: string) => Effect.Effect<string, CodeExtractionError>;
  }
>()("@inspect/two-fa-polling/SMSPoller") {
  static make = Effect.gen(function* () {
    
    const configRef = yield* Ref.make<SMSGatewayConfig | null>(null);

    const configure = (config: SMSGatewayConfig) =>
      Effect.gen(function* () {
        yield* Ref.set(configRef, config);
        yield* Effect.logDebug("SMS poller configured", {
          provider: config.provider,
          phoneNumber: config.phoneNumber,
        });
      });

    const fetchLatestSMS = Effect.gen(function* () {
      const config = yield* Ref.get(configRef);

      if (!config) {
        return yield* new TwoFAError({
          reason: "SMS poller not configured",
          cause: null,
        });
      }

      // Build provider-specific API request
      const messages: SMSMessage[] = [];

      yield* Effect.logDebug("Fetching latest SMS messages", {
        provider: config.provider,
        phoneNumber: config.phoneNumber,
      });

      return messages;
    }).pipe(Effect.withSpan("SMSPoller.fetchLatestSMS"));

    const extractOTPFromText = (text: string) =>
      Effect.gen(function* () {
        // Common OTP patterns in SMS messages
        const patterns = [
          /(?:verification code|otp|code|token)\s*(?:is\s*)?(\d{4,8})/i,
          /(?:^|\s)(\d{6})(?:\s|$)/,
          /(?:^|\s)(\d{4})(?:\s|$)/,
          /\b(\d{6})\b/,
          /your\s+(?:one[- ]?time\s+)?(?:code|password|pin)\s*(?:is\s*)?(\d{4,8})/i,
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            return match[1];
          }
        }

        return yield* new CodeExtractionError({
          source: "sms",
          rawContent: text.substring(0, MAX_RAW_CONTENT_LENGTH),
        });
      }).pipe(Effect.withSpan("SMSPoller.extractOTPFromText"));

    const pollForOTP = (options: SMSPollOptions) =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);

        if (!config) {
          return yield* new TwoFAError({
            reason: "SMS poller not configured",
            cause: null,
          });
        }

        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < options.timeoutMs) {
          attempts++;

          const messages = yield* fetchLatestSMS;

          for (const message of messages) {
            // Filter by sender if configured
            if (options.from && !message.from.includes(options.from)) {
              continue;
            }

            // Filter by recipient if configured
            if (config.phoneNumber && message.to !== config.phoneNumber) {
              continue;
            }

            // Only check messages received after the poll started
            if (options.since && message.timestamp < options.since) {
              continue;
            }

            const otp = yield* extractOTPFromText(message.body).pipe(
              Effect.catchTag("CodeExtractionError", () => Effect.succeed(undefined)),
            );

            if (otp) {
              yield* Effect.logInfo("OTP extracted from SMS", {
                from: message.from,
                messageId: message.messageId,
              });
              return otp;
            }
          }

          yield* Effect.sleep(POLL_INTERVAL_MS);
        }

        return yield* new PollingTimeoutError({
          channel: "sms",
          timeoutMs: options.timeoutMs,
          attempts,
        });
      }).pipe(Effect.withSpan("SMSPoller.pollForOTP"));

    return {
      configure,
      pollForOTP,
      fetchLatestSMS,
      extractOTPFromText,
    } as const;
  });

  static layer = Layer.effect(this, this.make).pipe();
}

export interface SMSPollOptions {
  timeoutMs?: number;
  since?: Date;
  from?: string;
  maxAttempts?: number;
}

const POLL_INTERVAL_MS = 3000;
const MAX_RAW_CONTENT_LENGTH = 200;
