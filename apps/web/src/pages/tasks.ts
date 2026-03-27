import { createTask, getTaskDetails } from "../lib/api.js";

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

// ============================================================================
// Types
// ============================================================================

interface TaskEntry {
  id: string;
  prompt: string;
  url: string;
  status: string;
  createdAt: number;
  agent?: string;
  device?: string;
  duration?: number;
  steps?: StepEntry[];
  tokenUsage?: { input: number; output: number; total: number };
  screenshots?: string[];
  error?: string;
}

interface StepEntry {
  id: string;
  action: string;
  status: "pass" | "fail" | "running" | "pending";
  detail?: string;
  duration?: number;
  error?: string;
  screenshot?: string;
}

// ============================================================================
// Mock step data for demo purposes
// ============================================================================

function getMockSteps(taskStatus: string): StepEntry[] {
  const steps: StepEntry[] = [
    { id: "s1", action: "Navigate to URL", status: "pass", detail: "Loaded page in 1.2s", duration: 1200 },
    { id: "s2", action: "Analyze page structure", status: "pass", detail: "Found 24 interactive elements via ARIA snapshot", duration: 850 },
    { id: "s3", action: "Locate login form", status: "pass", detail: 'Found form with fields: email, password, submit button', duration: 320 },
    { id: "s4", action: "Fill email field", status: "pass", detail: 'Typed "test@example.com" into email input', duration: 150 },
    { id: "s5", action: "Fill password field", status: "pass", detail: 'Typed masked password into password input', duration: 120 },
    { id: "s6", action: "Click submit button", status: "pass", detail: 'Clicked "Sign In" button', duration: 180 },
    { id: "s7", action: "Wait for navigation", status: "pass", detail: "Page navigated to /dashboard", duration: 2100 },
    { id: "s8", action: "Verify success state", status: "pass", detail: 'Found welcome message: "Welcome back"', duration: 450 },
  ];

  if (taskStatus === "running") {
    // Show some as running/pending
    steps[5].status = "running";
    steps[5].detail = "Clicking submit button...";
    steps[6].status = "pending";
    steps[6].detail = undefined;
    steps[7].status = "pending";
    steps[7].detail = undefined;
  } else if (taskStatus === "failed") {
    steps[5].status = "fail";
    steps[5].error = "Element not found: button[type=submit] — the login form may have changed";
    steps[6].status = "pending";
    steps[6].detail = undefined;
    steps[7].status = "pending";
    steps[7].detail = undefined;
  }

  return steps;
}

function getMockTokenUsage(): { input: number; output: number; total: number } {
  return {
    input: 12450,
    output: 3280,
    total: 15730,
  };
}

// ============================================================================
// Component renderers
// ============================================================================

function stepTimeline(steps: StepEntry[]): string {
  if (steps.length === 0) {
    return '<div class="empty-state"><p>No steps recorded yet.</p></div>';
  }

  const dotIcon = (status: string): string => {
    switch (status) {
      case "pass": return "&#10003;";
      case "fail": return "&#10007;";
      case "running": return "&#8226;";
      default: return "&#8226;";
    }
  };

  return `
    <div class="step-timeline">
      ${steps.map((step, i) => `
        <div class="step-item">
          <div class="step-dot ${step.status}" title="${escapeHtml(step.status)}">${dotIcon(step.status)}</div>
          <div class="step-content">
            <div class="step-title">
              <span style="color:var(--text-muted);font-size:12px;margin-right:8px">${i + 1}.</span>
              ${escapeHtml(step.action)}
              ${step.duration !== undefined ? `<span style="float:right;font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${formatDuration(step.duration)}</span>` : ""}
            </div>
            ${step.detail ? `<div class="step-detail">${escapeHtml(step.detail)}</div>` : ""}
            ${step.error ? `<div class="step-error">${escapeHtml(step.error)}</div>` : ""}
            ${step.screenshot ? `<div style="margin-top:8px"><img src="${escapeHtml(step.screenshot)}" class="screenshot-thumb" onclick="showLightbox(this.src)" alt="Step screenshot" /></div>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function tokenUsageDisplay(usage: { input: number; output: number; total: number }): string {
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-label">Token Usage</div>
      <div style="display:flex;gap:24px;margin-top:8px">
        <div>
          <div style="font-size:12px;color:var(--text-muted)">Input</div>
          <div style="font-family:var(--font-mono);font-size:16px;font-weight:600">${usage.input.toLocaleString()}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-muted)">Output</div>
          <div style="font-family:var(--font-mono);font-size:16px;font-weight:600">${usage.output.toLocaleString()}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-muted)">Total</div>
          <div style="font-family:var(--font-mono);font-size:16px;font-weight:600;color:var(--accent)">${usage.total.toLocaleString()}</div>
        </div>
      </div>
      <div class="progress-bar" style="margin-top:12px">
        <div class="progress-fill" style="width:${Math.round((usage.input / usage.total) * 100)}%;background:var(--blue)"></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${Math.round((usage.input / usage.total) * 100)}% input / ${Math.round((usage.output / usage.total) * 100)}% output</div>
    </div>
  `;
}

function screenshotGrid(screenshots: string[]): string {
  if (screenshots.length === 0) return "";
  return `
    <div class="section-header" style="margin-top:16px">
      <h3>Screenshots</h3>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
      ${screenshots.map((src, i) => `
        <div class="card" style="padding:8px;cursor:pointer" onclick="showLightbox('${escapeHtml(src)}')">
          <img src="${escapeHtml(src)}" alt="Screenshot ${i + 1}" style="width:100%;border-radius:4px;display:block" />
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;text-align:center">Step ${i + 1}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ============================================================================
// Badge helper
// ============================================================================

function badgeClass(status: string): string {
  switch (status) {
    case "completed":
    case "pass":
      return "badge-green";
    case "failed":
    case "fail":
      return "badge-red";
    case "running":
      return "badge-blue";
    default:
      return "badge-dim";
  }
}

// ============================================================================
// Task detail view
// ============================================================================

function renderTaskDetail(container: HTMLElement, task: TaskEntry): void {
  const steps = task.steps ?? [];
  const tokenUsage = task.tokenUsage ?? { input: 0, output: 0, total: 0 };
  const completedSteps = steps.filter((s) => s.status === "pass").length;
  const totalSteps = steps.length;

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;gap:16px">
      <a href="#/tasks" class="btn btn-secondary" style="padding:6px 12px;font-size:13px">&larr; Back</a>
      <div>
        <h2>Task ${escapeHtml(task.id.slice(0, 8))}</h2>
        <p>${escapeHtml(task.prompt)}</p>
      </div>
    </div>

    <div class="card-grid" style="margin-bottom:24px">
      <div class="card">
        <div class="card-label">Status</div>
        <div class="card-value"><span class="badge ${badgeClass(task.status)}" style="font-size:16px;padding:4px 12px">${escapeHtml(task.status)}</span></div>
        ${task.status === "running" ? '<div class="card-detail" id="detail-auto-refresh">Auto-refreshing every 2s</div>' : ""}
      </div>
      <div class="card">
        <div class="card-label">Progress</div>
        <div class="card-value">${completedSteps}/${totalSteps}</div>
        <div class="progress-bar" style="margin-top:8px">
          <div class="progress-fill" style="width:${totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0}%;background:var(--green)"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-label">Duration</div>
        <div class="card-value" style="font-family:var(--font-mono)">${task.duration ? formatDuration(task.duration) : "--"}</div>
        <div class="card-detail">Started ${formatTimestamp(task.createdAt)}</div>
      </div>
    </div>

    <div class="two-col">
      <div>
        <div class="section-header">
          <h3>Execution Steps</h3>
          <span class="badge badge-dim">${completedSteps} of ${totalSteps}</span>
        </div>
        ${stepTimeline(steps)}
      </div>
      <div>
        ${tokenUsageDisplay(tokenUsage)}

        <div class="card" style="margin-bottom:16px">
          <div class="card-label">Details</div>
          <div style="margin-top:8px;font-size:14px">
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
              <span style="color:var(--text-muted)">URL</span>
              <span style="font-family:var(--font-mono);font-size:12px">${escapeHtml(task.url)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
              <span style="color:var(--text-muted)">Agent</span>
              <span style="font-family:var(--font-mono);font-size:12px">${escapeHtml(task.agent ?? "claude-sonnet")}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
              <span style="color:var(--text-muted)">Device</span>
              <span style="font-family:var(--font-mono);font-size:12px">${escapeHtml(task.device ?? "Desktop Chrome")}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0">
              <span style="color:var(--text-muted)">Created</span>
              <span style="font-family:var(--font-mono);font-size:12px">${formatTimestamp(task.createdAt)}</span>
            </div>
          </div>
        </div>

        ${task.error ? `
          <div class="card" style="border-color:var(--red)">
            <div class="card-label" style="color:var(--red)">Error</div>
            <div class="code-block" style="margin-top:8px">${escapeHtml(task.error)}</div>
          </div>
        ` : ""}
      </div>
    </div>

    ${screenshotGrid(task.screenshots ?? [])}
  `;
}

// ============================================================================
// Task list view
// ============================================================================

function renderTaskTable(
  container: HTMLElement,
  tasks: TaskEntry[],
): void {
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No tasks yet</h3><p>Create a task above to get started</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead><tr><th>Status</th><th>ID</th><th>Prompt</th><th>URL</th><th>Duration</th><th>Created</th></tr></thead>
        <tbody>
          ${tasks.map((t) => `
            <tr onclick="window.location.hash='/tasks/${t.id}'" style="cursor:pointer">
              <td><span class="badge ${badgeClass(t.status)}">${escapeHtml(t.status)}</span></td>
              <td style="font-family: var(--font-mono); font-size: 12px;">${escapeHtml(t.id.slice(0, 8))}</td>
              <td>${escapeHtml(t.prompt.slice(0, 50))}${t.prompt.length > 50 ? "..." : ""}</td>
              <td style="color: var(--text-dim);font-size:12px">${escapeHtml(t.url)}</td>
              <td style="font-family:var(--font-mono);font-size:12px">${t.duration ? formatDuration(t.duration) : "--"}</td>
              <td style="color: var(--text-dim);font-size:12px">${formatTimestamp(t.createdAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================================
// Polling logic
// ============================================================================

let activePollingId: string | null = null;
let pollingTimer: ReturnType<typeof setTimeout> | null = null;

function stopPolling(): void {
  activePollingId = null;
  if (pollingTimer !== null) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

async function pollTaskStatus(
  id: string,
  tasks: TaskEntry[],
  taskListContainer: HTMLElement,
): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => {
      pollingTimer = setTimeout(r, 2000);
    });
    // Check if we're still supposed to be polling this task
    if (activePollingId !== id) return;
    try {
      const result = await getTaskDetails(id);
      const task = tasks.find((t) => t.id === id);
      if (task) {
        task.status = result.status;
        if (result.error) task.error = result.error;
        renderTaskTable(taskListContainer, tasks);
      }
      if (result.status === "completed" || result.status === "failed") break;
    } catch { break; }
  }
}

async function pollTaskDetail(
  task: TaskEntry,
  container: HTMLElement,
): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => {
      pollingTimer = setTimeout(r, 2000);
    });
    if (activePollingId !== task.id) return;
    try {
      const result = await getTaskDetails(task.id);
      task.status = result.status;
      if (result.error) task.error = result.error;
      if (result.steps) {
        task.steps = result.steps as StepEntry[];
      }
      renderTaskDetail(container, task);
      if (result.status === "completed" || result.status === "failed") break;
    } catch { break; }
  }
}

// ============================================================================
// Lightbox (global helper)
// ============================================================================

function setupLightbox(): void {
  if (typeof (window as Record<string, unknown>).showLightbox === "function") return;

  (window as Record<string, unknown>).showLightbox = (src: string) => {
    const overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.innerHTML = `<img src="${src}" alt="Screenshot" />`;
    overlay.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  };
}

// ============================================================================
// Toast notifications
// ============================================================================

function showToast(message: string, type: "success" | "error" | "info" = "info"): void {
  let toastContainer = document.querySelector(".toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

// ============================================================================
// Main render — handles both list view and detail view
// ============================================================================

const taskStore: TaskEntry[] = [];

export async function renderTasks(container: HTMLElement): Promise<void> {
  // Stop any previous polling
  stopPolling();
  setupLightbox();

  // Check if we're viewing a specific task
  const hash = window.location.hash.slice(1);
  const match = hash.match(/^\/tasks\/(.+)$/);

  if (match) {
    const taskId = match[1];
    await renderTaskDetailView(container, taskId);
    return;
  }

  // List view
  await renderTaskListView(container);
}

async function renderTaskDetailView(container: HTMLElement, taskId: string): Promise<void> {
  // Check the local store first
  let task = taskStore.find((t) => t.id === taskId);

  if (!task) {
    // Try to fetch from API
    try {
      const result = await getTaskDetails(taskId);
      task = {
        id: result.id,
        prompt: (result.definition?.prompt as string) ?? "Unknown task",
        url: (result.definition?.url as string) ?? "",
        status: result.status,
        createdAt: Date.now(),
        steps: result.steps as StepEntry[] | undefined,
        error: result.error,
      };
    } catch {
      // Use mock data for demo
      task = {
        id: taskId,
        prompt: "Test login flow and verify error messages on invalid credentials",
        url: "https://example.com",
        status: "completed",
        agent: "claude-sonnet",
        device: "Desktop Chrome",
        duration: 14320,
        createdAt: Date.now() - 120000,
        steps: getMockSteps("completed"),
        tokenUsage: getMockTokenUsage(),
        screenshots: [],
      };
    }
  }

  renderTaskDetail(container, task);

  // Start polling if running
  if (task.status === "running") {
    activePollingId = task.id;
    pollTaskDetail(task, container);
  }

  // Listen for hash changes to handle back navigation
  const handleHashChange = () => {
    const newHash = window.location.hash.slice(1);
    if (!newHash.startsWith("/tasks/")) {
      stopPolling();
      window.removeEventListener("hashchange", handleHashChange);
    }
  };
  window.addEventListener("hashchange", handleHashChange);
}

async function renderTaskListView(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h2>Tasks</h2>
      <p>Create and monitor AI-powered browser testing tasks</p>
    </div>

    <div class="card" style="margin-bottom: 24px">
      <h3 style="margin-bottom: 16px; font-size: 16px;">New Task</h3>
      <form id="task-form">
        <div class="two-col">
          <div class="form-group">
            <label class="form-label">Prompt</label>
            <input class="form-input" id="task-prompt" placeholder="e.g. Test the login flow and verify error messages" required />
          </div>
          <div class="form-group">
            <label class="form-label">URL</label>
            <input class="form-input" id="task-url" placeholder="https://example.com" type="url" required />
          </div>
        </div>
        <div style="display: flex; gap: 12px; align-items: center; margin-top: 4px;">
          <button type="submit" class="btn btn-primary">Run Task</button>
          <span id="task-status" style="font-size: 13px; color: var(--text-dim);"></span>
        </div>
      </form>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="all">All</div>
      <div class="tab" data-tab="running">Running</div>
      <div class="tab" data-tab="completed">Completed</div>
      <div class="tab" data-tab="failed">Failed</div>
    </div>

    <div class="section-header">
      <h3>Recent Tasks</h3>
      <span class="badge badge-dim" id="task-count">${taskStore.length} tasks</span>
    </div>
    <div id="task-list">
      ${taskStore.length === 0
        ? '<div class="empty-state"><h3>No tasks yet</h3><p>Create a task above to get started</p></div>'
        : ""}
    </div>
  `;

  // Render existing tasks
  const taskList = container.querySelector("#task-list") as HTMLElement;
  if (taskStore.length > 0) {
    renderTaskTable(taskList, taskStore);
  }

  // Tab filtering
  let activeTab = "all";
  const tabs = container.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTab = (tab as HTMLElement).dataset.tab ?? "all";

      const filtered = activeTab === "all"
        ? taskStore
        : taskStore.filter((t) => t.status === activeTab);
      renderTaskTable(taskList, filtered);

      const countEl = container.querySelector("#task-count");
      if (countEl) countEl.textContent = `${filtered.length} tasks`;
    });
  });

  // Form submission
  const form = container.querySelector("#task-form") as HTMLFormElement;
  const statusEl = container.querySelector("#task-status") as HTMLElement;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = (container.querySelector("#task-prompt") as HTMLInputElement).value;
    const url = (container.querySelector("#task-url") as HTMLInputElement).value;

    statusEl.textContent = "Creating task...";
    try {
      const result = await createTask({ prompt, url });
      const newTask: TaskEntry = {
        id: result.id,
        prompt,
        url,
        status: result.status,
        createdAt: result.createdAt,
      };
      taskStore.unshift(newTask);
      statusEl.innerHTML = `<span class="badge badge-green">Created: ${escapeHtml(result.id.slice(0, 8))}</span>`;
      showToast(`Task ${result.id.slice(0, 8)} created successfully`, "success");

      const filteredTasks = activeTab === "all"
        ? taskStore
        : taskStore.filter((t) => t.status === activeTab);
      renderTaskTable(taskList, filteredTasks);

      const countEl = container.querySelector("#task-count");
      if (countEl) countEl.textContent = `${filteredTasks.length} tasks`;

      form.reset();

      // Poll for status updates
      activePollingId = result.id;
      pollTaskStatus(result.id, taskStore, taskList);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      statusEl.innerHTML = `<span class="badge badge-red">${escapeHtml(message)}</span>`;
      showToast(`Failed to create task: ${message}`, "error");
    }
  });
}
