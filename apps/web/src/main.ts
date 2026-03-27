// ============================================================================
// Inspect Web Dashboard — Main Entry Point
// ============================================================================

import { registerPage, startRouter } from "./lib/router.js";
import { getHealth } from "./lib/api.js";
import { renderDashboard } from "./pages/dashboard.js";
import { renderTasks } from "./pages/tasks.js";
import { renderWorkflows } from "./pages/workflows.js";
import { renderReports } from "./pages/reports.js";
import { renderVisual } from "./pages/visual.js";
import { renderCredentials } from "./pages/credentials.js";
import { renderSessions } from "./pages/sessions.js";
import { renderDevices } from "./pages/devices.js";
import { renderModels } from "./pages/models.js";
import { renderSettings } from "./pages/settings.js";
import { renderA11y } from "./pages/a11y.js";
import { renderPerformance } from "./pages/performance.js";

// Register all pages
registerPage("dashboard", renderDashboard);
registerPage("tasks", renderTasks);
registerPage("workflows", renderWorkflows);
registerPage("reports", renderReports);
registerPage("visual", renderVisual);
registerPage("credentials", renderCredentials);
registerPage("sessions", renderSessions);
registerPage("devices", renderDevices);
registerPage("models", renderModels);
registerPage("settings", renderSettings);
registerPage("a11y", renderA11y);
registerPage("performance", renderPerformance);

// Start the router
startRouter();

// Health check polling
async function checkHealth(): Promise<void> {
  const dot = document.querySelector(".health-dot");
  const text = document.querySelector(".health-text");
  if (!dot || !text) return;

  try {
    const health = await getHealth();
    dot.className = `health-dot ${health.status === "healthy" ? "healthy" : "degraded"}`;
    text.textContent = health.status === "healthy" ? "Connected" : health.status;

    const badge = document.getElementById("version-badge");
    if (badge) badge.textContent = `v${health.version}`;
  } catch {
    dot.className = "health-dot error";
    text.textContent = "Disconnected";
  }
}

// Check health immediately and every 30s
checkHealth();
setInterval(checkHealth, 30000);
