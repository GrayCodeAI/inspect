import { describe, it, expect, vi} from "vitest";
import { WebCrawler } from "./crawler.js";

describe("WebCrawler", () => {
  describe("constructor", () => {
    it("should create crawler with default config", () => {
      const crawler = new WebCrawler({ startUrl: "https://example.com" });
      const job = crawler.getJob();
      expect(job.status).toBe("pending");
      expect(job.config.startUrl).toBe("https://example.com");
      expect(job.queue).toContain("https://example.com");
    });

    it("should apply custom config options", () => {
      const crawler = new WebCrawler({
        startUrl: "https://example.com",
        maxDepth: 5,
        maxPages: 200,
        concurrency: 10,
        delay: 100,
      });
      const job = crawler.getJob();
      expect(job.config.maxDepth).toBe(5);
      expect(job.config.maxPages).toBe(200);
      expect(job.config.concurrency).toBe(10);
      expect(job.config.delay).toBe(100);
    });

    it("should use default config values", () => {
      const crawler = new WebCrawler({ startUrl: "https://example.com" });
      const job = crawler.getJob();
      expect(job.config.maxDepth).toBe(3);
      expect(job.config.maxPages).toBe(100);
      expect(job.config.concurrency).toBe(5);
      expect(job.config.delay).toBe(0);
      expect(job.config.respectRobots).toBe(true);
      expect(job.config.sameDomain).toBe(true);
    });
  });

  describe("getJob", () => {
    it("should return a copy of the job state", () => {
      const crawler = new WebCrawler({ startUrl: "https://example.com" });
      const job1 = crawler.getJob();
      const job2 = crawler.getJob();
      expect(job1).not.toBe(job2);
      expect(job1.id).toBe(job2.id);
    });
  });

  describe("export", () => {
    it("should export as JSON", () => {
      const crawler = new WebCrawler({ startUrl: "https://example.com" });
      const output = crawler.export("json");
      expect(() => JSON.parse(output)).not.toThrow();
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("should export as JSONL", () => {
      const crawler = new WebCrawler({ startUrl: "https://example.com" });
      const output = crawler.export("jsonl");
      expect(typeof output).toBe("string");
    });

    it("should export as CSV with header", () => {
      const crawler = new WebCrawler({ startUrl: "https://example.com" });
      const output = crawler.export("csv");
      expect(output).toContain("url,statusCode,title,depth,fetchTimeMs,contentSize");
    });
  });

  describe("getCheckpoint", () => {
    it("should return checkpoint data", () => {
      const crawler = new WebCrawler({ startUrl: "https://example.com" });
      const checkpoint = crawler.getCheckpoint();
      expect(checkpoint.jobId).toBeDefined();
      expect(checkpoint.config.startUrl).toBe("https://example.com");
      expect(Array.isArray(checkpoint.queue)).toBe(true);
      expect(Array.isArray(checkpoint.visited)).toBe(true);
      expect(typeof checkpoint.timestamp).toBe("number");
    });
  });

  describe("progress callback", () => {
    it("should accept a progress callback", () => {
      const callback = vi.fn();
      const crawler = new WebCrawler({ startUrl: "https://example.com" }, callback);
      expect(crawler.getJob().status).toBe("pending");
    });
  });

  describe("pause", () => {
    it("should pause the crawl", () => {
      const crawler = new WebCrawler({ startUrl: "https://example.com" });
      crawler.pause();
      // Pause sets an internal flag; job status changes after crawl() is called
    });
  });
});
