// ──────────────────────────────────────────────────────────────────────────────
// HARRecorder - Capture HAR (HTTP Archive) from Playwright pages
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Request, Response } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { HARArchive, HAREntry } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/session/har");

/**
 * Records all network traffic from a Playwright page as a HAR archive.
 * Captures request/response headers, timing, body content, and status.
 */
export class HARRecorder {
  private capturing = false;
  private entries: HAREntry[] = [];
  private pendingRequests: Map<string, { entry: HAREntry; request: Request }> = new Map();
  private cleanupHandlers: (() => void)[] = [];

  /**
   * Start capturing network traffic from the page.
   */
  startCapture(page: Page): void {
    if (this.capturing) {
      throw new Error("HAR capture already in progress. Stop the current capture first.");
    }

    this.capturing = true;
    this.entries = [];
    this.pendingRequests.clear();

    // Handler for new requests
    const onRequest = (request: Request) => {
      if (!this.capturing) return;

      const url = new URL(request.url());
      const queryString = [...url.searchParams.entries()].map(([name, value]) => ({ name, value }));

      const entry: HAREntry = {
        startedDateTime: new Date().toISOString(),
        time: 0,
        request: {
          method: request.method(),
          url: request.url(),
          httpVersion: "HTTP/1.1",
          headers: Object.entries(request.headers()).map(([name, value]) => ({ name, value })),
          queryString,
          bodySize: request.postData()?.length ?? 0,
          postData: request.postData()
            ? {
                mimeType: request.headers()["content-type"] ?? "application/octet-stream",
                text: request.postData()!,
              }
            : undefined,
        },
        response: {
          status: 0,
          statusText: "",
          httpVersion: "HTTP/1.1",
          headers: [],
          content: { size: 0, mimeType: "" },
          bodySize: 0,
        },
        timings: {
          send: 0,
          wait: 0,
          receive: 0,
        },
      };

      const requestId = `${request.url()}_${Date.now()}_${Math.random()}`;
      this.pendingRequests.set(requestId, { entry, request });
    };

    // Handler for completed requests
    const onResponse = async (response: Response) => {
      if (!this.capturing) return;

      const request = response.request();
      // Find the matching pending request
      let matchedId: string | null = null;
      for (const [id, pending] of this.pendingRequests) {
        if (pending.request === request) {
          matchedId = id;
          break;
        }
      }

      if (!matchedId) return;

      const pending = this.pendingRequests.get(matchedId)!;
      this.pendingRequests.delete(matchedId);

      const entry = pending.entry;
      const startTime = new Date(entry.startedDateTime).getTime();
      const endTime = Date.now();

      entry.time = endTime - startTime;
      entry.response = {
        status: response.status(),
        statusText: response.statusText(),
        httpVersion: "HTTP/1.1",
        headers: Object.entries(response.headers()).map(([name, value]) => ({ name, value })),
        content: {
          size: 0,
          mimeType: response.headers()["content-type"] ?? "",
        },
        bodySize: 0,
      };

      // Try to capture body for text-based responses
      try {
        const contentType = response.headers()["content-type"] ?? "";
        const isText =
          contentType.includes("text") ||
          contentType.includes("json") ||
          contentType.includes("xml") ||
          contentType.includes("javascript") ||
          contentType.includes("css");

        if (isText) {
          const body = await response.text().catch(() => "");
          entry.response.content.text = body;
          entry.response.content.size = body.length;
          entry.response.bodySize = body.length;
        } else {
          const body = await response.body().catch(() => Buffer.alloc(0));
          entry.response.content.size = body.length;
          entry.response.bodySize = body.length;
        }
      } catch (error) {
        logger.debug("Failed to capture response body", { error });
      }

      entry.timings = {
        send: Math.max(1, Math.round(entry.time * 0.1)),
        wait: Math.max(1, Math.round(entry.time * 0.7)),
        receive: Math.max(1, Math.round(entry.time * 0.2)),
      };

      this.entries.push(entry);
    };

    // Handler for failed requests
    const onRequestFailed = (request: Request) => {
      if (!this.capturing) return;

      for (const [id, pending] of this.pendingRequests) {
        if (pending.request === request) {
          const entry = pending.entry;
          entry.response = {
            status: 0,
            statusText: request.failure()?.errorText ?? "Request failed",
            httpVersion: "HTTP/1.1",
            headers: [],
            content: { size: 0, mimeType: "" },
            bodySize: 0,
          };
          entry.time = Date.now() - new Date(entry.startedDateTime).getTime();
          this.entries.push(entry);
          this.pendingRequests.delete(id);
          break;
        }
      }
    };

    page.on("request", onRequest);
    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);

    this.cleanupHandlers = [
      () => page.off("request", onRequest),
      () => page.off("response", onResponse),
      () => page.off("requestfailed", onRequestFailed),
    ];
  }

  /**
   * Stop capturing and return the HAR archive.
   */
  stopCapture(): HARArchive {
    if (!this.capturing) {
      throw new Error("No HAR capture in progress.");
    }

    this.capturing = false;

    // Remove event listeners
    for (const cleanup of this.cleanupHandlers) {
      cleanup();
    }
    this.cleanupHandlers = [];

    // Include any remaining pending requests
    for (const [, pending] of this.pendingRequests) {
      const entry = pending.entry;
      entry.response = {
        status: 0,
        statusText: "Request still pending when capture stopped",
        httpVersion: "HTTP/1.1",
        headers: [],
        content: { size: 0, mimeType: "" },
        bodySize: 0,
      };
      this.entries.push(entry);
    }
    this.pendingRequests.clear();

    return this.buildHAR();
  }

  /**
   * Save the HAR archive to a file.
   */
  save(path: string, archive?: HARArchive): void {
    const har = archive ?? this.buildHAR();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(har, null, 2));
  }

  /**
   * Get the number of entries captured so far.
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Check if capture is in progress.
   */
  isCapturing(): boolean {
    return this.capturing;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildHAR(): HARArchive {
    return {
      log: {
        version: "1.2",
        creator: {
          name: "Inspect Browser",
          version: "0.1.0",
        },
        entries: [...this.entries],
      },
    };
  }
}
