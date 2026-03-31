// ============================================================================
// @inspect/workflow - Send Email Block
// ============================================================================

import * as net from "node:net";
import * as tls from "node:tls";
import type { WorkflowBlock } from "@inspect/core";
import { WorkflowContext } from "../engine/context.js";

/** Email send result */
export interface EmailResult {
  sent: boolean;
  to: string;
  from: string;
  subject: string;
  messageId?: string;
  smtpResponse?: string;
  error?: string;
}

/** SMTP configuration */
export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    username: string;
    password: string;
  };
  timeout: number;
}

/**
 * SendEmailBlock sends emails via SMTP using a nodemailer-like pattern
 * built on the raw net/tls modules. Supports template-based body rendering.
 */
export class SendEmailBlock {
  private defaultConfig: Partial<SMTPConfig>;

  constructor(defaultConfig?: Partial<SMTPConfig>) {
    this.defaultConfig = defaultConfig ?? {};
  }

  /**
   * Execute the email send block.
   *
   * Parameters:
   * - to: recipient email address(es), comma-separated
   * - from: sender email address
   * - subject: email subject line
   * - body: email body (HTML or text)
   * - template: optional template string with {{var}} placeholders
   * - cc: CC recipients
   * - bcc: BCC recipients
   * - replyTo: reply-to address
   * - smtpHost: SMTP server hostname
   * - smtpPort: SMTP server port (25, 465, 587)
   * - smtpSecure: use TLS (default: true for port 465)
   * - smtpUser: SMTP auth username
   * - smtpPass: SMTP auth password
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<EmailResult> {
    const params = block.parameters;

    const to = context.render(String(params.to ?? ""));
    const from = context.render(
      String(params.from ?? this.defaultConfig.host ?? "noreply@inspect.dev"),
    );
    const subject = context.render(String(params.subject ?? ""));
    const replyTo = params.replyTo
      ? context.render(String(params.replyTo))
      : undefined;
    const cc = params.cc ? context.render(String(params.cc)) : undefined;
    const bcc = params.bcc ? context.render(String(params.bcc)) : undefined;

    // Render body from template or direct body
    let body: string;
    if (params.template) {
      body = context.render(String(params.template));
    } else {
      body = context.render(String(params.body ?? ""));
    }

    if (!to) {
      throw new Error("Email block requires a 'to' address");
    }

    const smtpConfig: SMTPConfig = {
      host: context.render(
        String(params.smtpHost ?? this.defaultConfig.host ?? "localhost"),
      ),
      port:
        (params.smtpPort as number) ?? this.defaultConfig.port ?? 587,
      secure:
        (params.smtpSecure as boolean) ??
        this.defaultConfig.secure ??
        false,
      timeout:
        (params.timeout as number) ??
        this.defaultConfig.timeout ??
        30_000,
      auth: undefined,
    };

    const smtpUser = params.smtpUser
      ? context.render(String(params.smtpUser))
      : this.defaultConfig.auth?.username;
    const smtpPass = params.smtpPass
      ? context.render(String(params.smtpPass))
      : this.defaultConfig.auth?.password;

    if (smtpUser && smtpPass) {
      smtpConfig.auth = { username: smtpUser, password: smtpPass };
    }

    // Generate message ID
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@inspect.dev>`;

    // Build MIME message
    const boundary = `----inspect_${Date.now().toString(36)}`;
    const isHtml = body.includes("<") && body.includes(">");
    const date = new Date().toUTCString();

    let message = `From: ${from}\r\n`;
    message += `To: ${to}\r\n`;
    if (cc) message += `Cc: ${cc}\r\n`;
    if (replyTo) message += `Reply-To: ${replyTo}\r\n`;
    message += `Subject: ${this.encodeSubject(subject)}\r\n`;
    message += `Message-ID: ${messageId}\r\n`;
    message += `Date: ${date}\r\n`;
    message += `MIME-Version: 1.0\r\n`;

    if (isHtml) {
      message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
      message += `\r\n`;
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/plain; charset=utf-8\r\n`;
      message += `Content-Transfer-Encoding: quoted-printable\r\n`;
      message += `\r\n`;
      message += `${this.stripHtml(body)}\r\n`;
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/html; charset=utf-8\r\n`;
      message += `Content-Transfer-Encoding: quoted-printable\r\n`;
      message += `\r\n`;
      message += `${body}\r\n`;
      message += `--${boundary}--\r\n`;
    } else {
      message += `Content-Type: text/plain; charset=utf-8\r\n`;
      message += `Content-Transfer-Encoding: quoted-printable\r\n`;
      message += `\r\n`;
      message += `${body}\r\n`;
    }

    // Collect all recipients for RCPT TO
    const allRecipients = [to];
    if (cc) allRecipients.push(cc);
    if (bcc) allRecipients.push(bcc);

    const recipients = allRecipients
      .join(",")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    try {
      const response = await this.sendSMTP(
        smtpConfig,
        from,
        recipients,
        message,
      );

      return {
        sent: true,
        to,
        from,
        subject,
        messageId,
        smtpResponse: response,
      };
    } catch (error) {
      return {
        sent: false,
        to,
        from,
        subject,
        messageId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send email via SMTP protocol using raw socket.
   */
  private sendSMTP(
    config: SMTPConfig,
    from: string,
    recipients: string[],
    message: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket | tls.TLSSocket;
      let responseLog = "";
      let step = 0;
      const authenticated = false;

      const extractEmail = (addr: string): string => {
        const match = addr.match(/<([^>]+)>/);
        return match ? match[1] : addr.trim();
      };

      // Build SMTP command sequence
      const buildCommands = (): string[] => {
        const cmds: string[] = [];
        cmds.push(`EHLO inspect.dev\r\n`);

        if (config.auth && !authenticated) {
          cmds.push(`AUTH LOGIN\r\n`);
          cmds.push(
            `${Buffer.from(config.auth.username).toString("base64")}\r\n`,
          );
          cmds.push(
            `${Buffer.from(config.auth.password).toString("base64")}\r\n`,
          );
        }

        cmds.push(`MAIL FROM:<${extractEmail(from)}>\r\n`);
        for (const recipient of recipients) {
          cmds.push(`RCPT TO:<${extractEmail(recipient)}>\r\n`);
        }
        cmds.push(`DATA\r\n`);
        cmds.push(`${message}\r\n.\r\n`);
        cmds.push(`QUIT\r\n`);

        return cmds;
      };

      const onConnect = (): void => {
        const commands = buildCommands();

        const processData = (data: string): void => {
          responseLog += data;
          const code = parseInt(data.substring(0, 3), 10);

          // Check for errors
          if (code >= 500) {
            socket.destroy();
            reject(new Error(`SMTP error ${code}: ${data.trim()}`));
            return;
          }

          if (code >= 400) {
            socket.destroy();
            reject(new Error(`SMTP temporary error ${code}: ${data.trim()}`));
            return;
          }

          // Send next command
          if (step < commands.length) {
            socket.write(commands[step]);
            step++;
          }
        };

        socket.setEncoding("utf-8");
        socket.on("data", processData);
      };

      const onEnd = (): void => {
        resolve(responseLog);
      };

      const onError = (err: Error): void => {
        reject(new Error(`SMTP connection error: ${err.message}`));
      };

      const onTimeout = (): void => {
        socket.destroy();
        reject(new Error("SMTP connection timed out"));
      };

      // Create connection
      if (config.secure) {
        socket = tls.connect(
          {
            host: config.host,
            port: config.port,
            rejectUnauthorized: false,
          },
          onConnect,
        );
      } else {
        socket = net.createConnection(config.port, config.host, onConnect);
      }

      socket.setTimeout(config.timeout);
      socket.on("end", onEnd);
      socket.on("error", onError);
      socket.on("timeout", onTimeout);
    });
  }

  /**
   * Encode email subject with RFC 2047 for non-ASCII characters.
   */
  private encodeSubject(subject: string): string {
    if (/^[\x20-\x7E]*$/.test(subject)) {
      return subject;
    }
    return `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
  }

  /**
   * Strip HTML tags for plain text version.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
