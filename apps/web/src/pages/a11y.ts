// ============================================================================
// Accessibility — WCAG compliance audits and violation tracking
// ============================================================================

import { getA11yResults } from "../lib/api.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function renderA11y(container: HTMLElement): Promise<void> {
  const data = await getA11yResults().catch(() => null);

  if (!data) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Accessibility</h2>
        <p>WCAG compliance audits and violation tracking</p>
      </div>
      <div class="empty-state">
        <p>No accessibility audit results available yet.</p>
        <p>Run <code>inspect test --a11y https://your-app.com</code> to generate a live audit.</p>
      </div>
    `;
    return;
  }

  const score = data.score;
  const violations = data.violations ?? [];
  const passes = data.passes ?? 0;
  const total = data.total ?? (passes + violations.length);
  const standard = data.standard ?? "WCAG 2.1 AA";
  const criticalCount = violations.filter((v) => v.impact === "critical" || v.impact === "serious").length;
  const moderateCount = violations.length - criticalCount;

  const scorePct = Math.round(score * 3.6);
  const scoreColor = score >= 80 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)";

  container.innerHTML = `
    <div class="page-header">
      <h2>Accessibility</h2>
      <p>WCAG compliance audits and violation tracking${data.url ? ` — ${escapeHtml(data.url)}` : ""}</p>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-label">A11y Score</div>
        <div class="score-gauge">
          <div class="gauge-ring" style="background:conic-gradient(${scoreColor} ${scorePct}deg, var(--bg-elevated) 0)">
            <div class="gauge-inner"><span class="gauge-value">${score}</span></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-label">Violations</div>
        <div class="card-value ${violations.length > 0 ? "red" : "green"}">${violations.length}</div>
        <div class="card-detail">${criticalCount} critical, ${moderateCount} moderate</div>
      </div>
      <div class="card">
        <div class="card-label">Passing Rules</div>
        <div class="card-value green">${passes}</div>
        <div class="card-detail">of ${total} rules checked</div>
      </div>
      <div class="card">
        <div class="card-label">Standard</div>
        <div class="card-value" style="font-size:20px">${escapeHtml(standard)}</div>
      </div>
    </div>

    <div class="section-header"><h3>Violations</h3></div>
    <div class="table-container">
      <table>
        <thead><tr><th>Impact</th><th>Rule</th><th>Description</th><th>Elements</th></tr></thead>
        <tbody>
          ${violations.length > 0
            ? violations.map((v) => `
              <tr>
                <td><span class="badge ${v.impact === "critical" || v.impact === "serious" ? "badge-red" : v.impact === "moderate" ? "badge-yellow" : "badge-blue"}">${escapeHtml(v.impact)}</span></td>
                <td style="font-family:var(--font-mono)">${escapeHtml(v.id)}</td>
                <td>${escapeHtml(v.description)}</td>
                <td>${v.nodes}</td>
              </tr>
            `).join("")
            : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No violations found</td></tr>`
          }
        </tbody>
      </table>
    </div>

    ${data.timestamp ? `<div style="margin-top:16px;color:var(--text-dim);font-size:12px">Last audit: ${new Date(data.timestamp).toLocaleString()}</div>` : ""}
  `;
}
