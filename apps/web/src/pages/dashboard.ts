import { getHealth, getModels, getDevices } from "../lib/api.js";

export async function renderDashboard(container: HTMLElement): Promise<void> {
  let healthData = { status: "unknown", uptime: 0, version: "?", checks: {} as Record<string, { status: string; message?: string }> };
  let modelsData = { models: [] as Array<{ key: string; provider: string }>, total: 0 };
  let devicesData = { devices: [] as Array<{ key: string }>, total: 0 };

  try {
    [healthData, modelsData, devicesData] = await Promise.all([
      getHealth().catch(() => healthData),
      getModels().catch(() => modelsData),
      getDevices().catch(() => devicesData),
    ]);
  } catch { /* use defaults */ }

  const uptimeStr = healthData.uptime > 60000
    ? `${Math.round(healthData.uptime / 60000)}m`
    : `${Math.round(healthData.uptime / 1000)}s`;

  const providerCount = new Set(modelsData.models.map((m) => m.provider)).size;

  const checks = Object.entries(healthData.checks);

  container.innerHTML = `
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>Inspect AI-Powered Browser Testing Platform</p>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-label">Server Status</div>
        <div class="card-value ${healthData.status === "healthy" ? "green" : "red"}">${healthData.status}</div>
        <div class="card-detail">Uptime: ${uptimeStr} | v${healthData.version}</div>
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
    </div>

    <div class="section-header">
      <h3>Health Checks</h3>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr><th>Check</th><th>Status</th><th>Message</th></tr>
        </thead>
        <tbody>
          ${checks.length > 0 ? checks.map(([name, check]) => `
            <tr>
              <td>${name}</td>
              <td><span class="badge ${check.status === "ok" ? "badge-green" : "badge-red"}">${check.status}</span></td>
              <td style="color: var(--text-dim)">${check.message ?? "-"}</td>
            </tr>
          `).join("") : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">No health checks available — start the API server with <code>inspect serve</code></td></tr>`}
        </tbody>
      </table>
    </div>

    <div style="margin-top: 24px">
      <div class="section-header">
        <h3>Quick Actions</h3>
      </div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <a href="#/tasks" class="btn btn-primary">New Task</a>
        <a href="#/workflows" class="btn btn-secondary">Workflows</a>
        <a href="#/visual" class="btn btn-secondary">Visual Diff</a>
        <a href="#/models" class="btn btn-secondary">Browse Models</a>
      </div>
    </div>
  `;
}
