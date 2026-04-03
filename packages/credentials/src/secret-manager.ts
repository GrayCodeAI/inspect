import { Schema } from "effect";
import { TOTPGenerator } from "./otp/totp.js";

export class SecretNotFoundError extends Schema.ErrorClass<SecretNotFoundError>(
  "SecretNotFoundError",
)({
  _tag: Schema.tag("SecretNotFoundError"),
  name: Schema.String,
}) {
  message = `Secret not found: ${this.name}`;
}

export class SecretExpiredError extends Schema.ErrorClass<SecretExpiredError>("SecretExpiredError")(
  {
    _tag: Schema.tag("SecretExpiredError"),
    name: Schema.String,
    expiresAt: Schema.Number,
  },
) {
  message = `Secret "${this.name}" expired at ${new Date(this.expiresAt).toISOString()}`;
}

export interface SecretEntry {
  name: string;
  value: string;
  domains: string[];
  expiresAt?: number;
  type: "password" | "token" | "2fa" | "api_key" | "cookie";
}

export interface MaskedSecretEntry {
  name: string;
  value: string;
  domains: string[];
  expiresAt?: number;
  type: "password" | "token" | "2fa" | "api_key" | "cookie";
}

export class SecretManager {
  private secrets: Map<string, SecretEntry> = new Map();

  store = (entry: SecretEntry): void => {
    this.secrets.set(entry.name, entry);
  };

  get = (name: string, url?: string): SecretEntry | null => {
    const entry = this.secrets.get(name);

    if (!entry) {
      return null;
    }

    if (url !== undefined) {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname;

      const domainMatch = entry.domains.some((allowedDomain) => {
        if (allowedDomain.startsWith("*.")) {
          const baseDomain = allowedDomain.slice(2);
          return domain.endsWith(baseDomain);
        }

        return domain === allowedDomain;
      });

      if (!domainMatch) {
        return null;
      }
    }

    if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
      return null;
    }

    return entry;
  };

  getForDomain = (domain: string): SecretEntry[] => {
    return Array.from(this.secrets.values()).filter((entry) => {
      if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
        return false;
      }

      return entry.domains.some((allowedDomain) => {
        if (allowedDomain.startsWith("*.")) {
          const baseDomain = allowedDomain.slice(2);
          return domain.endsWith(baseDomain);
        }

        return domain === allowedDomain;
      });
    });
  };

  remove = (name: string): void => {
    this.secrets.delete(name);
  };

  list = (): MaskedSecretEntry[] => {
    return Array.from(this.secrets.values()).map((entry) => ({
      ...entry,
      value: this.maskValue(entry.value),
    }));
  };

  replaceInTemplate = (template: string, url: string): string => {
    const secretTagRegex = /<secret>([^<]+)<\/secret>/g;

    return template.replace(secretTagRegex, (_match, secretName: string) => {
      const entry = this.get(secretName, url);

      if (!entry) {
        return `<secret>${secretName}</secret>`;
      }

      return entry.value;
    });
  };

  generate2FACode = async (name: string): Promise<string> => {
    const entry = this.get(name);

    if (!entry) {
      throw new SecretNotFoundError({ name });
    }

    if (entry.type !== "2fa") {
      throw new SecretNotFoundError({ name });
    }

    return TOTPGenerator.generateCode(entry.value);
  };

  maskValue = (value: string): string => {
    if (value.length <= 4) {
      return "*".repeat(value.length);
    }

    const visibleStart = value.slice(0, 2);
    const visibleEnd = value.slice(-2);
    const maskedMiddle = "*".repeat(value.length - 4);

    return `${visibleStart}${maskedMiddle}${visibleEnd}`;
  };
}
