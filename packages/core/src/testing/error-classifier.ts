// ============================================================================
// @inspect/core - Error Classifier
//
// Categorizes test failures into actionable buckets with suggested fixes.
// ============================================================================

export type ErrorCategory =
  | "network"
  | "timeout"
  | "element"
  | "navigation"
  | "auth"
  | "validation"
  | "javascript"
  | "resource"
  | "captcha"
  | "rate-limit"
  | "crash"
  | "unknown";

export interface ClassifiedError {
  category: ErrorCategory;
  confidence: number;
  summary: string;
  suggestedFix: string;
  retryable: boolean;
  severity: "critical" | "high" | "medium" | "low";
}

interface ErrorPattern {
  pattern: RegExp;
  category: ErrorCategory;
  summary: string;
  suggestedFix: string;
  retryable: boolean;
  severity: ClassifiedError["severity"];
  confidence: number;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Network errors
  { pattern: /net::ERR_CONNECTION_REFUSED/i, category: "network", summary: "Connection refused", suggestedFix: "Check if the server is running and accessible", retryable: true, severity: "high", confidence: 0.95 },
  { pattern: /net::ERR_NAME_NOT_RESOLVED/i, category: "network", summary: "DNS resolution failed", suggestedFix: "Check the URL for typos or DNS configuration", retryable: false, severity: "critical", confidence: 0.95 },
  { pattern: /net::ERR_(NETWORK|INTERNET|CONNECTION)/i, category: "network", summary: "Network error", suggestedFix: "Check network connectivity and firewall rules", retryable: true, severity: "high", confidence: 0.85 },
  { pattern: /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i, category: "network", summary: "Server unreachable", suggestedFix: "Verify the target server is running", retryable: true, severity: "high", confidence: 0.9 },
  { pattern: /fetch failed|Failed to fetch/i, category: "network", summary: "HTTP request failed", suggestedFix: "Check API endpoint availability and CORS settings", retryable: true, severity: "medium", confidence: 0.8 },

  // Timeouts
  { pattern: /timeout.*exceeded|timed?\s*out/i, category: "timeout", summary: "Operation timed out", suggestedFix: "Increase timeout or check for slow page loads/API responses", retryable: true, severity: "medium", confidence: 0.9 },
  { pattern: /waiting for (selector|navigation|load)/i, category: "timeout", summary: "Wait condition not met", suggestedFix: "Check if the expected element/page state exists", retryable: true, severity: "medium", confidence: 0.85 },

  // Element errors
  { pattern: /element.*(not found|not exist|missing|no such)/i, category: "element", summary: "Element not found", suggestedFix: "Verify the selector/ref exists on the page; the DOM may have changed", retryable: true, severity: "medium", confidence: 0.9 },
  { pattern: /element.*(not visible|hidden|display:\s*none)/i, category: "element", summary: "Element not visible", suggestedFix: "Element exists but is hidden; check CSS or scroll into view", retryable: true, severity: "medium", confidence: 0.9 },
  { pattern: /element.*(not interactable|disabled|readonly)/i, category: "element", summary: "Element not interactable", suggestedFix: "Element is disabled or covered by another element (overlay/modal)", retryable: true, severity: "medium", confidence: 0.9 },
  { pattern: /detached|disposed|stale/i, category: "element", summary: "Stale element reference", suggestedFix: "Page was reloaded or DOM updated; re-query the element", retryable: true, severity: "low", confidence: 0.85 },

  // Navigation
  { pattern: /navigation.*failed|net::ERR_ABORTED/i, category: "navigation", summary: "Navigation failed", suggestedFix: "Check the URL and server response; may be a redirect loop", retryable: true, severity: "high", confidence: 0.85 },
  { pattern: /page\.goto.*failed/i, category: "navigation", summary: "Page navigation error", suggestedFix: "Target URL may be invalid or server returned an error", retryable: true, severity: "high", confidence: 0.9 },

  // Auth
  { pattern: /401|unauthorized/i, category: "auth", summary: "Authentication required", suggestedFix: "Provide valid credentials or check session/token expiry", retryable: false, severity: "high", confidence: 0.85 },
  { pattern: /403|forbidden/i, category: "auth", summary: "Access forbidden", suggestedFix: "Check user permissions for this resource", retryable: false, severity: "high", confidence: 0.85 },
  { pattern: /login required|sign.?in required/i, category: "auth", summary: "Login required", suggestedFix: "Add authentication step before this action", retryable: false, severity: "high", confidence: 0.9 },

  // Validation
  { pattern: /validation.*error|required field|invalid (email|input|format)/i, category: "validation", summary: "Form validation error", suggestedFix: "Check input data against form validation rules", retryable: false, severity: "low", confidence: 0.85 },

  // JavaScript errors
  { pattern: /ReferenceError|TypeError|SyntaxError|RangeError/i, category: "javascript", summary: "JavaScript runtime error", suggestedFix: "Check browser console for JS errors; may be a bug in the app", retryable: false, severity: "high", confidence: 0.9 },

  // Resource errors
  { pattern: /404.*not found/i, category: "resource", summary: "Resource not found (404)", suggestedFix: "The requested page or resource does not exist", retryable: false, severity: "medium", confidence: 0.9 },
  { pattern: /500|internal server error/i, category: "resource", summary: "Server error (500)", suggestedFix: "Server-side error; check server logs", retryable: true, severity: "critical", confidence: 0.85 },

  // Captcha
  { pattern: /captcha|recaptcha|hcaptcha|challenge/i, category: "captcha", summary: "CAPTCHA detected", suggestedFix: "Site requires human verification; use vision mode or skip", retryable: false, severity: "medium", confidence: 0.9 },

  // Rate limiting
  { pattern: /429|rate.?limit|too many requests|throttl/i, category: "rate-limit", summary: "Rate limited", suggestedFix: "Too many requests; add delays between actions or reduce concurrency", retryable: true, severity: "medium", confidence: 0.9 },

  // Crashes
  { pattern: /page crash|target closed|context destroyed|browser.*closed/i, category: "crash", summary: "Browser/page crash", suggestedFix: "Browser crashed; may be a memory issue or incompatible page", retryable: true, severity: "critical", confidence: 0.9 },
];

/**
 * ErrorClassifier categorizes test errors into actionable buckets.
 */
export class ErrorClassifier {
  /**
   * Classify a single error message.
   */
  classify(error: string | Error): ClassifiedError {
    const message = typeof error === "string" ? error : error.message;

    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(message)) {
        return {
          category: pattern.category,
          confidence: pattern.confidence,
          summary: pattern.summary,
          suggestedFix: pattern.suggestedFix,
          retryable: pattern.retryable,
          severity: pattern.severity,
        };
      }
    }

    return {
      category: "unknown",
      confidence: 0.3,
      summary: message.slice(0, 100),
      suggestedFix: "Check the full error message and browser console for details",
      retryable: true,
      severity: "medium",
    };
  }

  /**
   * Classify multiple errors and group by category.
   */
  classifyBatch(errors: Array<string | Error>): Map<ErrorCategory, ClassifiedError[]> {
    const grouped = new Map<ErrorCategory, ClassifiedError[]>();

    for (const error of errors) {
      const classified = this.classify(error);
      const list = grouped.get(classified.category) ?? [];
      list.push(classified);
      grouped.set(classified.category, list);
    }

    return grouped;
  }

  /**
   * Get a summary of error categories from multiple errors.
   */
  summarize(errors: Array<string | Error>): {
    total: number;
    byCategory: Array<{ category: ErrorCategory; count: number; retryable: number }>;
    mostCommon: ErrorCategory;
    criticalCount: number;
  } {
    const grouped = this.classifyBatch(errors);
    const byCategory = Array.from(grouped.entries())
      .map(([category, items]) => ({
        category,
        count: items.length,
        retryable: items.filter((i) => i.retryable).length,
      }))
      .sort((a, b) => b.count - a.count);

    const allClassified = errors.map((e) => this.classify(e));
    const criticalCount = allClassified.filter((c) => c.severity === "critical").length;

    return {
      total: errors.length,
      byCategory,
      mostCommon: byCategory[0]?.category ?? "unknown",
      criticalCount,
    };
  }
}
