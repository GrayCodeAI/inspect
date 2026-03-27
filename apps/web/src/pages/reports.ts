// ============================================================================
// Reports — Browse and view test reports (inspired by Lighthouse viewer)
// ============================================================================

export async function renderReports(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h2>Reports</h2>
      <p>Browse and view test reports</p>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="browse">Browse</div>
      <div class="tab" data-tab="upload">Upload</div>
    </div>

    <div id="reports-content">
      <!-- File upload zone -->
      <div class="card" style="margin-bottom:24px">
        <div class="drop-zone" id="report-drop" style="min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed var(--border);border-radius:var(--radius);cursor:pointer;gap:8px">
          <span style="font-size:24px">&#128196;</span>
          <span style="color:var(--text-muted)">Drop a JSON/HTML report file here, or click to upload</span>
          <span style="color:var(--text-muted);font-size:12px">Supports: Inspect JSON, Lighthouse JSON, JUnit XML</span>
        </div>
        <input type="file" id="report-input" accept=".json,.html,.xml" style="display:none">
      </div>

      <!-- Report viewer iframe/content -->
      <div id="report-viewer" style="display:none">
        <div class="section-header">
          <h3 id="report-title">Report</h3>
          <button class="btn btn-secondary" id="close-report">Close</button>
        </div>
        <div id="report-content" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-top:12px"></div>
      </div>

      <!-- Recent reports list -->
      <div class="section-header">
        <h3>Recent Reports</h3>
      </div>
      <div class="empty-state">
        <h3>No reports yet</h3>
        <p>Run <code>inspect test --reporter html</code> to generate a report, or drop a file above.</p>
      </div>
    </div>
  `;

  // Wire up file upload
  const drop = document.getElementById("report-drop")!;
  const input = document.getElementById("report-input") as HTMLInputElement;
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.style.borderColor = "var(--accent)";
  });
  drop.addEventListener("dragleave", () => {
    drop.style.borderColor = "var(--border)";
  });
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.style.borderColor = "var(--border)";
    const file = e.dataTransfer?.files[0];
    if (file) loadReport(file);
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) loadReport(file);
  });

  document.getElementById("close-report")?.addEventListener("click", () => {
    document.getElementById("report-viewer")!.style.display = "none";
  });
}

function loadReport(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const content = reader.result as string;
    const viewer = document.getElementById("report-viewer")!;
    const contentEl = document.getElementById("report-content")!;
    const title = document.getElementById("report-title")!;

    viewer.style.display = "";
    title.textContent = file.name;

    if (file.name.endsWith(".html")) {
      // Render HTML report in sandboxed iframe
      contentEl.innerHTML = `<iframe srcdoc="${escapeHtml(content)}" style="width:100%;height:80vh;border:none;border-radius:var(--radius)"></iframe>`;
    } else if (file.name.endsWith(".json")) {
      try {
        const data = JSON.parse(content);
        contentEl.innerHTML = renderJsonReport(data);
      } catch {
        contentEl.innerHTML = `<div class="code-block">${escapeHtml(content)}</div>`;
      }
    } else if (file.name.endsWith(".xml")) {
      contentEl.innerHTML = `<div class="code-block">${escapeHtml(content)}</div>`;
    }
  };
  reader.readAsText(file);
}

function renderJsonReport(data: Record<string, unknown>): string {
  // Try to detect Inspect report format
  if (data.instruction && data.steps) {
    const steps = data.steps as Array<{
      action: string;
      result: string;
      evidence?: string;
      error?: string;
    }>;
    const passed = steps.filter((s) => s.result === "pass").length;
    const failed = steps.filter((s) => s.result === "fail").length;

    return `
      <div style="margin-bottom:16px">
        <span class="badge ${(data.status as string) === "pass" ? "badge-green" : "badge-red"}" style="font-size:14px;padding:4px 12px">${data.status}</span>
        <span style="margin-left:12px;font-weight:600">${escapeHtml(data.instruction as string)}</span>
      </div>
      <div style="margin-bottom:16px;color:var(--text-dim)">
        Agent: ${data.agent} | Device: ${data.device} | Duration: ${formatDuration(data.duration as number)}
        | ${passed} passed, ${failed} failed
      </div>
      <div class="step-timeline">
        ${steps
          .map(
            (s, i) => `
          <div class="step-item">
            <div class="step-dot ${s.result}">${s.result === "pass" ? "&#10003;" : "&#10007;"}</div>
            <div class="step-content">
              <div class="step-title">${i + 1}. ${escapeHtml(s.action)}</div>
              ${s.evidence ? `<div class="step-detail">${escapeHtml(s.evidence)}</div>` : ""}
              ${s.error ? `<div class="step-error">${escapeHtml(s.error)}</div>` : ""}
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  }

  // Fallback: pretty-print JSON
  return `<div class="code-block">${escapeHtml(JSON.stringify(data, null, 2))}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
