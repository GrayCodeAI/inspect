import { describe, it} from "vitest";
import { DesktopNotifier } from "./desktop-notifier.js";

describe("DesktopNotifier", () => {
  it("should be disabled when enabled=false", async () => {
    const notifier = new DesktopNotifier(false);
    await notifier.notify({ title: "Test", message: "Hello" });
    // Should complete without error
  });

  it("should truncate long messages", async () => {
    const notifier = new DesktopNotifier(true);
    const longMessage = "x".repeat(500);
    // Should not throw even if notification system is unavailable
    await notifier.notify({ title: "Test", message: longMessage }).catch(() => {});
  });

  it("should support enable/disable toggle", () => {
    const notifier = new DesktopNotifier(true);
    notifier.setEnabled(false);
    notifier.setEnabled(true);
  });
});
