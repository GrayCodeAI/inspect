// ============================================================================
// Performance — Lighthouse scores and performance budgets
// ============================================================================

export async function renderPerformance(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h2>Performance</h2>
      <p>Lighthouse scores and performance budgets</p>
    </div>

    <div class="gauge-grid">
      ${scoreGauge("Performance", 87)}
      ${scoreGauge("Accessibility", 92)}
      ${scoreGauge("Best Practices", 95)}
      ${scoreGauge("SEO", 88)}
    </div>

    <div class="section-header"><h3>Core Web Vitals</h3></div>
    <div class="card-grid">
      <div class="card">
        <div class="card-label">LCP (Largest Contentful Paint)</div>
        <div class="card-value green">1.8s</div>
        <div class="card-detail">Good (&lt; 2.5s)</div>
        <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:36%;background:var(--green)"></div></div>
      </div>
      <div class="card">
        <div class="card-label">FID (First Input Delay)</div>
        <div class="card-value green">45ms</div>
        <div class="card-detail">Good (&lt; 100ms)</div>
        <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:45%;background:var(--green)"></div></div>
      </div>
      <div class="card">
        <div class="card-label">CLS (Cumulative Layout Shift)</div>
        <div class="card-value yellow">0.12</div>
        <div class="card-detail">Needs Improvement (&gt; 0.1)</div>
        <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:60%;background:var(--yellow)"></div></div>
      </div>
      <div class="card">
        <div class="card-label">TTFB (Time to First Byte)</div>
        <div class="card-value green">320ms</div>
        <div class="card-detail">Good (&lt; 800ms)</div>
        <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:20%;background:var(--green)"></div></div>
      </div>
    </div>

    <div class="section-header"><h3>Score Trend (Last 7 Days)</h3></div>
    <div class="card" style="padding:20px">
      <div class="trend-chart">
        ${[85, 87, 83, 89, 86, 90, 87]
          .map(
            (score, i) => `
          <div class="trend-bar-container">
            <div class="trend-bar" style="height:${score}%;background:${score >= 80 ? "var(--green)" : "var(--yellow)"}"></div>
            <div class="trend-label">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</div>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>

    <div style="margin-top:24px" class="empty-state">
      <p>Run <code>inspect lighthouse https://your-app.com</code> to generate live scores.</p>
    </div>
  `;
}

function scoreGauge(label: string, score: number): string {
  const pct = score;
  const color =
    pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--yellow)" : "var(--red)";
  return `
    <div class="score-gauge">
      <div class="gauge-ring" style="background:conic-gradient(${color} ${pct * 3.6}deg, var(--bg-elevated) 0)">
        <div class="gauge-inner"><span class="gauge-value">${score}</span></div>
      </div>
      <div class="gauge-label">${label}</div>
    </div>
  `;
}
