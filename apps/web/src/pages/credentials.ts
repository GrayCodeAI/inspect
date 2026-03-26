import { listCredentials } from "../lib/api.js";

export async function renderCredentials(container: HTMLElement): Promise<void> {
  let credentials: Array<{ id: string; label: string; type: string; provider: string; domain?: string }> = [];

  try {
    credentials = await listCredentials();
  } catch { /* empty */ }

  container.innerHTML = `
    <div class="page-header">
      <h2>Credentials</h2>
      <p>Manage stored credentials for authenticated testing</p>
    </div>

    ${credentials.length > 0 ? `
      <div class="table-container">
        <table>
          <thead><tr><th>Label</th><th>Type</th><th>Provider</th><th>Domain</th></tr></thead>
          <tbody>
            ${credentials.map((c) => `
              <tr>
                <td><strong>${c.label}</strong><br><span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${c.id.slice(0, 8)}</span></td>
                <td><span class="badge badge-blue">${c.type}</span></td>
                <td>${c.provider}</td>
                <td style="color:var(--text-dim)">${c.domain ?? "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state"><h3>No credentials stored</h3><p>Add credentials via CLI: <code>inspect credentials add --name "My Login" --type password</code></p></div>'}
  `;
}
