import { getHealth, getModels, getDevices, listSessions, listRuns, getA11yResults, getPerfResults } from "../lib/api.js";

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

// ============================================================================
// Mock data — used when API is unavailable
// ============================================================================

interface RunEntry {
  id: string;
  instruction: string;
  status: string;
  agent: string;
  device: string;
  duration: number;
  timestamp: string;
}

interface TrendEntry {
  date: string;
  passRate: number;
}

function getMockRuns(): RunEntry[] {
  const now = Date.now();
  return [
    { id: "run-a1b2c3d4", instruction: "Test login flow and verify error messages on invalid credentials", status: "pass", agent: "claude-sonnet", device: "Desktop Chrome", duration: 14320, timestamp: new Date(now - 120000).toISOString() },
    { id: "run-e5f6g7h8", instruction: "Verify checkout process with guest user", status: "pass", agent: "gpt-4o", device: "iPhone 15 Pro", duration: 22450, timestamp: new Date(now - 3600000).toISOString() },
    { id: "run-i9j0k1l2", instruction: "Check accessibility of navigation menu", status: "fail", agent: "claude-sonnet", device: "Desktop Firefox", duration: 8930, timestamp: new Date(now - 7200000).toISOString() },
    { id: "run-m3n4o5p6", instruction: "Test search functionality with special characters", status: "pass", agent: "gemini-pro", device: "Pixel 8", duration: 11200, timestamp: new Date(now - 14400000).toISOString() },
    { id: "run-q7r8s9t0", instruction: "Validate form submission with missing required fields", status: "pass", agent: "claude-sonnet", device: "Desktop Chrome", duration: 9750, timestamp: new Date(now - 28800000).toISOString() },
    { id: "run-u1v2w3x4", instruction: "Verify responsive layout on tablet viewport", status: "fail", agent: "gpt-4o", device: "iPad Pro", duration: 18600, timestamp: new Date(now - 43200000).toISOString() },
    { id: "run-y5z6a7b8", instruction: "Test password reset email flow end-to-end", status: "pass", agent: "claude-sonnet", device: "Desktop Chrome", duration: 25100, timestamp: new Date(now - 86400000).toISOString() },
    { id: "run-c9d0e1f2", instruction: "Check dark mode toggle persists across pages", status: "pass", agent: "deepseek-chat", device: "Desktop Chrome", duration: 7200, timestamp: new Date(now - 172800000).toISOString() },
  ];
}

function getMockTrend(): TrendEntry[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toISOString().slice(0, 10),
      passRate: Math.floor(60 + Math.random() * 35),
    };
  });
}

// ============================================================================
// Component renderers
// ============================================================================

function scoreGauge(label: string, score: number, max: number = 100): string {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--yellow)" : "var(--red)";
  return `
    <div class="score-gauge">
      <div class="gauge-ring" style="background: conic-gradient(${color} ${pct * 3.6}deg, var(--bg-elevated) 0)">
        <div class="gauge-inner">
          <span class="gauge-value">${score}</span>
        </div>
      </div>
      <div class="gauge-label">${escapeHtml(label)}</div>
    </div>
  `;
}

function recentRunsTable(runs: RunEntry[]): string {
  if (runs.length === 0) {
    return '<div class="empty-state"><p>No test runs yet. Run <code>inspect test</code> to get started.</p></div>';
  }
  return `
    <div class="table-container">
      <table>
        <thead><tr><th>Status</th><th>Instruction</th><th>Agent</th><th>Device</th><th>Duration</th><th>Time</th></tr></thead>
        <tbody>
          ${runs.map(r => `
            <tr onclick="window.location.hash='/tasks/${r.id}'" style="cursor:pointer">
              <td><span class="badge ${r.status === "pass" ? "badge-green" : r.status === "fail" ? "badge-red" : "badge-blue"}">${escapeHtml(r.status)}</span></td>
              <td>${escapeHtml(r.instruction.slice(0, 60))}${r.instruction.length > 60 ? "..." : ""}</td>
              <td><span style="font-family:var(--font-mono);font-size:12px">${escapeHtml(r.agent)}</span></td>
              <td style="color:var(--text-dim)">${escapeHtml(r.device)}</td>
              <td style="font-family:var(--font-mono)">${formatDuration(r.duration)}</td>
              <td style="color:var(--text-dim)">${formatTime(r.timestamp)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function passRateTrend(data: TrendEntry[]): string {
  return `
    <div class="trend-chart">
      ${data.map(d => `
        <div class="trend-bar-container">
          <div class="trend-bar" style="height:${d.passRate}%;background:${d.passRate >= 80 ? "var(--green)" : d.passRate >= 50 ? "var(--yellow)" : "var(--red)"}"></div>
          <div class="trend-label">${escapeHtml(d.date.slice(5))}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ============================================================================
// Main render
// ============================================================================

export async function renderDashboard(container: HTMLElement): Promise<void> {
  let healthData = {
    status: "unknown",
    uptime: 0,
    version: "?",
    checks: {} as Record<string, { status: string; message?: string }>,
  };
  let modelsData = { models: [] as Array<{ key: string; provider: string }>, total: 0 };
  let devicesData = { devices: [] as Array<{ key: string }>, total: 0 };
  let sessionsData = { sessions: [] as Array<{ id: string; status: string }>, total: 0 };

  try {
    [healthData, modelsData, devicesData, sessionsData] = await Promise.all([
      getHealth().catch(() => healthData),
      getModels().catch(() => modelsData),
      getDevices().catch(() => devicesData),
      listSessions().catch(() => sessionsData as { sessions: Array<{ id: string; status: string; browserType: string; createdAt: number }>; total: number }),
    ]);
  } catch { /* use defaults */ }

  const uptimeStr = healthData.uptime > 60000
    ? `${Math.round(healthData.uptime / 60000)}m`
    : `${Math.round(healthData.uptime / 1000)}s`;

  const providerCount = new Set(modelsData.models.map((m) => m.provider)).size;
  const activeSessions = sessionsData.sessions.filter((s) => s.status === "active").length;

  const checks = Object.entries(healthData.checks);

  // Fetch real data from API (falls back gracefully)
  const [runsData, a11yData, perfData] = await Promise.all([
    listRuns(8).catch(() => ({ runs: [], total: 0 })),
    getA11yResults().catch(() => null),
    getPerfResults().catch(() => null),
  ]);

  const recentRuns: RunEntry[] = runsData.runs.map((r: any) => ({
    id: r.id,
    instruction: r.instruction ?? r.definition?.prompt ?? "Test run",
    status: r.status,
    agent: r.agent ?? "unknown",
    device: r.device ?? "Desktop",
    duration: r.duration ?? r.totalDuration ?? 0,
    timestamp: r.timestamp ?? new Date(r.createdAt).toISOString(),
  }));

  // Compute trend from recent runs
  const trendData: TrendEntry[] = [];
  const runsByDay = new Map<string, { total: number; passed: number }>();
  for (const r of recentRuns) {
    const day = r.timestamp.slice(0, 10);
    const entry = runsByDay.get(day) ?? { total: 0, passed: 0 };
    entry.total++;
    if (r.status === "pass" || r.status === "completed") entry.passed++;
    runsByDay.set(day, entry);
  }
  for (const [date, counts] of runsByDay) {
    trendData.push({ date, passRate: counts.total > 0 ? Math.round((counts.passed / counts.total) * 100) : 0 });
  }

  const totalRuns = recentRuns.length;
  const passCount = recentRuns.filter((r) => r.status === "pass" || r.status === "completed").length;
  const overallPassRate = totalRuns > 0 ? Math.round((passCount / totalRuns) * 100) : 0;

  // Quality scores from real audits (default to -- if no data)
  const a11yScore = a11yData?.score ?? 0;
  const perfScore = perfData?.scores?.performance ?? 0;
  const seoScore = perfData?.scores?.seo ?? 0;
  const secScore = 0; // Security score computed separately

  container.innerHTML = `
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>Inspect AI-Powered Browser Testing Platform</p>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-label">Server Status</div>
        <div class="card-value ${healthData.status === "healthy" ? "green" : "red"}">${escapeHtml(healthData.status)}</div>
        <div class="card-detail">Uptime: ${uptimeStr} | v${escapeHtml(healthData.version)}</div>
      </div>
      <div class="card">
        <div class="card-label">LLM Models</div>
        <div class="card-value blue">${modelsData.total}</div>
        <div class="card-detail">${providerCount} providers available</div>
      </div>
      <div class="card">
        <div class="card-label">Device Presets</div>
        <div class="card-value">${devicesData.total}</div>
        <div class="card-detail">Mobile, tablet, desktop</div>
      </div>
      <div class="card">
        <div class="card-label">Active Sessions</div>
        <div class="card-value ${activeSessions > 0 ? "green" : ""}">${activeSessions}</div>
        <div class="card-detail">${sessionsData.total} total sessions</div>
      </div>
    </div>

    <div class="two-col" style="margin-bottom:24px">
      <div class="card">
        <div class="section-header" style="margin-bottom:12px">
          <h3>Quality Scores</h3>
        </div>
        <div class="gauge-grid">
          ${scoreGauge("Accessibility", a11yScore)}
          ${scoreGauge("Performance", perfScore)}
          ${scoreGauge("SEO", seoScore)}
          ${scoreGauge("Security", secScore)}
        </div>
      </div>
      <div class="card">
        <div class="section-header" style="margin-bottom:12px">
          <h3>Pass Rate Trend</h3>
          <span class="badge ${overallPassRate >= 80 ? "badge-green" : overallPassRate >= 50 ? "badge-yellow" : "badge-red"}">${overallPassRate}% overall</span>
        </div>
        ${passRateTrend(trendData)}
      </div>
    </div>

    <div class="section-header">
      <h3>Health Checks</h3>
    </div>
    <div class="table-container" style="margin-bottom:24px">
      <table>
        <thead>
          <tr><th>Check</th><th>Status</th><th>Message</th></tr>
        </thead>
        <tbody>
          ${checks.length > 0 ? checks.map(([name, check]) => `
            <tr>
              <td>${escapeHtml(name)}</td>
              <td><span class="badge ${check.status === "ok" ? "badge-green" : "badge-red"}">${escapeHtml(check.status)}</span></td>
              <td style="color: var(--text-dim)">${escapeHtml(check.message ?? "-")}</td>
            </tr>
          `).join("") : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">No health checks available — start the API server with <code>inspect serve</code></td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="section-header">
      <h3>Recent Test Runs</h3>
      <a href="#/tasks" class="btn btn-secondary" style="font-size:12px;padding:4px 12px">View all</a>
    </div>
    ${recentRunsTable(recentRuns)}

    <div style="margin-top: 24px">
      <div class="section-header">
        <h3>Quick Actions</h3>
      </div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <a href="#/tasks" class="btn btn-primary">New Task</a>
        <a href="#/workflows" class="btn btn-secondary">Workflows</a>
        <a href="#/visual" class="btn btn-secondary">Visual Diff</a>
        <a href="#/models" class="btn btn-secondary">Browse Models</a>
        <a href="#/sessions" class="btn btn-secondary">Sessions</a>
        <a href="#/credentials" class="btn btn-secondary">Credentials</a>
        <a href="#/reports" class="btn btn-secondary">Reports</a>
        <a href="#/settings" class="btn btn-secondary">Settings</a>
      </div>
    </div>
  `;
}
