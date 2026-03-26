import { getModels } from "../lib/api.js";

export async function renderModels(container: HTMLElement): Promise<void> {
  let models: Array<{ key: string; id: string; name: string; provider: string; supportsVision: boolean; supportsThinking: boolean; costPer1kInput: number; costPer1kOutput: number }> = [];

  try {
    const data = await getModels();
    models = data.models;
  } catch { /* empty */ }

  const providers = [...new Set(models.map((m) => m.provider))];

  container.innerHTML = `
    <div class="page-header">
      <h2>LLM Models</h2>
      <p>${models.length} models across ${providers.length} providers</p>
    </div>

    <div style="margin-bottom: 16px; display: flex; gap: 8px;">
      <button class="btn btn-secondary provider-filter active" data-provider="all">All</button>
      ${providers.map((p) => `<button class="btn btn-secondary provider-filter" data-provider="${p}">${p}</button>`).join("")}
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr><th>Model</th><th>Provider</th><th>Vision</th><th>Thinking</th><th>Input $/1k</th><th>Output $/1k</th></tr>
        </thead>
        <tbody id="models-body">
          ${renderModelRows(models)}
        </tbody>
      </table>
    </div>
  `;

  // Filter buttons
  container.querySelectorAll(".provider-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".provider-filter").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const provider = (btn as HTMLElement).dataset.provider;
      const filtered = provider === "all" ? models : models.filter((m) => m.provider === provider);
      const tbody = container.querySelector("#models-body") as HTMLElement;
      tbody.innerHTML = renderModelRows(filtered);
    });
  });
}

function renderModelRows(models: Array<{ key: string; name: string; provider: string; supportsVision: boolean; supportsThinking: boolean; costPer1kInput: number; costPer1kOutput: number }>): string {
  if (models.length === 0) return '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No models found</td></tr>';
  return models.map((m) => `
    <tr>
      <td><strong>${m.name}</strong><br><span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${m.key}</span></td>
      <td><span class="badge badge-blue">${m.provider}</span></td>
      <td>${m.supportsVision ? '<span class="badge badge-green">yes</span>' : '<span class="badge badge-dim">-</span>'}</td>
      <td>${m.supportsThinking ? '<span class="badge badge-green">yes</span>' : '<span class="badge badge-dim">-</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:12px">$${m.costPer1kInput?.toFixed(4) ?? "-"}</td>
      <td style="font-family:var(--font-mono);font-size:12px">$${m.costPer1kOutput?.toFixed(4) ?? "-"}</td>
    </tr>
  `).join("");
}
