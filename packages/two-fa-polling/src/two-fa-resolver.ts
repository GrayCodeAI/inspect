import { Data, Effect, Layer, Match, Ref, ServiceMap } from "effect";
import { EmailPoller, type EmailPollerConfig, type PollOptions } from "./email-poller.js";
import { SMSPoller, type SMSGatewayConfig, type SMSPollOptions } from "./sms-poller.js";
import {
  CodeExtractionError,
  InvalidOTPCodeError,
  PollingTimeoutError,
  TwoFAError,
  UnsupportedChannelError,
} from "./errors.js";

export type TwoFAType = Data.TaggedEnum<{
  Email: { config: EmailPollerConfig; pollOptions?: PollOptions };
  SMS: { config: SMSGatewayConfig; pollOptions?: SMSPollOptions };
  Unknown: {};
}>;
export const TwoFAType = Data.taggedEnum<TwoFAType>();

export interface TwoFAResolution {
  type: TwoFAType;
  code: string;
  channel: "email" | "sms";
  resolvedAt: Date;
}

export class TwoFAResolver extends ServiceMap.Service<
  TwoFAResolver,
  {
    readonly detectType: (
      hint: string,
    ) => Effect.Effect<TwoFAType, TwoFAError>;
    readonly resolve: (
      type: TwoFAType,
    ) => Effect.Effect<TwoFAResolution, TwoFAError | PollingTimeoutError | CodeExtractionError>;
    readonly resolveFromEmail: (
      config: EmailPollerConfig,
      options?: PollOptions,
    ) => Effect.Effect<TwoFAResolution, TwoFAError | PollingTimeoutError | CodeExtractionError>;
    readonly resolveFromSMS: (
      config: SMSGatewayConfig,
      options?: SMSPollOptions,
    ) => Effect.Effect<TwoFAResolution, TwoFAError | PollingTimeoutError | CodeExtractionError>;
    readonly validateOTP: (
      code: string,
    ) => Effect.Effect<string, InvalidOTPCodeError>;
  }
>()("@inspect/two-fa-polling/TwoFAResolver") {
  static make = Effect.gen(function* () {
    const emailPoller = yield* EmailPoller;
    const smsPoller = yield* SMSPoller;

    const detectType = (hint: string) =>
      Effect.gen(function* () {
        const normalizedHint = hint.toLowerCase();

        // Detect based on keywords in the hint
        if (
          normalizedHint.includes("email") ||
          normalizedHint.includes("mail") ||
          normalizedHint.includes("@")
        ) {
          return TwoFAType.Email({
            config: {
              imapHost: "",
              imapPort: DEFAULT_IMAP_PORT,
              username: "",
              password: "",
            },
          });
        }

        if (
          normalizedHint.includes("sms") ||
          normalizedHint.includes("text") ||
          normalizedHint.includes("phone") ||
          /^\+?\d{10,}$/.test(normalizedHint)
        ) {
          return TwoFAType.SMS({
            provider: "twilio",
            apiUrl: "",
            apiKey: "",
          });
        }

        return TwoFAType.Unknown();
      }).pipe(Effect.withSpan("TwoFAResolver.detectType"));

    const resolveFromEmail = (config: EmailPollerConfig, options?: PollOptions) =>
      Effect.gen(function* () {
        yield* emailPoller.configure(config);

        const pollOptions: PollOptions = {
          timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          since: options?.since ?? new Date(),
          ...options,
        };

        const code = yield* emailPoller.pollForOTP(pollOptions);

        yield* validateCode(code);

        return {
          type: TwoFAType.Email({ config, pollOptions }),
          code,
          channel: "email" as const,
          resolvedAt: new Date(),
        };
      }).pipe(Effect.withSpan("TwoFAResolver.resolveFromEmail"));

    const resolveFromSMS = (config: SMSGatewayConfig, options?: SMSPollOptions) =>
      Effect.gen(function* () {
        yield* smsPoller.configure(config);

        const pollOptions: SMSPollOptions = {
          timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          since: options?.since ?? new Date(),
          ...options,
        };

        const code = yield* smsPoller.pollForOTP(pollOptions);

        yield* validateCode(code);

        return {
          type: TwoFAType.SMS({ config, pollOptions }),
          code,
          channel: "sms" as const,
          resolvedAt: new Date(),
        };
      }).pipe(Effect.withSpan("TwoFAResolver.resolveFromSMS"));

    const resolve = (type: TwoFAType) =>
      Match.value(type).pipe(
        Match.when({ _tag: "Email" }, (email) =>
          resolveFromEmail(email.config, email.pollOptions),
        ),
        Match.when({ _tag: "SMS" }, (sms) => resolveFromSMS(sms.config, sms.pollOptions)),
        Match.when({ _tag: "Unknown" }, () =>
          new TwoFAError({
            reason: "Cannot resolve 2FA: type is unknown. Provide explicit configuration.",
            cause: null,
          }).asEffect(),
        ),
        Match.exhaustive,
      );

    const validateOTP = (code: string) => validateCode(code);

    return {
      detectType,
      resolve,
      resolveFromEmail,
      resolveFromSMS,
      validateOTP,
    } as const;
  });

  static layer = Layer.effect(this, this.make).pipe(
    Layer.provide(EmailPoller.layer),
    Layer.provide(SMSPoller.layer),
  );
}

function validateCode(
  code: string,
): Effect.Effect<string, InvalidOTPCodeError> {
  // Validate OTP code format (4-8 digits)
  if (!/^\d{4,8}$/.test(code)) {
    return new InvalidOTPCodeError({
      code,
      reason: "Code must be 4-8 digits",
    }).asEffect();
  }

  return Effect.succeed(code);
}

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_IMAP_PORT = 993;
