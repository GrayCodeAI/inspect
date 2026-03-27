// ============================================================================
// Accessibility — WCAG compliance audits and violation tracking
// ============================================================================

export async function renderA11y(container: HTMLElement): Promise<void> {
  // This page displays a11y audit results
  container.innerHTML = `
    <div class="page-header">
      <h2>Accessibility</h2>
      <p>WCAG compliance audits and violation tracking</p>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-label">A11y Score</div>
        <div class="score-gauge">
          <div class="gauge-ring" style="background:conic-gradient(var(--green) 324deg, var(--bg-elevated) 0)">
            <div class="gauge-inner"><span class="gauge-value">90</span></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-label">Violations</div>
        <div class="card-value red">3</div>
        <div class="card-detail">2 critical, 1 moderate</div>
      </div>
      <div class="card">
        <div class="card-label">Passing Rules</div>
        <div class="card-value green">42</div>
        <div class="card-detail">of 45 rules checked</div>
      </div>
      <div class="card">
        <div class="card-label">Standard</div>
        <div class="card-value" style="font-size:20px">WCAG 2.1 AA</div>
      </div>
    </div>

    <div class="section-header"><h3>Violations</h3></div>
    <div class="table-container">
      <table>
        <thead><tr><th>Impact</th><th>Rule</th><th>Description</th><th>Elements</th></tr></thead>
        <tbody>
          <tr><td><span class="badge badge-red">critical</span></td><td style="font-family:var(--font-mono)">image-alt</td><td>Images must have alternate text</td><td>2</td></tr>
          <tr><td><span class="badge badge-red">critical</span></td><td style="font-family:var(--font-mono)">color-contrast</td><td>Elements must have sufficient color contrast</td><td>5</td></tr>
          <tr><td><span class="badge badge-yellow">moderate</span></td><td style="font-family:var(--font-mono)">label</td><td>Form elements must have labels</td><td>1</td></tr>
        </tbody>
      </table>
    </div>

    <div style="margin-top:24px" class="empty-state">
      <p>Run <code>inspect a11y https://your-app.com</code> to generate a live audit.</p>
    </div>
  `;
}
