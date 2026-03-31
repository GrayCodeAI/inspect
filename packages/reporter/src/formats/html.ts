// ──────────────────────────────────────────────────────────────────────────────
// @inspect/reporter - HTML Reporter
// ──────────────────────────────────────────────────────────────────────────────

import type { SuiteResult, TestResult, TestStep, Screenshot } from "./markdown.js";
import { truncate } from "@inspect/shared";

/** HTML reporter options */
export interface HTMLReporterOptions {
  /** Whether to embed screenshots as base64 data URLs */
  embedScreenshots?: boolean;
  /** Whether to include the rrweb recording player */
  includeRecording?: boolean;
  /** Custom CSS to inject */
  customCSS?: string;
  /** Title for the report page */
  title?: string;
  /** Whether to include interactive filters */
  interactive?: boolean;
}

/**
 * Generates an interactive HTML report from test results.
 *
 * Features:
 * - Filterable test list (pass/fail/skip)
 * - Expandable step details
 * - Embedded screenshots with lightbox
 * - Session recording playback (if rrweb data available)
 * - Timeline visualization
 */
export class HTMLReporter {
  private options: HTMLReporterOptions;

  constructor(options?: HTMLReporterOptions) {
    this.options = {
      embedScreenshots: true,
      includeRecording: false,
      interactive: true,
      ...options,
    };
  }

  /**
   * Generate a complete HTML report document.
   */
  generate(results: SuiteResult): string {
    const title = this.options.title ?? `Inspect Report - ${results.name}`;
    const stats = this.getStats(results);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  <style>${this.getCSS()}${this.options.customCSS ?? ""}</style>
</head>
<body>
  <div class="container">
    ${this.renderHeader(results, stats)}
    ${this.renderSummaryCards(stats)}
    ${this.renderFilters()}
    ${this.renderTestList(results)}
  </div>
  ${this.options.interactive ? `<script>${this.getJS()}</script>` : ""}
</body>
</html>`;
  }

  // ── Section renderers ──────────────────────────────────────────────────

  private renderHeader(results: SuiteResult, stats: ReturnType<typeof this.getStats>): string {
    const date = new Date(results.startedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const statusClass = stats.failed > 0 ? "fail" : "pass";

    return `
    <header>
      <div class="header-content">
        <h1>Inspect Test Report</h1>
        <div class="suite-info">
          <span class="suite-name">${escapeHTML(results.name)}</span>
          <span class="suite-date">${date}</span>
        </div>
      </div>
      <div class="overall-status ${statusClass}">
        ${stats.failed > 0 ? "FAILED" : "PASSED"}
      </div>
    </header>`;
  }

  private renderSummaryCards(stats: ReturnType<typeof this.getStats>): string {
    return `
    <section class="summary-cards">
      <div class="card">
        <div class="card-value">${stats.total}</div>
        <div class="card-label">Total Tests</div>
      </div>
      <div class="card card-pass">
        <div class="card-value">${stats.passed}</div>
        <div class="card-label">Passed</div>
      </div>
      <div class="card card-fail">
        <div class="card-value">${stats.failed}</div>
        <div class="card-label">Failed</div>
      </div>
      <div class="card">
        <div class="card-value">${stats.passRate}%</div>
        <div class="card-label">Pass Rate</div>
      </div>
      <div class="card">
        <div class="card-value">${this.formatDuration(stats.totalDuration)}</div>
        <div class="card-label">Duration</div>
      </div>
    </section>`;
  }

  private renderFilters(): string {
    if (!this.options.interactive) return "";

    return `
    <section class="filters">
      <button class="filter-btn active" data-filter="all">All</button>
      <button class="filter-btn" data-filter="passed">Passed</button>
      <button class="filter-btn" data-filter="failed">Failed</button>
      <button class="filter-btn" data-filter="skipped">Skipped</button>
      <input type="text" class="search-input" placeholder="Search tests..." id="searchInput">
    </section>`;
  }

  private renderTestList(results: SuiteResult): string {
    const tests = results.tests
      .sort((a, b) => {
        // Failed first
        const order: Record<string, number> = { failed: 0, error: 0, passed: 1, skipped: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
      })
      .map((test) => this.renderTest(test))
      .join("\n");

    return `<section class="test-list">${tests}</section>`;
  }

  private renderTest(test: TestResult): string {
    const statusClass =
      test.status === "passed" ? "pass" : test.status === "failed" ? "fail" : "skip";
    const duration = this.formatDuration(test.duration);

    return `
    <div class="test-item ${statusClass}" data-status="${test.status}">
      <div class="test-header" onclick="toggleTest(this)">
        <span class="test-status-badge ${statusClass}">${test.status.toUpperCase()}</span>
        <span class="test-name">${escapeHTML(test.name)}</span>
        <span class="test-meta">
          <span class="test-steps">${test.steps.length} steps</span>
          <span class="test-duration">${duration}</span>
        </span>
      </div>
      <div class="test-details" style="display: none;">
        ${test.error ? this.renderError(test.error) : ""}
        ${this.renderSteps(test.steps)}
        ${this.renderScreenshots(test.screenshots)}
        ${test.consoleErrors?.length ? this.renderConsoleErrors(test.consoleErrors) : ""}
      </div>
    </div>`;
  }

  private renderError(error: TestResult["error"]): string {
    if (!error) return "";

    return `
      <div class="error-block">
        <div class="error-message">${escapeHTML(error.message)}</div>
        ${error.stack ? `<pre class="error-stack">${escapeHTML(error.stack)}</pre>` : ""}
        ${error.screenshot ? `<img class="error-screenshot" src="${escapeHTML(error.screenshot)}" alt="Error screenshot" onclick="openLightbox(this.src)">` : ""}
      </div>`;
  }

  private renderSteps(steps: TestStep[]): string {
    if (steps.length === 0) return "";

    const rows = steps
      .map((step) => {
        const statusClass =
          step.status === "passed" ? "pass" : step.status === "failed" ? "fail" : "skip";

        return `
        <tr class="${statusClass}">
          <td>${step.index}</td>
          <td><code>${escapeHTML(step.action)}</code></td>
          <td>${step.target ? escapeHTML(step.target) : "-"}</td>
          <td>${step.value ? escapeHTML(truncate(step.value, 50)) : "-"}</td>
          <td><span class="step-status ${statusClass}">${step.status}</span></td>
          <td>${step.duration}ms</td>
        </tr>
        ${step.error ? `<tr class="step-error"><td colspan="6">${escapeHTML(step.error)}</td></tr>` : ""}
        ${step.thought ? `<tr class="step-thought"><td colspan="6"><em>${escapeHTML(truncate(step.thought, 200))}</em></td></tr>` : ""}`;
      })
      .join("\n");

    return `
      <div class="steps-section">
        <h4>Steps</h4>
        <table class="steps-table">
          <thead>
            <tr><th>#</th><th>Action</th><th>Target</th><th>Value</th><th>Status</th><th>Time</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  private renderScreenshots(screenshots: Screenshot[]): string {
    if (screenshots.length === 0) return "";

    const items = screenshots
      .map((ss) => {
        let src: string;
        if (ss.data) {
          // Validate base64 data contains only safe characters
          const safeData = ss.data.replace(/[^A-Za-z0-9+/=]/g, "");
          src = `data:image/png;base64,${safeData}`;
        } else {
          src = escapeHTML(ss.path ?? "");
        }
        return `
        <div class="screenshot-item">
          <img src="${src}" alt="${escapeHTML(ss.name)}" onclick="openLightbox(this.src)" loading="lazy">
          <div class="screenshot-label">${escapeHTML(ss.name)}</div>
        </div>`;
      })
      .join("\n");

    return `
      <div class="screenshots-section">
        <h4>Screenshots (${screenshots.length})</h4>
        <div class="screenshot-grid">${items}</div>
      </div>`;
  }

  private renderConsoleErrors(errors: string[]): string {
    return `
      <div class="console-errors-section">
        <h4>Console Errors (${errors.length})</h4>
        <pre class="console-errors">${errors.slice(0, 20).map(escapeHTML).join("\n")}</pre>
      </div>`;
  }

  // ── CSS ──────────────────────────────────────────────────────────────

  private getCSS(): string {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
      .container { max-width: 1200px; margin: 0 auto; padding: 20px; }

      header { display: flex; justify-content: space-between; align-items: center; padding: 24px; background: #fff; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .header-content h1 { font-size: 24px; margin-bottom: 4px; }
      .suite-name { font-weight: 600; }
      .suite-date { color: #666; margin-left: 12px; }
      .overall-status { font-size: 18px; font-weight: 700; padding: 8px 20px; border-radius: 6px; }
      .overall-status.pass { background: #d4edda; color: #155724; }
      .overall-status.fail { background: #f8d7da; color: #721c24; }

      .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
      .card { background: #fff; padding: 16px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .card-value { font-size: 28px; font-weight: 700; }
      .card-label { font-size: 13px; color: #666; margin-top: 4px; }
      .card-pass .card-value { color: #28a745; }
      .card-fail .card-value { color: #dc3545; }

      .filters { display: flex; gap: 8px; margin-bottom: 20px; align-items: center; flex-wrap: wrap; }
      .filter-btn { padding: 6px 16px; border: 1px solid #ddd; border-radius: 20px; background: #fff; cursor: pointer; font-size: 13px; transition: all 0.2s; }
      .filter-btn.active { background: #333; color: #fff; border-color: #333; }
      .search-input { padding: 6px 12px; border: 1px solid #ddd; border-radius: 20px; font-size: 13px; margin-left: auto; min-width: 200px; }

      .test-item { background: #fff; border-radius: 8px; margin-bottom: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid #ddd; }
      .test-item.pass { border-left-color: #28a745; }
      .test-item.fail { border-left-color: #dc3545; }
      .test-item.skip { border-left-color: #ffc107; }

      .test-header { display: flex; align-items: center; padding: 12px 16px; cursor: pointer; gap: 12px; }
      .test-header:hover { background: #f8f9fa; }
      .test-status-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
      .test-status-badge.pass { background: #d4edda; color: #155724; }
      .test-status-badge.fail { background: #f8d7da; color: #721c24; }
      .test-status-badge.skip { background: #fff3cd; color: #856404; }
      .test-name { flex: 1; font-weight: 500; }
      .test-meta { display: flex; gap: 12px; font-size: 13px; color: #666; }

      .test-details { padding: 16px; border-top: 1px solid #eee; }

      .error-block { background: #fff5f5; border: 1px solid #f5c6cb; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
      .error-message { color: #721c24; font-weight: 600; margin-bottom: 8px; }
      .error-stack { font-size: 12px; color: #666; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
      .error-screenshot { max-width: 400px; margin-top: 8px; border-radius: 4px; cursor: pointer; }

      .steps-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
      .steps-table th, .steps-table td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; }
      .steps-table th { background: #f8f9fa; font-weight: 600; }
      .step-status { font-size: 11px; font-weight: 600; }
      .step-status.pass { color: #28a745; }
      .step-status.fail { color: #dc3545; }
      .step-error td { color: #dc3545; font-size: 12px; background: #fff5f5; }
      .step-thought td { color: #666; font-size: 12px; }

      .screenshot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 8px; }
      .screenshot-item img { width: 100%; border-radius: 4px; cursor: pointer; border: 1px solid #eee; }
      .screenshot-label { font-size: 12px; color: #666; margin-top: 4px; text-align: center; }

      .console-errors { font-size: 12px; background: #1e1e1e; color: #f8f8f2; padding: 12px; border-radius: 6px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; }

      h4 { font-size: 14px; margin: 12px 0 8px; color: #555; }

      #lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; }
      #lightbox img { max-width: 90vw; max-height: 90vh; border-radius: 8px; }
      #lightbox.active { display: flex; }
    `;
  }

  // ── JavaScript ─────────────────────────────────────────────────────────

  private getJS(): string {
    return `
      // Toggle test details
      function toggleTest(header) {
        const details = header.nextElementSibling;
        details.style.display = details.style.display === 'none' ? 'block' : 'none';
      }

      // Filter buttons
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.dataset.filter;
          document.querySelectorAll('.test-item').forEach(item => {
            if (filter === 'all' || item.dataset.status === filter) {
              item.style.display = '';
            } else {
              item.style.display = 'none';
            }
          });
        });
      });

      // Search
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const query = e.target.value.toLowerCase();
          document.querySelectorAll('.test-item').forEach(item => {
            const name = item.querySelector('.test-name').textContent.toLowerCase();
            item.style.display = name.includes(query) ? '' : 'none';
          });
        });
      }

      // Lightbox
      const lightbox = document.createElement('div');
      lightbox.id = 'lightbox';
      lightbox.innerHTML = '<img>';
      lightbox.addEventListener('click', () => lightbox.classList.remove('active'));
      document.body.appendChild(lightbox);

      function openLightbox(src) {
        lightbox.querySelector('img').src = src;
        lightbox.classList.add('active');
      }
    `;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private getStats(results: SuiteResult) {
    const total = results.tests.length;
    const passed = results.tests.filter((t) => t.status === "passed").length;
    const failed = results.tests.filter(
      (t) => t.status === "failed" || t.status === "error",
    ).length;
    const skipped = results.tests.filter((t) => t.status === "skipped").length;
    const totalDuration = results.finishedAt - results.startedAt;
    const passRate = total > 0 ? Math.round((passed / Math.max(total - skipped, 1)) * 100) : 0;

    return { total, passed, failed, skipped, totalDuration, passRate };
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = ((ms % 60_000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
