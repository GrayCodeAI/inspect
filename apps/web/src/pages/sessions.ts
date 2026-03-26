import { listSessions } from "../lib/api.js";

export async function renderSessions(container: HTMLElement): Promise<void> {
  let sessions: Array<{ id: string; status: string; browserType: string; createdAt: number }> = [];

  try {
    const data = await listSessions();
    sessions = data.sessions;
  } catch { /* empty */ }

  container.innerHTML = `
    <div class="page-header">
      <h2>Browser Sessions</h2>
      <p>Manage persistent browser sessions</p>
    </div>

    ${sessions.length > 0 ? `
      <div class="table-container">
        <table>
          <thead><tr><th>ID</th><th>Browser</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            ${sessions.map((s) => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:12px">${s.id.slice(0, 12)}</td>
                <td>${s.browserType}</td>
                <td><span class="badge ${s.status === "active" ? "badge-green" : s.status === "idle" ? "badge-yellow" : "badge-dim"}">${s.status}</span></td>
                <td style="color:var(--text-dim)">${new Date(s.createdAt).toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state"><h3>No active sessions</h3><p>Create a session via CLI: <code>inspect sessions create --headed</code></p></div>'}
  `;
}
