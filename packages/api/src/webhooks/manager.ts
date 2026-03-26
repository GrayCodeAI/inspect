// ============================================================================
// @inspect/api - Webhook Manager
// ============================================================================

import * as http from "node:http";
import * as https from "node:https";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateId } from "@inspect/shared";
import type { WebhookConfig } from "@inspect/shared";
import { RetryPolicy, type RetryResult } from "./retry.js";

/** Registered webhook */
export interface WebhookRegistration extends WebhookConfig {
  id: string;
  createdAt: number;
  lastTriggeredAt?: number;
  successCount: number;
  failureCount: number;
}

/** Webhook delivery record */
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  data: unknown;
  status: "pending" | "success" | "failed";
  statusCode?: number;
  response?: string;
  attempts: number;
  createdAt: number;
  completedAt?: number;
  error?: string;
}

/**
 * WebhookManager handles webhook registration, triggering, and delivery
 * with retry support and exponential backoff. Persists webhook configs
 * to .inspect/webhooks/.
 */
export class WebhookManager {
  private webhooks: Map<string, WebhookRegistration> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private retryPolicy: RetryPolicy;
  private persistDir: string;
  private maxDeliveryHistory: number;

  constructor(options?: {
    basePath?: string;
    maxRetries?: number;
    maxDeliveryHistory?: number;
  }) {
    const basePath = options?.basePath ?? process.cwd();
    this.persistDir = path.join(basePath, ".inspect", "webhooks");
    this.maxDeliveryHistory = options?.maxDeliveryHistory ?? 100;
    this.retryPolicy = new RetryPolicy({
      maxRetries: options?.maxRetries ?? 3,
      backoffType: "exponential",
      initialDelayMs: 1_000,
      maxDelayMs: 60_000,
    });

    this.ensureDir(this.persistDir);
    this.loadWebhooks();
  }

  /**
   * Register a webhook.
   */
  register(
    url: string,
    events: string[],
    options?: {
      secret?: string;
      maxRetries?: number;
      enabled?: boolean;
    },
  ): WebhookRegistration {
    const webhook: WebhookRegistration = {
      id: generateId(),
      url,
      events,
      secret: options?.secret,
      maxRetries: options?.maxRetries ?? 3,
      retryBackoff: "exponential",
      enabled: options?.enabled ?? true,
      createdAt: Date.now(),
      successCount: 0,
      failureCount: 0,
    };

    this.webhooks.set(webhook.id, webhook);
    this.persistWebhook(webhook);
    return webhook;
  }

  /**
   * Unregister a webhook.
   */
  unregister(id: string): boolean {
    const existed = this.webhooks.delete(id);
    if (existed) {
      this.removeWebhookFile(id);
    }
    return existed;
  }

  /**
   * Trigger a webhook event. Sends to all registered webhooks
   * that are subscribed to the event.
   */
  async trigger(
    event: string,
    data: unknown,
  ): Promise<WebhookDelivery[]> {
    const deliveries: WebhookDelivery[] = [];

    for (const webhook of this.webhooks.values()) {
      if (!webhook.enabled) continue;
      if (!webhook.events.includes(event) && !webhook.events.includes("*")) {
        continue;
      }

      const delivery = await this.deliver(webhook, event, data);
      deliveries.push(delivery);
    }

    return deliveries;
  }

  /**
   * Get all registered webhooks.
   */
  list(): WebhookRegistration[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get a webhook by ID.
   */
  get(id: string): WebhookRegistration | undefined {
    return this.webhooks.get(id);
  }

  /**
   * Update a webhook.
   */
  update(
    id: string,
    updates: Partial<Pick<WebhookConfig, "url" | "events" | "secret" | "enabled" | "maxRetries">>,
  ): WebhookRegistration | null {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;

    if (updates.url !== undefined) webhook.url = updates.url;
    if (updates.events !== undefined) webhook.events = updates.events;
    if (updates.secret !== undefined) webhook.secret = updates.secret;
    if (updates.enabled !== undefined) webhook.enabled = updates.enabled;
    if (updates.maxRetries !== undefined) webhook.maxRetries = updates.maxRetries;

    this.persistWebhook(webhook);
    return webhook;
  }

  /**
   * Get recent deliveries, optionally filtered by webhook ID.
   */
  getDeliveries(webhookId?: string): WebhookDelivery[] {
    let all = Array.from(this.deliveries.values());
    if (webhookId) {
      all = all.filter((d) => d.webhookId === webhookId);
    }
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Deliver a webhook event with retry support.
   */
  private async deliver(
    webhook: WebhookRegistration,
    event: string,
    data: unknown,
  ): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: generateId(),
      webhookId: webhook.id,
      event,
      data,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    };

    this.deliveries.set(delivery.id, delivery);
    this.trimDeliveryHistory();

    const payload = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
      deliveryId: delivery.id,
    });

    // Build signature if secret is configured
    let signature: string | undefined;
    if (webhook.secret) {
      signature = crypto
        .createHmac("sha256", webhook.secret)
        .update(payload)
        .digest("hex");
    }

    const result: RetryResult = await this.retryPolicy.execute(
      async () => {
        delivery.attempts++;
        return this.sendWebhook(webhook.url, payload, signature);
      },
      webhook.maxRetries,
    );

    if (result.success) {
      delivery.status = "success";
      delivery.statusCode = result.statusCode;
      delivery.response = result.response;
      webhook.successCount++;
      webhook.lastTriggeredAt = Date.now();
    } else {
      delivery.status = "failed";
      delivery.error = result.error;
      delivery.statusCode = result.statusCode;
      webhook.failureCount++;

      // Add to dead letter queue
      this.retryPolicy.addToDeadLetterQueue({
        deliveryId: delivery.id,
        webhookId: webhook.id,
        event,
        data,
        error: result.error ?? 'Unknown error',
        attempts: delivery.attempts,
        timestamp: Date.now(),
      });
    }

    delivery.completedAt = Date.now();
    this.persistWebhook(webhook);
    return delivery;
  }

  /**
   * Send an HTTP request to a webhook URL.
   */
  private sendWebhook(
    url: string,
    payload: string,
    signature?: string,
  ): Promise<{ statusCode: number; response: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === "https:";
      const httpModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(payload)),
        "User-Agent": "Inspect-Webhook/1.0",
      };

      if (signature) {
        headers["X-Webhook-Signature"] = `sha256=${signature}`;
      }

      const req = httpModule.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: "POST",
          headers,
          timeout: 15_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const statusCode = res.statusCode ?? 0;
            const response = Buffer.concat(chunks).toString("utf-8");

            if (statusCode >= 200 && statusCode < 300) {
              resolve({ statusCode, response });
            } else {
              reject(
                new Error(
                  `Webhook responded with ${statusCode}: ${response.slice(0, 200)}`,
                ),
              );
            }
          });
        },
      );

      req.on("error", (err) =>
        reject(new Error(`Webhook delivery failed: ${err.message}`)),
      );
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Webhook delivery timed out"));
      });

      req.write(payload);
      req.end();
    });
  }

  private persistWebhook(webhook: WebhookRegistration): void {
    try {
      const filePath = path.join(this.persistDir, `${webhook.id}.json`);
      fs.writeFileSync(
        filePath,
        JSON.stringify(webhook, null, 2),
        "utf-8",
      );
    } catch {
      // Ignore persist errors
    }
  }

  private removeWebhookFile(id: string): void {
    try {
      const filePath = path.join(this.persistDir, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore
    }
  }

  private loadWebhooks(): void {
    try {
      if (!fs.existsSync(this.persistDir)) return;
      const files = fs.readdirSync(this.persistDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = fs.readFileSync(
            path.join(this.persistDir, file),
            "utf-8",
          );
          const webhook = JSON.parse(data) as WebhookRegistration;
          this.webhooks.set(webhook.id, webhook);
        } catch {
          // Skip corrupt files
        }
      }
    } catch {
      // Directory may not exist
    }
  }

  private trimDeliveryHistory(): void {
    if (this.deliveries.size > this.maxDeliveryHistory) {
      const sorted = Array.from(this.deliveries.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt,
      );
      const toRemove = sorted.slice(
        0,
        this.deliveries.size - this.maxDeliveryHistory,
      );
      for (const [key] of toRemove) {
        this.deliveries.delete(key);
      }
    }
  }

  private ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }
}
