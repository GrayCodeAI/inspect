import { createTask, getTask } from "../lib/api.js";

export async function renderTasks(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h2>Tasks</h2>
      <p>Create and monitor AI-powered browser testing tasks</p>
    </div>

    <div class="card" style="margin-bottom: 24px">
      <h3 style="margin-bottom: 16px; font-size: 16px;">New Task</h3>
      <form id="task-form">
        <div class="form-group">
          <label class="form-label">Prompt</label>
          <input class="form-input" id="task-prompt" placeholder="e.g. Test the login flow and verify error messages" required />
        </div>
        <div class="form-group">
          <label class="form-label">URL</label>
          <input class="form-input" id="task-url" placeholder="https://example.com" type="url" required />
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <button type="submit" class="btn btn-primary">Run Task</button>
          <span id="task-status" style="font-size: 13px; color: var(--text-dim);"></span>
        </div>
      </form>
    </div>

    <div class="section-header">
      <h3>Recent Tasks</h3>
    </div>
    <div id="task-list">
      <div class="empty-state">
        <h3>No tasks yet</h3>
        <p>Create a task above to get started</p>
      </div>
    </div>
  `;

  const form = container.querySelector("#task-form") as HTMLFormElement;
  const statusEl = container.querySelector("#task-status") as HTMLElement;
  const taskList = container.querySelector("#task-list") as HTMLElement;
  const tasks: Array<{ id: string; prompt: string; url: string; status: string; createdAt: number }> = [];

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = (container.querySelector("#task-prompt") as HTMLInputElement).value;
    const url = (container.querySelector("#task-url") as HTMLInputElement).value;

    statusEl.textContent = "Creating task...";
    try {
      const result = await createTask({ prompt, url });
      tasks.unshift({ id: result.id, prompt, url, status: result.status, createdAt: result.createdAt });
      statusEl.innerHTML = `<span class="badge badge-green">Created: ${result.id.slice(0, 8)}</span>`;
      renderTaskTable(taskList, tasks);
      form.reset();

      // Poll for status
      pollTask(result.id, tasks, taskList);
    } catch (err) {
      statusEl.innerHTML = `<span class="badge badge-red">${err instanceof Error ? err.message : "Failed"}</span>`;
    }
  });
}

async function pollTask(
  id: string,
  tasks: Array<{ id: string; prompt: string; url: string; status: string; createdAt: number }>,
  container: HTMLElement,
): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const result = await getTask(id);
      const task = tasks.find((t) => t.id === id);
      if (task) {
        task.status = result.status;
        renderTaskTable(container, tasks);
      }
      if (result.status === "completed" || result.status === "failed") break;
    } catch { break; }
  }
}

function renderTaskTable(
  container: HTMLElement,
  tasks: Array<{ id: string; prompt: string; url: string; status: string; createdAt: number }>,
): void {
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No tasks yet</h3></div>';
    return;
  }

  const badgeClass = (status: string) => {
    switch (status) {
      case "completed": return "badge-green";
      case "failed": return "badge-red";
      case "running": return "badge-blue";
      default: return "badge-dim";
    }
  };

  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead><tr><th>ID</th><th>Prompt</th><th>URL</th><th>Status</th></tr></thead>
        <tbody>
          ${tasks.map((t) => `
            <tr>
              <td style="font-family: var(--font-mono); font-size: 12px;">${t.id.slice(0, 8)}</td>
              <td>${t.prompt.slice(0, 60)}</td>
              <td style="color: var(--text-dim)">${t.url}</td>
              <td><span class="badge ${badgeClass(t.status)}">${t.status}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}
