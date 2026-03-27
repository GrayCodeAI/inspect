// ============================================================================
// @inspect/api - Retry Policy with Dead Letter Queue
// ============================================================================

/** Retry configuration */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Backoff type */
  backoffType: "linear" | "exponential";
  /** Initial delay in ms (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 60000) */
  maxDelayMs: number;
  /** Jitter factor (0-1, adds randomness to delays) */
  jitter?: number;
}

/** Result of a retry attempt */
export interface RetryResult {
  success: boolean;
  attempts: number;
  statusCode?: number;
  response?: string;
  error?: string;
  totalDuration: number;
}

/** Dead letter queue entry */
export interface DeadLetterEntry {
  deliveryId: string;
  webhookId: string;
  event: string;
  data: unknown;
  error: string;
  attempts: number;
  timestamp: number;
}

/**
 * RetryPolicy implements exponential backoff with configurable
 * retry limits and a dead letter queue for permanently failed deliveries.
 */
export class RetryPolicy {
  private config: RetryConfig;
  private deadLetterQueue: DeadLetterEntry[] = [];
  private maxDeadLetterSize: number;

  constructor(
    config?: Partial<RetryConfig>,
    maxDeadLetterSize: number = 1000,
  ) {
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      backoffType: config?.backoffType ?? "exponential",
      initialDelayMs: config?.initialDelayMs ?? 1_000,
      maxDelayMs: config?.maxDelayMs ?? 60_000,
      jitter: config?.jitter ?? 0.1,
    };
    this.maxDeadLetterSize = maxDeadLetterSize;
  }

  /**
   * Execute a function with retry logic.
   *
   * @param fn - The function to execute
   * @param maxRetries - Override max retries for this execution
   * @returns RetryResult with success/failure details
   */
  async execute(
    fn: () => Promise<{ statusCode: number; response: string }>,
    maxRetries?: number,
  ): Promise<RetryResult> {
    const retries = maxRetries ?? this.config.maxRetries;
    const startTime = Date.now();
    let lastError: string | undefined;
    let lastStatusCode: number | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await fn();
        return {
          success: true,
          attempts: attempt + 1,
          statusCode: result.statusCode,
          response: result.response,
          totalDuration: Date.now() - startTime,
        };
      } catch (error) {
        // Truncate error messages to prevent leaking sensitive response data
        const rawError = error instanceof Error ? error.message : String(error);
        lastError = rawError.length > 200 ? rawError.slice(0, 200) + "..." : rawError;

        // Extract status code from error message if present
        const statusMatch = lastError.match(
          /responded with (\d+)/,
        );
        if (statusMatch) {
          lastStatusCode = parseInt(statusMatch[1], 10);

          // Don't retry on 4xx client errors (except 429 rate limit)
          if (lastStatusCode >= 400 && lastStatusCode < 500 && lastStatusCode !== 429) {
            return {
              success: false,
              attempts: attempt + 1,
              statusCode: lastStatusCode,
              error: lastError,
              totalDuration: Date.now() - startTime,
            };
          }
        }

        if (attempt < retries) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      attempts: retries + 1,
      statusCode: lastStatusCode,
      error: lastError,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Calculate the delay for a given attempt number.
   */
  calculateDelay(attempt: number): number {
    let delay: number;

    if (this.config.backoffType === "exponential") {
      delay =
        this.config.initialDelayMs * Math.pow(2, attempt);
    } else {
      delay =
        this.config.initialDelayMs * (attempt + 1);
    }

    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelayMs);

    // Add jitter
    if (this.config.jitter && this.config.jitter > 0) {
      const jitterRange = delay * this.config.jitter;
      delay += Math.random() * jitterRange * 2 - jitterRange;
      delay = Math.max(0, delay);
    }

    return Math.round(delay);
  }

  /**
   * Add an entry to the dead letter queue.
   */
  addToDeadLetterQueue(entry: DeadLetterEntry): void {
    this.deadLetterQueue.push(entry);

    // Trim if too large
    if (this.deadLetterQueue.length > this.maxDeadLetterSize) {
      this.deadLetterQueue = this.deadLetterQueue.slice(
        -this.maxDeadLetterSize,
      );
    }
  }

  /**
   * Get dead letter queue entries.
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Get dead letter queue size.
   */
  getDeadLetterQueueSize(): number {
    return this.deadLetterQueue.length;
  }

  /**
   * Clear the dead letter queue.
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }

  /**
   * Replay a dead letter entry (re-attempts delivery).
   */
  async replayDeadLetter(
    index: number,
    fn: () => Promise<{ statusCode: number; response: string }>,
  ): Promise<RetryResult> {
    if (index < 0 || index >= this.deadLetterQueue.length) {
      return {
        success: false,
        attempts: 0,
        error: "Invalid dead letter queue index",
        totalDuration: 0,
      };
    }

    const result = await this.execute(fn);

    if (result.success) {
      // Remove from dead letter queue on success
      this.deadLetterQueue.splice(index, 1);
    }

    return result;
  }

  /**
   * Get retry configuration.
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
