// Desktop Notification — OS notifications via node-notifier or shell commands
import { exec } from "node:child_process";
import { createLogger } from "./logging.js";

const logger = createLogger("observability/desktop-notifier");

export interface DesktopNotificationOptions {
  title: string;
  message: string;
  sound?: boolean;
  icon?: string;
  timeout?: number;
}

export class DesktopNotifier {
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  async notify(options: DesktopNotificationOptions): Promise<void> {
    if (!this.enabled) return;

    const { title, message } = options;
    const truncatedMessage = message.slice(0, 200);

    try {
      if (process.platform === "darwin") {
        await this.notifyMacOS(title, truncatedMessage);
      } else if (process.platform === "linux") {
        await this.notifyLinux(title, truncatedMessage);
      } else if (process.platform === "win32") {
        await this.notifyWindows(title, truncatedMessage);
      }
    } catch (error) {
      logger.debug("Desktop notification failed", { error: String(error) });
    }
  }

  private notifyMacOS(title: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const escapedTitle = title.replace(/'/g, "'\\''");
      const escapedMessage = message.replace(/'/g, "'\\''");
      exec(
        `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}"'`,
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }

  private notifyLinux(title: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`notify-send "${title}" "${message}"`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private notifyWindows(title: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const psScript = `
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
        $template = @"<toast><visual><binding template="ToastText02"><text id="1">${title}</text><text id="2">${message}</text></binding></visual></toast>"@
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($template)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Inspect").Show($toast)
      `;
      exec(`powershell -Command "${psScript.replace(/\n/g, " ")}"`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
