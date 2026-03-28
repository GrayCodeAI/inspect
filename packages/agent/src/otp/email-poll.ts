// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Email OTP Poller
// ──────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/email-poll");

/** Email polling configuration */
export interface EmailPollConfig {
  /** Email service type */
  provider: "imap" | "gmail_api" | "mailinator" | "tempmail" | "webhook";

  /** IMAP settings */
  imap?: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    /** Mailbox to check (default: INBOX) */
    mailbox?: string;
  };

  /** Gmail API settings */
  gmail?: {
    accessToken: string;
    /** Label to search in */
    label?: string;
  };

  /** Mailinator settings */
  mailinator?: {
    apiKey: string;
    inbox: string;
    domain?: string;
  };

  /** Webhook / API endpoint settings */
  webhook?: {
    /** URL to poll for email data */
    endpoint: string;
    /** Authorization header value */
    authorization?: string;
    /** Custom headers */
    headers?: Record<string, string>;
  };

  /** Sender email to filter by */
  fromFilter?: string;
  /** Subject pattern to match */
  subjectPattern?: string;
  /** Regex to extract the OTP code from the email body */
  codePattern?: string;
}

/** Result from polling */
export interface EmailPollResult {
  /** Whether an OTP was found */
  found: boolean;
  /** The extracted OTP code */
  code?: string;
  /** Email subject */
  subject?: string;
  /** Email sender */
  from?: string;
  /** Email body text */
  body?: string;
  /** When the email was received */
  receivedAt?: number;
  /** How long polling took (ms) */
  elapsed: number;
}

/**
 * Polls for OTP codes delivered via email.
 *
 * Supports multiple email providers and extraction patterns.
 * Used for handling email-based 2FA during automated test flows.
 */
export class EmailPoller {
  private config: EmailPollConfig;
  private defaultCodePattern = /\b(\d{4,8})\b/;

  constructor(config: EmailPollConfig) {
    this.config = config;

    if (config.codePattern) {
      this.defaultCodePattern = new RegExp(config.codePattern);
    }
  }

  /**
   * Poll for an OTP email and extract the code.
   *
   * @param timeout - Maximum time to wait in ms (default: 60000)
   * @param pollInterval - Time between polls in ms (default: 3000)
   */
  async poll(timeout: number = 60_000, pollInterval: number = 3_000): Promise<EmailPollResult> {
    const start = Date.now();
    const startTime = new Date(start - 5000); // Look back 5 seconds

    while (Date.now() - start < timeout) {
      try {
        const result = await this.checkForEmail(startTime);

        if (result.found) {
          return {
            ...result,
            elapsed: Date.now() - start,
          };
        }
      } catch (error) {
        // Log but continue polling
        logger.warn("Email poll error", { error });
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return {
      found: false,
      elapsed: Date.now() - start,
    };
  }

  /**
   * Extract an OTP code from email body text.
   */
  extractCode(body: string): string | null {
    // Try configured pattern first
    const match = body.match(this.defaultCodePattern);
    if (match) {
      return match[1] ?? match[0];
    }

    // Try common OTP patterns
    const patterns = [
      /verification code[:\s]+(\d{4,8})/i,
      /one-time (?:password|code|pin)[:\s]+(\d{4,8})/i,
      /otp[:\s]+(\d{4,8})/i,
      /code[:\s]+(\d{4,8})/i,
      /pin[:\s]+(\d{4,8})/i,
      /\b(\d{6})\b/,  // Common 6-digit code
    ];

    for (const pattern of patterns) {
      const m = body.match(pattern);
      if (m) {
        return m[1] ?? m[0];
      }
    }

    return null;
  }

  // ── Provider-specific implementations ─────────────────────────────────

  private async checkForEmail(since: Date): Promise<EmailPollResult> {
    switch (this.config.provider) {
      case "gmail_api":
        return this.checkGmail(since);
      case "mailinator":
        return this.checkMailinator(since);
      case "webhook":
        return this.checkWebhook(since);
      case "imap":
        return this.checkIMAP(since);
      case "tempmail":
        return this.checkWebhook(since); // Temp mail services usually have an API
      default:
        throw new Error(`Unsupported email provider: ${this.config.provider}`);
    }
  }

  private async checkGmail(since: Date): Promise<EmailPollResult> {
    const gmail = this.config.gmail;
    if (!gmail) throw new Error("Gmail config not provided");

    const query = this.buildGmailQuery(since);
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${gmail.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>;
    };

    if (!data.messages?.length) {
      return { found: false, elapsed: 0 };
    }

    // Fetch the most recent matching message
    const messageId = data.messages[0].id;
    const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

    const msgResponse = await fetch(msgUrl, {
      headers: { Authorization: `Bearer ${gmail.accessToken}` },
    });

    if (!msgResponse.ok) {
      return { found: false, elapsed: 0 };
    }

    const msg = (await msgResponse.json()) as {
      snippet: string;
      payload: {
        headers: Array<{ name: string; value: string }>;
        body?: { data?: string };
        parts?: Array<{ body?: { data?: string }; mimeType: string }>;
      };
    };

    const subject = msg.payload.headers.find((h) => h.name === "Subject")?.value;
    const from = msg.payload.headers.find((h) => h.name === "From")?.value;

    // Decode body
    let body = msg.snippet;
    const textPart = msg.payload.parts?.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    } else if (msg.payload.body?.data) {
      body = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
    }

    const code = this.extractCode(body);

    return {
      found: !!code,
      code: code ?? undefined,
      subject,
      from,
      body,
      receivedAt: Date.now(),
      elapsed: 0,
    };
  }

  private async checkMailinator(since: Date): Promise<EmailPollResult> {
    const mailinator = this.config.mailinator;
    if (!mailinator) throw new Error("Mailinator config not provided");

    const domain = mailinator.domain ?? "mailinator.com";
    const url = `https://mailinator.com/api/v2/domains/${domain}/inboxes/${mailinator.inbox}`;

    const response = await fetch(url, {
      headers: { Authorization: mailinator.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Mailinator API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      msgs: Array<{
        id: string;
        subject: string;
        from: string;
        time: number;
      }>;
    };

    // Filter messages after 'since'
    const sinceMs = since.getTime();
    const recentMsgs = data.msgs.filter((m) => m.time > sinceMs);

    // Apply filters
    const filtered = recentMsgs.filter((m) => {
      if (this.config.fromFilter && !m.from.includes(this.config.fromFilter)) return false;
      if (this.config.subjectPattern && !m.subject.match(this.config.subjectPattern)) return false;
      return true;
    });

    if (filtered.length === 0) {
      return { found: false, elapsed: 0 };
    }

    // Fetch most recent matching message body
    const msgId = filtered[0].id;
    const bodyUrl = `https://mailinator.com/api/v2/domains/${domain}/inboxes/${mailinator.inbox}/messages/${msgId}`;

    const bodyResponse = await fetch(bodyUrl, {
      headers: { Authorization: mailinator.apiKey },
    });

    if (!bodyResponse.ok) {
      return { found: false, elapsed: 0 };
    }

    const msgData = (await bodyResponse.json()) as {
      parts: Array<{ body: string }>;
    };

    const body = msgData.parts.map((p) => p.body).join("\n");
    const code = this.extractCode(body);

    return {
      found: !!code,
      code: code ?? undefined,
      subject: filtered[0].subject,
      from: filtered[0].from,
      body,
      receivedAt: filtered[0].time,
      elapsed: 0,
    };
  }

  private async checkWebhook(since: Date): Promise<EmailPollResult> {
    const webhook = this.config.webhook;
    if (!webhook) throw new Error("Webhook config not provided");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...webhook.headers,
    };

    if (webhook.authorization) {
      headers.Authorization = webhook.authorization;
    }

    const response = await fetch(webhook.endpoint, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`Webhook API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      emails?: Array<{
        subject?: string;
        from?: string;
        body?: string;
        text?: string;
        receivedAt?: string | number;
      }>;
    };

    const emails = data.emails ?? [];
    const sinceMs = since.getTime();

    for (const email of emails) {
      const emailTime = email.receivedAt
        ? new Date(email.receivedAt).getTime()
        : Date.now();

      if (emailTime < sinceMs) continue;

      if (this.config.fromFilter && email.from && !email.from.includes(this.config.fromFilter)) continue;
      if (this.config.subjectPattern && email.subject && !email.subject.match(this.config.subjectPattern)) continue;

      const body = email.body ?? email.text ?? "";
      const code = this.extractCode(body);

      if (code) {
        return {
          found: true,
          code,
          subject: email.subject,
          from: email.from,
          body,
          receivedAt: emailTime,
          elapsed: 0,
        };
      }
    }

    return { found: false, elapsed: 0 };
  }

  private async checkIMAP(_since: Date): Promise<EmailPollResult> {
    // IMAP requires a TCP connection library; for now, suggest using
    // the webhook provider as a bridge, or implementing with nodemailer
    throw new Error(
      "Direct IMAP polling requires a TCP library. " +
      "Consider using a webhook bridge service or the gmail_api provider instead.",
    );
  }

  private buildGmailQuery(since: Date): string {
    const parts: string[] = [];
    parts.push(`after:${Math.floor(since.getTime() / 1000)}`);

    if (this.config.fromFilter) {
      parts.push(`from:${this.config.fromFilter}`);
    }

    if (this.config.subjectPattern) {
      parts.push(`subject:${this.config.subjectPattern}`);
    }

    return parts.join(" ");
  }
}
