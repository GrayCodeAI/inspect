// ============================================================================
// @inspect/shared - Domain-Specific Error Classes
// ============================================================================

/**
 * Base class for all inspect domain errors.
 * Provides error classification and structured metadata.
 */
export class InspectError extends Error {
  /** Machine-readable error code */
  readonly code: string;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Additional context metadata */
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      code?: string;
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = "InspectError";
    this.code = options?.code ?? "UNKNOWN_ERROR";
    this.retryable = options?.retryable ?? false;
    this.context = options?.context ?? {};
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

// ── Browser Errors ──────────────────────────────────────────────────────────

export class BrowserError extends InspectError {
  constructor(
    message: string,
    options?: {
      code?:
        | "BROWSER_LAUNCH_FAILED"
        | "BROWSER_NOT_LAUNCHED"
        | "PAGE_NAVIGATION_FAILED"
        | "ELEMENT_NOT_FOUND"
        | "ELEMENT_NOT_VISIBLE"
        | "COOKIE_EXTRACTION_FAILED"
        | "VISION_API_ERROR"
        | "RECORDING_FAILED"
        | "SESSION_CLOSED";
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, {
      code: options?.code ?? "BROWSER_ERROR",
      retryable: options?.retryable ?? false,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "BrowserError";
  }
}

// ── Workflow Errors ─────────────────────────────────────────────────────────

export class WorkflowError extends InspectError {
  /** ID of the workflow or run that failed */
  readonly workflowId?: string;

  constructor(
    message: string,
    options?: {
      code?:
        | "WORKFLOW_NOT_FOUND"
        | "WORKFLOW_INVALID_STATE"
        | "BLOCK_EXECUTION_FAILED"
        | "BLOCK_VALIDATION_FAILED"
        | "CRON_PARSE_ERROR"
        | "RUN_CANCELLED"
        | "RUN_PAUSED";
      workflowId?: string;
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, {
      code: options?.code ?? "WORKFLOW_ERROR",
      retryable: options?.retryable ?? false,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "WorkflowError";
    this.workflowId = options?.workflowId;
  }
}

// ── Credential Errors ───────────────────────────────────────────────────────

export class CredentialError extends InspectError {
  /** Name of the provider that failed */
  readonly provider?: string;

  constructor(
    message: string,
    options?: {
      code?:
        | "CREDENTIAL_NOT_FOUND"
        | "VAULT_DECRYPT_FAILED"
        | "PROVIDER_ERROR"
        | "TOTP_FAILED"
        | "CREDENTIAL_INVALID";
      provider?: string;
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, {
      code: options?.code ?? "CREDENTIAL_ERROR",
      retryable: options?.retryable ?? false,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "CredentialError";
    this.provider = options?.provider;
  }
}

// ── Network Errors ──────────────────────────────────────────────────────────

export class NetworkError extends InspectError {
  constructor(
    message: string,
    options?: {
      code?: "PROXY_ERROR" | "TUNNEL_ERROR" | "DOMAIN_BLOCKED" | "REQUEST_FAILED";
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, {
      code: options?.code ?? "NETWORK_ERROR",
      retryable: options?.retryable ?? false,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "NetworkError";
  }
}
