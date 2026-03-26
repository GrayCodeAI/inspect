// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - GitHub Commit Status
// ──────────────────────────────────────────────────────────────────────────────

/** GitHub status state */
export type GitHubStatusState = "pending" | "success" | "failure" | "error";

/** Status configuration */
export interface GitHubStatusConfig {
  /** GitHub API token */
  token: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** GitHub API base URL (default: https://api.github.com) */
  apiUrl?: string;
}

/** Status parameters */
export interface StatusParams {
  /** Git SHA to attach the status to */
  sha: string;
  /** Status state */
  state: GitHubStatusState;
  /** Short description (max 140 chars) */
  description: string;
  /** URL to the full report */
  targetUrl?: string;
  /** Context identifier (e.g., "inspect/tests") */
  context?: string;
}

/** Check run parameters (GitHub Checks API - richer than statuses) */
export interface CheckRunParams {
  /** Git SHA */
  sha: string;
  /** Check run name */
  name: string;
  /** Status */
  status: "queued" | "in_progress" | "completed";
  /** Conclusion (when completed) */
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required";
  /** Summary text (supports markdown) */
  summary: string;
  /** Detailed text */
  text?: string;
  /** URL for "Details" link */
  detailsUrl?: string;
  /** Annotations for specific lines */
  annotations?: Array<{
    path: string;
    startLine: number;
    endLine: number;
    annotationLevel: "notice" | "warning" | "failure";
    message: string;
    title?: string;
  }>;
}

/**
 * Manages GitHub commit statuses and check runs.
 *
 * Provides methods to set commit statuses (simple pass/fail indicators)
 * and create check runs (richer UI with annotations and markdown).
 */
export class GitHubStatus {
  private config: GitHubStatusConfig;
  private readonly apiUrl: string;

  constructor(config: GitHubStatusConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl ?? "https://api.github.com";
  }

  /**
   * Set a commit status on a specific SHA.
   */
  async setStatus(params: StatusParams): Promise<void> {
    const url = `${this.apiUrl}/repos/${this.config.owner}/${this.config.repo}/statuses/${params.sha}`;

    const body = {
      state: params.state,
      description: params.description.slice(0, 140),
      target_url: params.targetUrl,
      context: params.context ?? "inspect/tests",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GitHubAPIError(
        `Failed to set status: ${response.status} ${error}`,
        response.status,
      );
    }
  }

  /**
   * Convenience: set status to pending with a message.
   */
  async setPending(sha: string, description: string = "Tests running..."): Promise<void> {
    await this.setStatus({ sha, state: "pending", description });
  }

  /**
   * Convenience: set status to success.
   */
  async setSuccess(sha: string, description: string, targetUrl?: string): Promise<void> {
    await this.setStatus({ sha, state: "success", description, targetUrl });
  }

  /**
   * Convenience: set status to failure.
   */
  async setFailure(sha: string, description: string, targetUrl?: string): Promise<void> {
    await this.setStatus({ sha, state: "failure", description, targetUrl });
  }

  /**
   * Create a check run (GitHub Checks API - requires GitHub App token).
   */
  async createCheckRun(params: CheckRunParams): Promise<{ id: number; url: string }> {
    const url = `${this.apiUrl}/repos/${this.config.owner}/${this.config.repo}/check-runs`;

    const body: Record<string, unknown> = {
      name: params.name,
      head_sha: params.sha,
      status: params.status,
      details_url: params.detailsUrl,
      output: {
        title: params.name,
        summary: params.summary,
        text: params.text,
        annotations: params.annotations?.slice(0, 50), // GitHub limits to 50 per request
      },
    };

    if (params.status === "completed" && params.conclusion) {
      body.conclusion = params.conclusion;
      body.completed_at = new Date().toISOString();
    }

    if (params.status === "in_progress") {
      body.started_at = new Date().toISOString();
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GitHubAPIError(
        `Failed to create check run: ${response.status} ${error}`,
        response.status,
      );
    }

    const data = (await response.json()) as { id: number; html_url: string };
    return { id: data.id, url: data.html_url };
  }

  /**
   * Update an existing check run.
   */
  async updateCheckRun(
    checkRunId: number,
    params: Partial<CheckRunParams>,
  ): Promise<void> {
    const url = `${this.apiUrl}/repos/${this.config.owner}/${this.config.repo}/check-runs/${checkRunId}`;

    const body: Record<string, unknown> = {};

    if (params.status) body.status = params.status;
    if (params.conclusion) body.conclusion = params.conclusion;
    if (params.status === "completed") {
      body.completed_at = new Date().toISOString();
    }

    if (params.summary || params.text || params.annotations) {
      body.output = {
        title: params.name ?? "Inspect Tests",
        summary: params.summary,
        text: params.text,
        annotations: params.annotations?.slice(0, 50),
      };
    }

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        ...this.getHeaders(),
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GitHubAPIError(
        `Failed to update check run: ${response.status} ${error}`,
        response.status,
      );
    }
  }

  /**
   * Post a PR comment with test results.
   */
  async postPRComment(prNumber: number, body: string): Promise<{ id: number; url: string }> {
    const url = `${this.apiUrl}/repos/${this.config.owner}/${this.config.repo}/issues/${prNumber}/comments`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GitHubAPIError(
        `Failed to post PR comment: ${response.status} ${error}`,
        response.status,
      );
    }

    const data = (await response.json()) as { id: number; html_url: string };
    return { id: data.id, url: data.html_url };
  }

  /**
   * Update an existing PR comment (for updating the same status comment).
   */
  async updatePRComment(commentId: number, body: string): Promise<void> {
    const url = `${this.apiUrl}/repos/${this.config.owner}/${this.config.repo}/issues/comments/${commentId}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: this.getHeaders(),
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GitHubAPIError(
        `Failed to update PR comment: ${response.status} ${error}`,
        response.status,
      );
    }
  }

  /**
   * Find an existing Inspect comment on a PR (for update-or-create pattern).
   */
  async findExistingComment(prNumber: number, marker: string = "<!-- inspect-report -->"): Promise<number | null> {
    const url = `${this.apiUrl}/repos/${this.config.owner}/${this.config.repo}/issues/${prNumber}/comments?per_page=100`;

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (!response.ok) return null;

    const comments = (await response.json()) as Array<{ id: number; body: string }>;
    const existing = comments.find((c) => c.body.includes(marker));

    return existing?.id ?? null;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `token ${this.config.token}`,
      Accept: "application/vnd.github.v3+json",
    };
  }
}

/** GitHub API error */
export class GitHubAPIError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "GitHubAPIError";
    this.statusCode = statusCode;
  }
}
