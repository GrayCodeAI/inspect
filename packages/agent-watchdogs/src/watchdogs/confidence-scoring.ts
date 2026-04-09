/**
 * Confidence scoring and metrics for watchdog detections
 */

export interface WatchdogDetectionResult<T> {
  detected: boolean;
  confidence: number; // 0-1
  reason?: string;
  data?: T;
  timestamp: number;
}

export interface WatchdogMetrics {
  totalDetections: number;
  successfulDetections: number;
  falsePositives: number;
  falseNegatives: number;
  averageConfidence: number;
  detectionRate: number;
  falsePositiveRate: number;
  lastUpdated: number;
}

/**
 * Confidence scoring utilities
 */
export class ConfidenceScorer {
  /**
   * Score captcha detection confidence
   */
  static scoreCaptchaConfidence(indicators: {
    hasCaptchaElement?: boolean;
    hasIframeChallenge?: boolean;
    hasRecaptchaScript?: boolean;
    hasRecaptchaParams?: boolean;
    pageHalted?: boolean;
  }): number {
    let score = 0;
    let weight = 0;

    if (indicators.hasCaptchaElement) {
      score += 0.3;
      weight += 0.3;
    }
    if (indicators.hasIframeChallenge) {
      score += 0.25;
      weight += 0.25;
    }
    if (indicators.hasRecaptchaScript) {
      score += 0.2;
      weight += 0.2;
    }
    if (indicators.hasRecaptchaParams) {
      score += 0.15;
      weight += 0.15;
    }
    if (indicators.pageHalted) {
      score += 0.1;
      weight += 0.1;
    }

    return weight > 0 ? Math.min(1, score / weight) : 0;
  }

  /**
   * Score consent banner detection confidence
   */
  static scoreConsentConfidence(indicators: {
    hasConsentText?: boolean;
    hasAcceptButton?: boolean;
    hasRejectButton?: boolean;
    isCookiePolicy?: boolean;
    hasPrivacyLink?: boolean;
  }): number {
    let score = 0;

    if (indicators.hasConsentText) score += 0.25;
    if (indicators.hasAcceptButton) score += 0.25;
    if (indicators.hasRejectButton) score += 0.15;
    if (indicators.isCookiePolicy) score += 0.2;
    if (indicators.hasPrivacyLink) score += 0.15;

    return Math.min(1, score);
  }

  /**
   * Score rate limit detection confidence
   */
  static scoreRateLimitConfidence(indicators: {
    isHttpStatusRateLimited?: boolean;
    hasRateLimitHeader?: boolean;
    hasRetryAfterHeader?: boolean;
    hasErrorMessage?: boolean;
    responseTime?: number;
  }): number {
    let score = 0;

    if (indicators.isHttpStatusRateLimited) score += 0.4;
    if (indicators.hasRateLimitHeader) score += 0.3;
    if (indicators.hasRetryAfterHeader) score += 0.15;
    if (indicators.hasErrorMessage) score += 0.1;
    if (indicators.responseTime && indicators.responseTime < 100) score += 0.05;

    return Math.min(1, score);
  }

  /**
   * Score login redirect detection confidence
   */
  static scoreLoginRedirectConfidence(indicators: {
    urlContainsLoginPath?: boolean;
    isHttpRedirect?: boolean;
    hasLoginForm?: boolean;
    previouslyLoggedIn?: boolean;
    statusCode?: number;
  }): number {
    let score = 0;

    if (indicators.urlContainsLoginPath) score += 0.3;
    if (indicators.isHttpRedirect) score += 0.25;
    if (indicators.hasLoginForm) score += 0.25;
    if (indicators.previouslyLoggedIn) score += 0.15;
    if (indicators.statusCode === 302 || indicators.statusCode === 307) score += 0.05;

    return Math.min(1, score);
  }

  /**
   * Score popup detection confidence
   */
  static scorePopupConfidence(indicators: {
    isVisible?: boolean;
    isModal?: boolean;
    hasCloseButton?: boolean;
    isNewWindow?: boolean;
    position?: string;
  }): number {
    let score = 0;

    if (indicators.isVisible) score += 0.25;
    if (indicators.isModal) score += 0.25;
    if (indicators.hasCloseButton) score += 0.2;
    if (indicators.isNewWindow) score += 0.2;
    if (indicators.position === "center" || indicators.position === "overlay") score += 0.1;

    return Math.min(1, score);
  }
}

/**
 * Metrics tracker for watchdog detections
 */
export class MetricsTracker {
  private metrics: Map<string, WatchdogMetrics> = new Map();

  /**
   * Record a detection event
   */
  recordDetection(
    watchdogType: string,
    detected: boolean,
    confidence: number,
    wasAccurate: boolean,
  ): void {
    const metric = this.metrics.get(watchdogType) || {
      totalDetections: 0,
      successfulDetections: 0,
      falsePositives: 0,
      falseNegatives: 0,
      averageConfidence: 0,
      detectionRate: 0,
      falsePositiveRate: 0,
      lastUpdated: Date.now(),
    };

    metric.totalDetections++;

    if (detected && wasAccurate) {
      metric.successfulDetections++;
    } else if (detected && !wasAccurate) {
      metric.falsePositives++;
    } else if (!detected && wasAccurate) {
      metric.falseNegatives++;
    }

    // Update average confidence
    metric.averageConfidence =
      (metric.averageConfidence * (metric.totalDetections - 1) + confidence) /
      metric.totalDetections;

    // Recalculate rates
    metric.detectionRate =
      metric.successfulDetections /
      Math.max(1, metric.successfulDetections + metric.falseNegatives);
    metric.falsePositiveRate =
      metric.falsePositives / Math.max(1, metric.falsePositives + metric.totalDetections);

    metric.lastUpdated = Date.now();
    this.metrics.set(watchdogType, metric);
  }

  /**
   * Get metrics for a watchdog type
   */
  getMetrics(watchdogType: string): WatchdogMetrics | undefined {
    return this.metrics.get(watchdogType);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, WatchdogMetrics> {
    const result: Record<string, WatchdogMetrics> = {};
    for (const [key, value] of this.metrics) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Reset metrics for a watchdog type
   */
  reset(watchdogType?: string): void {
    if (watchdogType) {
      this.metrics.delete(watchdogType);
    } else {
      this.metrics.clear();
    }
  }
}
