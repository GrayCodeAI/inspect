import { listWorkflows, createWorkflow } from "../lib/api.js";

export async function renderWorkflows(container: HTMLElement): Promise<void> {
  let workflows: Array<{ id: string; name: string; status: string; blocks: unknown[]; createdAt: number }> = [];

  try {
    const data = await listWorkflows();
    workflows = data.workflows;
  } catch { /* empty */ }

  container.innerHTML = `
    <div class="page-header">
      <h2>Workflows</h2>
      <p>Manage automated test workflows</p>
    </div>

    <div class="section-header">
      <h3>${workflows.length} Workflow${workflows.length !== 1 ? "s" : ""}</h3>
      <button class="btn btn-primary" id="create-workflow-btn">New Workflow</button>
    </div>

    ${workflows.length > 0 ? `
      <div class="table-container">
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Blocks</th><th>Created</th></tr></thead>
          <tbody>
            ${workflows.map((w) => `
              <tr>
                <td><strong>${w.name}</strong><br><span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${w.id.slice(0, 8)}</span></td>
                <td><span class="badge ${w.status === "active" ? "badge-green" : w.status === "draft" ? "badge-dim" : "badge-yellow"}">${w.status}</span></td>
                <td>${Array.isArray(w.blocks) ? w.blocks.length : 0} blocks</td>
                <td style="color:var(--text-dim)">${new Date(w.createdAt).toLocaleDateString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state"><h3>No workflows</h3><p>Create a workflow to automate your test pipeline</p></div>'}

    <dialog id="create-dialog" style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:24px;max-width:400px;width:90%;">
      <h3 style="margin-bottom:16px">New Workflow</h3>
      <form id="create-form" method="dialog">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input class="form-input" id="wf-name" placeholder="My Test Workflow" required />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="wf-desc" placeholder="Optional description" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn-secondary" id="cancel-dialog">Cancel</button>
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>
    </dialog>
  `;

  const dialog = container.querySelector("#create-dialog") as HTMLDialogElement;
  container.querySelector("#create-workflow-btn")?.addEventListener("click", () => dialog.showModal());
  container.querySelector("#cancel-dialog")?.addEventListener("click", () => dialog.close());

  container.querySelector("#create-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (container.querySelector("#wf-name") as HTMLInputElement).value;
    const description = (container.querySelector("#wf-desc") as HTMLInputElement).value || undefined;
    try {
      await createWorkflow({ name, description });
      dialog.close();
      renderWorkflows(container);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create workflow");
    }
  });
}
