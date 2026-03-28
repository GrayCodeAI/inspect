// ============================================================================
// Live Dashboard — Real-time multi-agent test monitoring
// ============================================================================

import {
  getDashboardSnapshot,
  spawnDashboardRun,
  cancelDashboardRun,
  cancelAllDashboardRuns,
  clearDashboardCompleted,
} from "../lib/api.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Run {
  runId: string;
  testName: string;
  device: string;
  browser: string;
  agent: string;
  status: string;
  phase: string;
  currentStep: number;
  totalSteps: number;
  tokenCount: number;
  elapsed: number;
  screenshot?: string;
  agentActivity?: { type: string; target?: string; description: string; timestamp: number };
  logs: Array<{ runId: string; level: string; message: string; timestamp: number }>;
  startedAt: number;
  completedAt?: number;
}

interface Summary {
  totalRuns: number;
  completed: number;
  passed: number;
  failed: number;
  running: number;
  queued: number;
  elapsed: number;
}

// ── State ──────────────────────────────────────────────────────────────────

let runs = new Map<string, Run>();
let summary: Summary = { totalRuns: 0, completed: 0, passed: 0, failed: 0, running: 0, queued: 0, elapsed: 0 };
let logs: Array<{ runId: string; level: string; message: string; timestamp: number }> = [];
let eventSource: EventSource | null = null;
let ws: WebSocket | null = null;

// ── Render ─────────────────────────────────────────────────────────────────

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    queued: '<span class="badge badge-muted">queued</span>',
    running: '<span class="badge badge-warning">running</span>',
    completed: '<span class="badge badge-success">pass</span>',
    failed: '<span class="badge badge-danger">fail</span>',
    cancelled: '<span class="badge badge-muted">cancelled</span>',
  };
  return map[status] ?? `<span class="badge">${esc(status)}</span>`;
}

function renderProgressBar(): string {
  const { totalRuns, passed, failed, running, queued } = summary;
  const pPct = totalRuns > 0 ? (passed / totalRuns) * 100 : 0;
  const fPct = totalRuns > 0 ? (failed / totalRuns) * 100 : 0;
  const rPct = totalRuns > 0 ? (running / totalRuns) * 100 : 0;
  return `
    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-segment pass" style="width:${pPct}%"></div>
        <div class="progress-segment fail" style="width:${fPct}%"></div>
        <div class="progress-segment running" style="width:${rPct}%"></div>
      </div>
      <div class="progress-stats">
        <span>${passed + failed}/${totalRuns}</span>
        <span class="stat-pass">${passed} passed</span>
        <span class="stat-fail">${failed} failed</span>
        <span class="stat-running">${running} running</span>
        ${queued > 0 ? `<span class="stat-queued">${queued} queued</span>` : ""}
      </div>
    </div>`;
}

function renderRunCard(run: Run): string {
  const activity = run.agentActivity && run.status === "running"
    ? `<span class="activity">${esc(run.agentActivity.description)}</span>`
    : "";
  const phaseText = run.status === "running"
    ? `${esc(run.phase)} (${run.currentStep}/${run.totalSteps})`
    : esc(run.status);

  const thumbnail = run.screenshot
    ? `<div class="run-thumbnail"><img src="data:image/png;base64,${run.screenshot}" alt="screenshot" /></div>`
    : "";

  return `
    <div class="run-card ${run.status}" data-run-id="${esc(run.runId)}">
      <div class="run-body">
        <div class="run-info">
          <div class="run-header">
            ${statusBadge(run.status)}
            <strong>${esc(run.device)}</strong>
            <span class="sep">|</span>
            <span class="agent">${esc(run.agent)}</span>
            <span class="sep">|</span>
            <span class="browser">${esc(run.browser)}</span>
            <span class="spacer"></span>
            <span class="meta">${fmtMs(run.elapsed)} &middot; ${run.tokenCount} tok</span>
            ${run.status === "running" || run.status === "queued" ? `<button class="btn-cancel" onclick="window.__cancelRun('${esc(run.runId)}')">&times;</button>` : ""}
          </div>
          <div class="run-phase">${phaseText} ${activity}</div>
          <div class="run-name">${esc(run.testName)}</div>
        </div>
        ${thumbnail}
      </div>
    </div>`;
}

function renderLogs(): string {
  const visible = logs.slice(-12);
  if (visible.length === 0) return '<div class="log-empty">No log entries yet</div>';
  return visible.map((l) => {
    const cls = l.level === "error" ? "log-error" : l.level === "warn" ? "log-warn" : "log-info";
    return `<div class="log-entry ${cls}"><span class="log-time">${fmtTime(l.timestamp)}</span> <span class="log-run">[${esc(l.runId.slice(0, 12))}]</span> ${esc(l.message)}</div>`;
  }).join("");
}

function renderComparison(): string {
  const doneRuns = Array.from(runs.values()).filter((r) => r.status === "completed" || r.status === "failed");
  if (doneRuns.length < 2) return "";

  const rows = doneRuns.map((r) => {
    const passedSteps = r.steps?.filter((s) => s.status === "pass").length ?? 0;
    const totalSteps = r.steps?.length ?? 0;
    const badge = r.status === "completed"
      ? '<span class="badge badge-success">pass</span>'
      : '<span class="badge badge-danger">fail</span>';
    return `<tr>
      <td>${esc(r.device)}</td>
      <td>${badge}</td>
      <td>${fmtMs(r.elapsed)}</td>
      <td>${r.tokenCount}</td>
      <td>${passedSteps}/${totalSteps}</td>
    </tr>`;
  }).join("");

  return `
    <div class="comparison-panel">
      <h3>Run Comparison</h3>
      <table class="compare-table">
        <thead><tr><th>Device</th><th>Status</th><th>Duration</th><th>Tokens</th><th>Steps</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderSpawnForm(): string {
  return `
    <div class="spawn-form">
      <h3>New Test Run</h3>
      <form id="spawn-form" onsubmit="window.__spawnRun(event)">
        <input type="text" id="spawn-instruction" placeholder="Test instruction..." required />
        <input type="text" id="spawn-url" placeholder="URL (optional)" />
        <select id="spawn-device">
          <option value="desktop-chrome">Desktop Chrome</option>
          <option value="desktop-firefox">Desktop Firefox</option>
          <option value="desktop-safari">Desktop Safari</option>
          <option value="iphone-15">iPhone 15</option>
          <option value="pixel-8">Pixel 8</option>
          <option value="ipad-pro">iPad Pro</option>
        </select>
        <select id="spawn-agent">
          <option value="claude">Claude</option>
          <option value="gpt">GPT</option>
          <option value="gemini">Gemini</option>
          <option value="deepseek">DeepSeek</option>
        </select>
        <button type="submit" class="btn-spawn">Spawn Run</button>
      </form>
    </div>`;
}

let containerEl: HTMLElement | null = null;
let searchQuery = "";
let statusFilter = "all";

function fullRender(): void {
  const el = containerEl;
  if (!el) return;

  const filteredRuns = Array.from(runs.values())
    .filter((r) => {
      if (statusFilter !== "all") {
        if (statusFilter === "running" && r.status !== "running" && r.status !== "queued") return false;
        if (statusFilter === "passed" && r.status !== "completed") return false;
        if (statusFilter === "failed" && r.status !== "failed" && r.status !== "cancelled") return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return r.testName.toLowerCase().includes(q) ||
          r.device.toLowerCase().includes(q) ||
          r.agent.toLowerCase().includes(q) ||
          r.runId.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => b.startedAt - a.startedAt);

  const runCards = filteredRuns.map(renderRunCard).join("");

  el.innerHTML = `
    <div class="live-dashboard">
      <div class="dash-header">
        <h2>Live Dashboard</h2>
        <div class="dash-actions">
          <button class="btn-secondary" onclick="window.__clearCompleted()">Clear Done</button>
          <button class="btn-danger" onclick="window.__cancelAll()">Cancel All</button>
        </div>
      </div>
      ${renderProgressBar()}
      <div class="filter-bar">
        <input type="text" id="search-input" placeholder="Search runs..." value="${esc(searchQuery)}" oninput="window.__setSearch(this.value)" />
        <div class="filter-buttons">
          <button class="filter-btn ${statusFilter === "all" ? "active" : ""}" onclick="window.__setFilter('all')">All</button>
          <button class="filter-btn ${statusFilter === "running" ? "active" : ""}" onclick="window.__setFilter('running')">Running</button>
          <button class="filter-btn ${statusFilter === "passed" ? "active" : ""}" onclick="window.__setFilter('passed')">Passed</button>
          <button class="filter-btn ${statusFilter === "failed" ? "active" : ""}" onclick="window.__setFilter('failed')">Failed</button>
        </div>
      </div>
      <div class="runs-grid">${runCards || '<div class="no-runs">No matching runs.</div>'}</div>
      <div class="logs-panel">
        <h3>Logs</h3>
        ${renderLogs()}
      </div>
      ${renderComparison()}
      ${renderSpawnForm()}
    </div>
    <style>${dashboardCSS}</style>`;
}

// ── Notifications ──────────────────────────────────────────────────────────

function notifyRunCompleted(testName: string, passed: boolean): void {
  // Audio beep via Web Audio API
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = passed ? 880 : 440;
    osc.type = passed ? "sine" : "square";
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio not available
  }

  // Browser notification (if permitted)
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`Test ${passed ? "Passed" : "Failed"}`, {
      body: testName.slice(0, 80),
      icon: passed ? undefined : undefined,
      tag: "inspect-run-complete",
    });
  } else if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// ── SSE Connection ─────────────────────────────────────────────────────────

function connectSSE(): void {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource("/api/dashboard/stream");

  eventSource.addEventListener("snapshot", (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    runs.clear();
    for (const r of data.runs) {
      runs.set(r.runId, r);
      logs.push(...r.logs);
    }
    summary = data.summary;
    fullRender();
  });

  eventSource.addEventListener("run:started", (e: MessageEvent) => {
    const run = JSON.parse(e.data);
    runs.set(run.runId, run);
    fullRender();
  });

  eventSource.addEventListener("run:progress", (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const run = runs.get(data.runId);
    if (run) {
      Object.assign(run, {
        phase: data.phase,
        currentStep: data.currentStep,
        totalSteps: data.totalSteps,
        tokenCount: data.tokenCount,
        elapsed: data.elapsed,
        agentActivity: data.agentActivity ?? run.agentActivity,
      });
      fullRender();
    }
  });

  eventSource.addEventListener("run:step_completed", (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const run = runs.get(data.runId);
    if (run) {
      run.logs.push({ runId: run.runId, level: "info", message: `Step ${data.step.index}: ${data.step.description} — ${data.step.status}`, timestamp: Date.now() });
    }
  });

  eventSource.addEventListener("run:log", (e: MessageEvent) => {
    const entry = JSON.parse(e.data);
    logs.push(entry);
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    // Only re-render the log panel
    const logPanel = document.querySelector(".logs-panel");
    if (logPanel) logPanel.innerHTML = `<h3>Logs</h3>${renderLogs()}`;
  });

  eventSource.addEventListener("run:completed", (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const run = runs.get(data.runId);
    if (run) {
      run.status = data.status;
      run.completedAt = Date.now();
      run.phase = "done";
    }
    fullRender();

    // Browser notification + sound
    notifyRunCompleted(run?.testName ?? data.runId, data.status === "completed");
  });

  eventSource.addEventListener("summary:updated", (e: MessageEvent) => {
    summary = JSON.parse(e.data);
    const container = document.querySelector(".progress-container");
    if (container) {
      container.outerHTML = renderProgressBar();
    }
  });

  eventSource.addEventListener("run:screenshot", (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const run = runs.get(data.runId);
    if (run) {
      run.screenshot = data.screenshot;
      fullRender();
    }
  });

  eventSource.onerror = () => {
    // EventSource auto-reconnects; on reconnect it fires "snapshot" to re-hydrate
  };
}

// ── WebSocket connection ───────────────────────────────────────────────────

function connectWS(): void {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    // Subscribe to dashboard channel
    ws?.send(JSON.stringify({ type: "subscribe", data: "dashboard" }));
  };

  ws.onclose = () => {
    ws = null;
    // Reconnect after 3s
    setTimeout(connectWS, 3000);
  };

  ws.onerror = () => {
    // WS not available — fall back to REST only
    ws?.close();
    ws = null;
  };
}

function sendWSCommand(cmd: Record<string, unknown>): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "dashboard:command", channel: "dashboard", data: cmd }));
    return true;
  }
  return false;
}

// ── Global handlers (prefer WS, fall back to REST) ────────────────────────

(window as any).__setSearch = (q: string) => {
  searchQuery = q;
  fullRender();
  // Restore focus/cursor position in search input
  const input = document.getElementById("search-input") as HTMLInputElement;
  if (input) { input.focus(); input.setSelectionRange(q.length, q.length); }
};

(window as any).__setFilter = (f: string) => {
  statusFilter = f;
  fullRender();
};

(window as any).__cancelRun = async (runId: string) => {
  if (sendWSCommand({ type: "cancel_run", runId })) return;
  try {
    await cancelDashboardRun(runId);
  } catch (e) {
    console.error("Cancel failed:", e);
  }
};

(window as any).__cancelAll = async () => {
  if (sendWSCommand({ type: "cancel_all" })) return;
  try {
    await cancelAllDashboardRuns();
  } catch (e) {
    console.error("Cancel all failed:", e);
  }
};

(window as any).__clearCompleted = async () => {
  if (sendWSCommand({ type: "clear" })) {
    for (const [id, run] of runs) {
      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        runs.delete(id);
      }
    }
    fullRender();
    return;
  }
  try {
    await clearDashboardCompleted();
    for (const [id, run] of runs) {
      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        runs.delete(id);
      }
    }
    fullRender();
  } catch (e) {
    console.error("Clear failed:", e);
  }
};

(window as any).__spawnRun = async (e: Event) => {
  e.preventDefault();
  const instruction = (document.getElementById("spawn-instruction") as HTMLInputElement)?.value;
  const url = (document.getElementById("spawn-url") as HTMLInputElement)?.value;
  const device = (document.getElementById("spawn-device") as HTMLSelectElement)?.value;
  const agent = (document.getElementById("spawn-agent") as HTMLSelectElement)?.value;

  if (!instruction) return;

  const config = { instruction, url: url || undefined, agent, devices: [device] };

  if (sendWSCommand({ type: "spawn_run", config })) {
    (document.getElementById("spawn-instruction") as HTMLInputElement).value = "";
    (document.getElementById("spawn-url") as HTMLInputElement).value = "";
    return;
  }

  try {
    await spawnDashboardRun(config);
    (document.getElementById("spawn-instruction") as HTMLInputElement).value = "";
    (document.getElementById("spawn-url") as HTMLInputElement).value = "";
  } catch (err) {
    console.error("Spawn failed:", err);
  }
};

// ── CSS ────────────────────────────────────────────────────────────────────

const dashboardCSS = `
.live-dashboard { max-width: 960px; margin: 0 auto; }
.dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.dash-header h2 { margin: 0; color: #a855f7; }
.dash-actions { display: flex; gap: 0.5rem; }

.progress-container { margin-bottom: 1.5rem; }
.progress-bar { height: 8px; background: #334155; border-radius: 4px; overflow: hidden; display: flex; }
.progress-segment { height: 100%; transition: width 0.3s ease; }
.progress-segment.pass { background: #22c55e; }
.progress-segment.fail { background: #ef4444; }
.progress-segment.running { background: #f59e0b; }
.progress-stats { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.85rem; color: #94a3b8; }
.stat-pass { color: #22c55e; } .stat-fail { color: #ef4444; } .stat-running { color: #f59e0b; } .stat-queued { color: #64748b; }

.filter-bar { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem; }
.filter-bar input { flex: 1; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; }
.filter-bar input:focus { border-color: #a855f7; outline: none; }
.filter-buttons { display: flex; gap: 4px; }
.filter-btn { background: #1e293b; border: 1px solid #334155; color: #94a3b8; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.filter-btn:hover { border-color: #475569; color: #e2e8f0; }
.filter-btn.active { background: #a855f733; border-color: #a855f7; color: #a855f7; }
.runs-grid { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
.run-card { border: 1px solid #334155; border-radius: 8px; padding: 0.75rem 1rem; background: #1e293b; }
.run-card.running { border-color: #f59e0b44; }
.run-card.completed { border-color: #22c55e44; }
.run-card.failed { border-color: #ef444444; }
.run-body { display: flex; gap: 0.75rem; }
.run-info { flex: 1; min-width: 0; }
.run-thumbnail { flex-shrink: 0; width: 120px; height: 72px; border-radius: 4px; overflow: hidden; border: 1px solid #334155; }
.run-thumbnail img { width: 100%; height: 100%; object-fit: cover; }
.run-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.run-header .spacer { flex: 1; }
.run-header .meta { color: #64748b; font-size: 0.8rem; }
.run-header .agent { color: #f97316; }
.run-header .browser { color: #64748b; }
.run-header .sep { color: #334155; }
.run-phase { color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem; }
.run-name { color: #cbd5e1; font-size: 0.85rem; margin-top: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.activity { color: #22d3ee; margin-left: 0.5rem; }
.no-runs { color: #64748b; text-align: center; padding: 2rem; }

.badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
.badge-success { background: #22c55e22; color: #22c55e; }
.badge-danger { background: #ef444422; color: #ef4444; }
.badge-warning { background: #f59e0b22; color: #f59e0b; }
.badge-muted { background: #64748b22; color: #64748b; }

.btn-cancel { background: none; border: 1px solid #ef444466; color: #ef4444; border-radius: 4px; cursor: pointer; padding: 0 6px; font-size: 1rem; }
.btn-cancel:hover { background: #ef444422; }
.btn-secondary { background: #334155; border: none; color: #e2e8f0; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
.btn-secondary:hover { background: #475569; }
.btn-danger { background: #ef444433; border: 1px solid #ef444466; color: #ef4444; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
.btn-danger:hover { background: #ef444455; }

.logs-panel { border: 1px solid #334155; border-radius: 8px; padding: 0.75rem 1rem; background: #0f172a; margin-bottom: 1.5rem; max-height: 300px; overflow-y: auto; }
.logs-panel h3 { margin: 0 0 0.5rem; color: #64748b; font-size: 0.85rem; }
.log-entry { font-family: monospace; font-size: 0.8rem; color: #e2e8f0; padding: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.log-time { color: #64748b; } .log-run { color: #475569; }
.log-error { color: #ef4444; } .log-warn { color: #f59e0b; } .log-info { color: #e2e8f0; }
.log-empty { color: #64748b; font-style: italic; }

.comparison-panel { border: 1px solid #334155; border-radius: 8px; padding: 0.75rem 1rem; background: #1e293b; margin-bottom: 1.5rem; }
.comparison-panel h3 { margin: 0 0 0.75rem; color: #a855f7; font-size: 0.95rem; }
.compare-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.compare-table th { text-align: left; color: #64748b; padding: 4px 8px; border-bottom: 1px solid #334155; }
.compare-table td { padding: 4px 8px; color: #e2e8f0; border-bottom: 1px solid #1e293b; }
.spawn-form { border: 1px solid #334155; border-radius: 8px; padding: 1rem; background: #1e293b; }
.spawn-form h3 { margin: 0 0 0.75rem; color: #a855f7; font-size: 0.95rem; }
.spawn-form form { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.spawn-form input, .spawn-form select { background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; }
.spawn-form input[type="text"] { flex: 1; min-width: 200px; }
.spawn-form input:focus, .spawn-form select:focus { border-color: #a855f7; outline: none; }
.btn-spawn { background: #a855f7; border: none; color: white; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
.btn-spawn:hover { background: #9333ea; }
`;

// ── Page entry point ───────────────────────────────────────────────────────

export function renderLiveDashboard(container: HTMLElement): void {
  containerEl = container;

  // Reset state for fresh render
  runs.clear();
  logs = [];
  summary = { totalRuns: 0, completed: 0, passed: 0, failed: 0, running: 0, queued: 0, elapsed: 0 };

  // Initial render
  fullRender();

  // Connect SSE for real-time updates + WS for bidirectional commands
  connectSSE();
  connectWS();

  // Fetch initial snapshot (SSE will also send one, but this covers the gap)
  getDashboardSnapshot()
    .then((snap) => {
      runs.clear();
      for (const r of snap.runs) {
        runs.set(r.runId, r);
      }
      summary = snap.summary;
      fullRender();
    })
    .catch(() => {
      // API may not be available; SSE will hydrate when it connects
    });
}
