/**
 * Slack Notifications
 *
 * Send test results and alerts to Slack channels.
 */

export interface SlackConfig {
  webhookUrl?: string;
  botToken?: string;
  channel: string;
  username: string;
  iconEmoji: string;
  includeScreenshots: boolean;
  includeTraces: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  mentionOnFailure?: string;
}

export interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface SlackBlock {
  type: "header" | "section" | "divider" | "context" | "actions";
  text?: { type: "plain_text" | "mrkdwn"; text: string };
  fields?: Array<{ type: "plain_text" | "mrkdwn"; text: string }>;
  elements?: unknown[];
}

export interface SlackAttachment {
  color: "good" | "warning" | "danger";
  title: string;
  text: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  footer?: string;
  ts?: number;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration: number;
  branch?: string;
  commit?: string;
  runUrl?: string;
}

export const DEFAULT_SLACK_CONFIG: SlackConfig = {
  channel: "#test-results",
  username: "Inspect Bot",
  iconEmoji: ":mag:",
  includeScreenshots: false,
  includeTraces: true,
  notifyOnSuccess: false,
  notifyOnFailure: true,
};

export class SlackNotifier {
  private config: SlackConfig;

  constructor(config: Partial<SlackConfig> = {}) {
    this.config = { ...DEFAULT_SLACK_CONFIG, ...config };
  }

  /**
   * Send test results notification
   */
  async sendResults(summary: TestSummary): Promise<void> {
    if (summary.failed === 0 && !this.config.notifyOnSuccess) return;
    if (summary.failed > 0 && !this.config.notifyOnFailure) return;

    const message = this.buildMessage(summary);

    if (this.config.webhookUrl) {
      await this.sendWebhook(message);
    } else if (this.config.botToken) {
      await this.sendApi(message);
    }
  }

  /**
   * Build Slack message
   */
  private buildMessage(summary: TestSummary): SlackMessage {
    const status = summary.failed === 0 ? "success" : "failure";
    const _color = status === "success" ? "good" : "danger";
    const emoji = status === "success" ? ":white_check_mark:" : ":x:";

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} Test Results: ${status === "success" ? "Passed" : "Failed"}`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Total:*\n${summary.total}` },
          { type: "mrkdwn", text: `*Passed:*\n${summary.passed} ✅` },
          { type: "mrkdwn", text: `*Failed:*\n${summary.failed} ❌` },
          { type: "mrkdwn", text: `*Duration:*\n${(summary.duration / 1000).toFixed(2)}s` },
        ],
      },
    ];

    if (summary.branch) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `Branch: *${summary.branch}*` }],
      });
    }

    if (summary.runUrl) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Run" },
            url: summary.runUrl,
          },
        ],
      });
    }

    return { blocks };
  }

  /**
   * Send via webhook
   */
  private async sendWebhook(message: SlackMessage): Promise<void> {
    if (!this.config.webhookUrl) return;

    await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...message,
        username: this.config.username,
        icon_emoji: this.config.iconEmoji,
        channel: this.config.channel,
      }),
    });
  }

  /**
   * Send via API
   */
  private async sendApi(_message: SlackMessage): Promise<void> {
    // Would use Slack Web API with bot token
    // chat.postMessage endpoint
  }
}

export function createSlackNotifier(config?: Partial<SlackConfig>): SlackNotifier {
  return new SlackNotifier(config);
}
