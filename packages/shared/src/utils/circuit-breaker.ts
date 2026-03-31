// ============================================================================
// Circuit Breaker Pattern
// ============================================================================
// Prevents cascading failures by stopping calls to a failing service.
// States: CLOSED (normal) → OPEN (failing, reject calls) → HALF_OPEN (testing recovery)
// ============================================================================

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to wait before transitioning from OPEN to HALF_OPEN */
  recoveryTimeout: number;
  /** Number of successful calls in HALF_OPEN to close the circuit */
  successThreshold: number;
  /** Optional custom error classifier — returns true if error should count as failure */
  isFailure?: (error: unknown) => boolean;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  totalRejected: number;
}

export class CircuitBreakerOpenError extends Error {
  readonly code = "CIRCUIT_BREAKER_OPEN";
  readonly retryAfter: number;

  constructor(retryAfterMs: number) {
    super(`Circuit breaker is open. Retry after ${retryAfterMs}ms`);
    this.retryAfter = retryAfterMs;
  }
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange = Date.now();
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private totalRejected = 0;

  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;
  private readonly successThreshold: number;
  private readonly isFailure: (error: unknown) => boolean;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.failureThreshold = config?.failureThreshold ?? 5;
    this.recoveryTimeout = config?.recoveryTimeout ?? 30_000;
    this.successThreshold = config?.successThreshold ?? 2;
    this.isFailure = config?.isFailure ?? (() => true);
  }

  /**
   * Execute a function through the circuit breaker.
   * If the circuit is OPEN, throws CircuitBreakerOpenError immediately.
   * If HALF_OPEN, allows one call through to test recovery.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;
    this.checkStateTransition();

    if (this.state === "open") {
      this.totalRejected++;
      const retryAfter = this.recoveryTimeout - (Date.now() - (this.lastFailureTime ?? Date.now()));
      throw new CircuitBreakerOpenError(Math.max(0, retryAfter));
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.isFailure(error)) {
        this.onFailure();
      } else {
        this.onSuccess();
      }
      throw error;
    }
  }

  /** Execute a synchronous function through the circuit breaker */
  executeSync<T>(fn: () => T): T {
    this.totalCalls++;
    this.checkStateTransition();

    if (this.state === "open") {
      this.totalRejected++;
      const retryAfter = this.recoveryTimeout - (Date.now() - (this.lastFailureTime ?? Date.now()));
      throw new CircuitBreakerOpenError(Math.max(0, retryAfter));
    }

    try {
      const result = fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.isFailure(error)) {
        this.onFailure();
      } else {
        this.onSuccess();
      }
      throw error;
    }
  }

  /** Get current stats for monitoring */
  getStats(): CircuitBreakerStats {
    this.checkStateTransition();
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalRejected: this.totalRejected,
    };
  }

  /** Force the circuit to a specific state (useful for manual recovery) */
  setState(state: CircuitState): void {
    this.state = state;
    this.lastStateChange = Date.now();
    if (state === "closed") {
      this.failures = 0;
      this.successes = 0;
    }
  }

  /** Reset all stats and close the circuit */
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    this.totalCalls = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.totalRejected = 0;
  }

  private checkStateTransition(): void {
    if (this.state === "open" && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.recoveryTimeout) {
        this.transitionTo("half-open");
      }
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.totalSuccesses++;

    if (this.state === "half-open") {
      if (this.successes >= this.successThreshold) {
        this.transitionTo("closed");
      }
    } else if (this.state === "closed") {
      // Reset failure counter on success in closed state
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      // Any failure in half-open goes back to open
      this.transitionTo("open");
    } else if (this.state === "closed" && this.failures >= this.failureThreshold) {
      this.transitionTo("open");
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === "closed") {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === "half-open") {
      this.successes = 0;
    }
  }
}
