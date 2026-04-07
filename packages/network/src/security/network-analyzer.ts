export interface NetworkIssue {
  type: "failed" | "duplicate" | "mixed-content" | "slow";
  url: string;
  statusCode?: number;
  method: string;
  timestamp: number;
  details: string;
}

export interface NetworkAnalysisResult {
  issues: NetworkIssue[];
  totalRequests: number;
  failedRequests: number;
  duplicateRequests: number;
  mixedContentCount: number;
  slowRequests: number;
  averageResponseTime: number;
}

const DUPLICATE_WINDOW_MS = 500;

export class NetworkAnalyzer {
  private requests: Map<
    string,
    { timestamp: number; method: string; status?: number; responseTime?: number }
  > = new Map();
  private pageUrl: string = "";

  analyze(
    requests: Array<{
      url: string;
      method: string;
      status: number;
      timestamp: number;
      responseTime?: number;
    }>,
    pageUrl: string,
  ): NetworkAnalysisResult {
    this.pageUrl = pageUrl;
    this.requests.clear();

    const issues: NetworkIssue[] = [];
    let totalRequests = 0;
    let failedRequests = 0;
    let duplicateRequests = 0;
    let slowRequests = 0;
    let totalResponseTime = 0;

    for (const req of requests) {
      totalRequests++;
      totalResponseTime += req.responseTime ?? 0;

      if (req.responseTime && req.responseTime > 5000) {
        slowRequests++;
        issues.push({
          type: "slow",
          url: req.url,
          method: req.method,
          timestamp: req.timestamp,
          details: `Response time: ${req.responseTime}ms`,
        });
      }

      if (req.status === 0 || req.status >= 400) {
        failedRequests++;
        issues.push({
          type: "failed",
          url: req.url,
          statusCode: req.status,
          method: req.method,
          timestamp: req.timestamp,
          details: `HTTP ${req.status || "failed"}`,
        });
      }

      const urlKey = `${req.method}:${req.url}`;
      const existing = this.requests.get(urlKey);
      if (existing && req.timestamp - existing.timestamp < DUPLICATE_WINDOW_MS) {
        duplicateRequests++;
        issues.push({
          type: "duplicate",
          url: req.url,
          method: req.method,
          timestamp: req.timestamp,
          details: `Duplicate of request ${existing.timestamp}`,
        });
      }

      if (this.isMixedContent(req.url)) {
        issues.push({
          type: "mixed-content",
          url: req.url,
          method: req.method,
          timestamp: req.timestamp,
          details: "HTTP resource on HTTPS page",
        });
      }

      this.requests.set(urlKey, {
        timestamp: req.timestamp,
        method: req.method,
        status: req.status,
        responseTime: req.responseTime,
      });
    }

    return {
      issues,
      totalRequests,
      failedRequests,
      duplicateRequests,
      mixedContentCount: issues.filter((i) => i.type === "mixed-content").length,
      slowRequests,
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
    };
  }

  private isMixedContent(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.pageUrl.startsWith("https") && parsed.protocol === "http:";
    } catch {
      return false;
    }
  }
}

export const analyzeNetworkIssues = (
  requests: Array<{
    url: string;
    method: string;
    status: number;
    timestamp: number;
    responseTime?: number;
  }>,
  pageUrl: string,
): NetworkAnalysisResult => {
  const analyzer = new NetworkAnalyzer();
  return analyzer.analyze(requests, pageUrl);
};
