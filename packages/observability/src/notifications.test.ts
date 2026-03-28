import { describe, it, expect, vi, beforeEach } from "vitest";
import { Notifier } from "./notifications.js";
import type { TestNotification } from "./notifications.js";

describe("Notifier", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
  });

  function makeNotification(overrides: Partial<TestNotification> = {}): TestNotification {
    return {
      title: "Login Tests",
      status: "pass",
      passed: 5,
      failed: 0,
      total: 5,
      durationMs: 12000,
      ...overrides,
    };
  }

  it("sends to Slack webhook", async () => {
    const notifier = new Notifier({ slackWebhookUrl: "https://hooks.slack.com/test" });
    await notifier.send(makeNotification());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/test");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.username).toBe("Inspect");
    expect(body.attachments).toBeDefined();
    expect(body.attachments[0].title).toBe("Login Tests");
  });

  it("sends to Discord webhook", async () => {
    const notifier = new Notifier({ discordWebhookUrl: "https://discord.com/api/webhooks/test" });
    await notifier.send(makeNotification());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/webhooks/test");

    const body = JSON.parse(opts.body);
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe("Login Tests");
  });

  it("sends to both Slack and Discord", async () => {
    const notifier = new Notifier({
      slackWebhookUrl: "https://hooks.slack.com/test",
      discordWebhookUrl: "https://discord.com/api/webhooks/test",
    });
    await notifier.send(makeNotification());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips pass notifications when failureOnly is set", async () => {
    const notifier = new Notifier({
      slackWebhookUrl: "https://hooks.slack.com/test",
      failureOnly: true,
    });

    await notifier.send(makeNotification({ status: "pass" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await notifier.send(makeNotification({ status: "fail", failed: 2 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes error details in Slack message", async () => {
    const notifier = new Notifier({ slackWebhookUrl: "https://hooks.slack.com/test" });
    await notifier.send(makeNotification({
      status: "fail",
      failed: 1,
      errors: ["Element not found: #login-btn"],
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.attachments.length).toBe(2);
    expect(body.attachments[1].text).toContain("Element not found");
  });

  it("includes optional fields in notification", async () => {
    const notifier = new Notifier({ slackWebhookUrl: "https://hooks.slack.com/test" });
    await notifier.send(makeNotification({
      url: "https://example.com",
      agent: "claude",
      device: "desktop-chrome",
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const fields = body.attachments[0].fields;
    const fieldTitles = fields.map((f: { title: string }) => f.title);
    expect(fieldTitles).toContain("Agent");
    expect(fieldTitles).toContain("Device");
    expect(fieldTitles).toContain("URL");
  });

  it("does nothing when no webhooks configured", async () => {
    const notifier = new Notifier({});
    await notifier.send(makeNotification());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses custom username and channel", async () => {
    const notifier = new Notifier({
      slackWebhookUrl: "https://hooks.slack.com/test",
      username: "TestBot",
      channel: "#testing",
    });
    await notifier.send(makeNotification());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.username).toBe("TestBot");
    expect(body.channel).toBe("#testing");
  });
});
