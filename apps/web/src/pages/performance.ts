// ============================================================================
// Performance — Lighthouse scores and performance budgets
// ============================================================================

import { getPerfResults } from "../lib/api.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function scoreGauge(label: string, score: number): string {
  const pct = score;
  const color = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--yellow)" : "var(--red)";
  return `
    <div class="score-gauge">
      <div class="gauge-ring" style="background:conic-gradient(${color} ${pct * 3.6}deg, var(--bg-elevated) 0)">
        <div class="gauge-inner"><span class="gauge-value">${score}</span></div>
      </div>
      <div class="gauge-label">${escapeHtml(label)}</div>
    </div>
  `;
}

function vitalCard(label: string, metric: { value: number; rating: string; displayValue?: string } | undefined, threshold: string): string {
  if (!metric) return "";
  const ratingColor = metric.rating === "good" ? "green" : metric.rating === "poor" ? "red" : "yellow";
  const displayVal = metric.displayValue ?? String(metric.value);
  const ratingLabel = metric.rating === "good" ? "Good" : metric.rating === "poor" ? "Poor" : "Needs Improvement";
  const barWidth = Math.min(100, Math.round((metric.value / (metric.value * 2)) * 100));

  return `
    <div class="card">
      <div class="card-label">${escapeHtml(label)}</div>
      <div class="card-value ${ratingColor}">${escapeHtml(displayVal)}</div>
      <div class="card-detail">${ratingLabel} (${escapeHtml(threshold)})</div>
      <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:${barWidth}%;background:var(--${ratingColor})"></div></div>
    </div>
  `;
}

export async function renderPerformance(container: HTMLElement): Promise<void> {
  const data = await getPerfResults().catch(() => null);

  if (!data) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Performance</h2>
        <p>Lighthouse scores and performance budgets</p>
      </div>
      <div class="empty-state">
        <p>No performance data available yet.</p>
        <p>Run <code>inspect test --lighthouse https://your-app.com</code> to generate live scores.</p>
      </div>
    `;
    return;
  }

  const scores = data.scores;
  const metrics = data.metrics;

  container.innerHTML = `
    <div class="page-header">
      <h2>Performance</h2>
      <p>Lighthouse scores and performance budgets${data.url ? ` — ${escapeHtml(data.url)}` : ""}</p>
    </div>

    <div class="gauge-grid">
      ${scoreGauge("Performance", scores.performance ?? 0)}
      ${scoreGauge("Accessibility", scores.accessibility ?? 0)}
      ${scoreGauge("Best Practices", scores.bestPractices ?? 0)}
      ${scoreGauge("SEO", scores.seo ?? 0)}
    </div>

    <div class="section-header"><h3>Core Web Vitals</h3></div>
    <div class="card-grid">
      ${vitalCard("LCP (Largest Contentful Paint)", metrics?.LCP, "< 2.5s")}
      ${vitalCard("FCP (First Contentful Paint)", metrics?.FCP, "< 1.8s")}
      ${vitalCard("CLS (Cumulative Layout Shift)", metrics?.CLS, "< 0.1")}
      ${vitalCard("TTFB (Time to First Byte)", metrics?.TTFB, "< 800ms")}
      ${vitalCard("TBT (Total Blocking Time)", metrics?.TBT, "< 200ms")}
      ${vitalCard("INP (Interaction to Next Paint)", metrics?.INP, "< 200ms")}
    </div>

    ${data.timestamp ? `<div style="margin-top:16px;color:var(--text-dim);font-size:12px">Last audit: ${new Date(data.timestamp).toLocaleString()}</div>` : ""}
  `;
}
