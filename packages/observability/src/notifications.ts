// ============================================================================
// @inspect/observability - Slack & Discord Notifications
//
// Sends test result notifications to Slack and Discord via webhooks.
// No SDK dependencies — uses native fetch.
// ============================================================================

export interface NotificationConfig {
  /** Slack incoming webhook URL */
  slackWebhookUrl?: string;
  /** Discord webhook URL */
  discordWebhookUrl?: string;
  /** Only notify on failure. Default: false */
  failureOnly?: boolean;
  /** Custom channel override (Slack only) */
  channel?: string;
  /** Custom username. Default: "Inspect" */
  username?: string;
}

export interface TestNotification {
  /** Test suite or instruction name */
  title: string;
  /** Overall status */
  status: "pass" | "fail" | "error";
  /** Number of tests passed */
  passed: number;
  /** Number of tests failed */
  failed: number;
  /** Total tests */
  total: number;
  /** Total duration in ms */
  durationMs: number;
  /** URL that was tested */
  url?: string;
  /** Agent used */
  agent?: string;
  /** Device/browser */
  device?: string;
  /** Error messages from failures */
  errors?: string[];
  /** Link to full report */
  reportUrl?: string;
  /** CI build URL */
  buildUrl?: string;
}

/**
 * Notifier sends test result alerts to Slack and Discord.
 *
 * Usage:
 * ```ts
 * const notifier = new Notifier({
 *   slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
 *   discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
 * });
 * await notifier.send({ title: "Login tests", status: "fail", ... });
 * ```
 */
export class Notifier {
  private config: NotificationConfig;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  /**
   * Send notification to all configured channels.
   */
  async send(notification: TestNotification): Promise<void> {
    // Skip pass notifications if failureOnly is set
    if (this.config.failureOnly && notification.status === "pass") {
      return;
    }

    const promises: Promise<void>[] = [];

    if (this.config.slackWebhookUrl) {
      promises.push(this.sendSlack(notification));
    }

    if (this.config.discordWebhookUrl) {
      promises.push(this.sendDiscord(notification));
    }

    await Promise.allSettled(promises);
  }

  // ── Slack ────────────────────────────────────────────────────────────────

  private async sendSlack(notification: TestNotification): Promise<void> {
    const color =
      notification.status === "pass"
        ? "#22c55e"
        : notification.status === "fail"
          ? "#ef4444"
          : "#f59e0b";

    const emoji =
      notification.status === "pass"
        ? ":white_check_mark:"
        : notification.status === "fail"
          ? ":x:"
          : ":warning:";

    const fields: Array<{ title: string; value: string; short: boolean }> = [
      { title: "Status", value: `${emoji} ${notification.status.toUpperCase()}`, short: true },
      {
        title: "Results",
        value: `${notification.passed}/${notification.total} passed`,
        short: true,
      },
      { title: "Duration", value: this.fmtMs(notification.durationMs), short: true },
    ];

    if (notification.agent) {
      fields.push({ title: "Agent", value: notification.agent, short: true });
    }
    if (notification.device) {
      fields.push({ title: "Device", value: notification.device, short: true });
    }
    if (notification.url) {
      fields.push({ title: "URL", value: notification.url, short: false });
    }

    const attachments: Array<Record<string, unknown>> = [
      {
        color,
        title: notification.title,
        title_link: notification.reportUrl,
        fields,
        footer: "Inspect Testing Platform",
        ts: Math.floor(Date.now() / 1000),
      },
    ];

    // Add error details
    if (notification.errors && notification.errors.length > 0) {
      const errorText = notification.errors
        .slice(0, 5)
        .map((e) => `• ${e}`)
        .join("\n");
      attachments.push({
        color: "#ef4444",
        title: "Errors",
        text: errorText,
      });
    }

    const payload: Record<string, unknown> = {
      username: this.config.username ?? "Inspect",
      icon_emoji: ":mag:",
      attachments,
    };

    if (this.config.channel) {
      payload.channel = this.config.channel;
    }

    await this.postWebhook(this.config.slackWebhookUrl!, payload);
  }

  // ── Discord ──────────────────────────────────────────────────────────────

  private async sendDiscord(notification: TestNotification): Promise<void> {
    const color =
      notification.status === "pass"
        ? 0x22c55e
        : notification.status === "fail"
          ? 0xef4444
          : 0xf59e0b;

    const emoji =
      notification.status === "pass"
        ? "\u2705"
        : notification.status === "fail"
          ? "\u274C"
          : "\u26A0\uFE0F";

    const fields = [
      { name: "Status", value: `${emoji} ${notification.status.toUpperCase()}`, inline: true },
      {
        name: "Results",
        value: `${notification.passed}/${notification.total} passed`,
        inline: true,
      },
      { name: "Duration", value: this.fmtMs(notification.durationMs), inline: true },
    ];

    if (notification.agent) {
      fields.push({ name: "Agent", value: notification.agent, inline: true });
    }
    if (notification.device) {
      fields.push({ name: "Device", value: notification.device, inline: true });
    }
    if (notification.url) {
      fields.push({ name: "URL", value: notification.url, inline: false });
    }

    let description = "";
    if (notification.errors && notification.errors.length > 0) {
      description =
        "**Errors:**\n" +
        notification.errors
          .slice(0, 5)
          .map((e) => `- ${e}`)
          .join("\n");
    }

    const embed = {
      title: notification.title,
      url: notification.reportUrl,
      description,
      color,
      fields,
      footer: { text: "Inspect Testing Platform" },
      timestamp: new Date().toISOString(),
    };

    const payload = {
      username: this.config.username ?? "Inspect",
      embeds: [embed],
    };

    await this.postWebhook(this.config.discordWebhookUrl!, payload);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async postWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Webhook failed (${res.status}): ${body.slice(0, 200)}`);
    }
  }

  private fmtMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
  }
}
