// ============================================================================
// Landing Page — Marketing/hero page for Inspect
// ============================================================================

export function renderLanding(container: HTMLElement): void {
  container.innerHTML = "";

  const landing = document.createElement("div");
  landing.className = "landing";
  landing.innerHTML = `
    <!-- Hero -->
    <section class="landing-hero">
      <div class="landing-nav">
        <div class="landing-logo">
          <span class="landing-logo-icon">🔍</span>
          <span class="landing-logo-text">Inspect</span>
        </div>
        <div class="landing-nav-links">
          <a href="#/dashboard" class="landing-nav-link">Dashboard</a>
          <a href="https://github.com" class="landing-nav-link" target="_blank">GitHub</a>
          <a href="#/dashboard" class="landing-nav-cta">Get Started</a>
        </div>
      </div>
      <div class="landing-hero-content">
        <div class="landing-hero-badge">AI-Powered Browser Testing</div>
        <h1 class="landing-hero-title">
          The way AI<br/>
          <span class="landing-hero-gradient">tests the web.</span>
        </h1>
        <p class="landing-hero-subtitle">
          Write tests in plain English. Self-healing agents. Cross-browser.<br/>
          No selectors. No maintenance. Just results.
        </p>
        <div class="landing-hero-actions">
          <a href="#/dashboard" class="landing-btn landing-btn-primary">
            Launch Dashboard
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
          <a href="#/docs" class="landing-btn landing-btn-secondary">Read the Docs</a>
        </div>
        <div class="landing-hero-stats">
          <div class="landing-stat">
            <span class="landing-stat-value">1,276</span>
            <span class="landing-stat-label">Tests Passing</span>
          </div>
          <div class="landing-stat">
            <span class="landing-stat-value">15</span>
            <span class="landing-stat-label">Packages</span>
          </div>
          <div class="landing-stat">
            <span class="landing-stat-value">25+</span>
            <span class="landing-stat-label">Device Presets</span>
          </div>
        </div>
      </div>
      <div class="landing-hero-glow"></div>
    </section>

    <!-- Trusted By -->
    <section class="landing-trust">
      <p class="landing-trust-label">Built for teams that ship fast</p>
      <div class="landing-trust-logos">
        <span>Startups</span>
        <span>Enterprise</span>
        <span>QA Teams</span>
        <span>DevOps</span>
        <span>Agencies</span>
        <span>Open Source</span>
      </div>
    </section>

    <!-- Features -->
    <section class="landing-features">
      <div class="landing-features-grid">
        <div class="landing-feature-card">
          <div class="landing-feature-icon">🤖</div>
          <h3>AI Test Agents</h3>
          <p>Natural language instructions. The agent reads the page like a human — using the accessibility tree, not fragile selectors.</p>
        </div>
        <div class="landing-feature-card">
          <div class="landing-feature-icon">🔧</div>
          <h3>Self-Healing Tests</h3>
          <p>When the UI changes, the agent adapts. Automatic retries, replanning, and corrective actions keep tests green.</p>
        </div>
        <div class="landing-feature-card">
          <div class="landing-feature-icon">🌐</div>
          <h3>Cross-Browser</h3>
          <p>Chromium, Firefox, WebKit. Desktop and mobile. Run the same test across 25+ device presets in parallel.</p>
        </div>
        <div class="landing-feature-card">
          <div class="landing-feature-icon">📊</div>
          <h3>Live Dashboard</h3>
          <p>Real-time test monitoring with SSE streaming. Watch agents execute actions, see screenshots, track token usage.</p>
        </div>
        <div class="landing-feature-card">
          <div class="landing-feature-icon">♿</div>
          <h3>Accessibility Audits</h3>
          <p>Automated a11y testing alongside functional tests. WCAG compliance checks baked into every run.</p>
        </div>
        <div class="landing-feature-card">
          <div class="landing-feature-icon">🔄</div>
          <h3>Workflow Engine</h3>
          <p>Chain tests into workflows. YAML-based. Schedule with cron. Integrate with CI/CD and GitHub PRs.</p>
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section class="landing-how">
      <h2>How it works</h2>
      <div class="landing-steps">
        <div class="landing-step">
          <div class="landing-step-num">1</div>
          <h4>Write a test</h4>
          <p>Describe what to test in plain English.</p>
          <div class="landing-step-code">
            <code>"Verify login works with valid credentials on iPhone 14"</code>
          </div>
        </div>
        <div class="landing-step">
          <div class="landing-step-num">2</div>
          <h4>AI executes</h4>
          <p>The agent launches a browser, navigates, and interacts like a real user.</p>
        </div>
        <div class="landing-step">
          <div class="landing-step-num">3</div>
          <h4>Get results</h4>
          <p>Pass/fail with screenshots, accessibility data, and performance metrics.</p>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="landing-cta">
      <h2>Start testing with AI.</h2>
      <p>No selectors. No flaky tests. Just natural language.</p>
      <div class="landing-cta-actions">
        <a href="#/dashboard" class="landing-btn landing-btn-primary landing-btn-large">
          Launch Dashboard
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </div>
    </section>

    <!-- Footer -->
    <footer class="landing-footer">
      <div class="landing-footer-grid">
        <div class="landing-footer-brand">
          <div class="landing-logo">
            <span class="landing-logo-icon">🔍</span>
            <span class="landing-logo-text">Inspect</span>
          </div>
          <p>AI-Powered Browser Testing Platform</p>
        </div>
        <div class="landing-footer-col">
          <h4>Product</h4>
          <a href="#/dashboard">Dashboard</a>
          <a href="#/live">Live Monitor</a>
          <a href="#/workflows">Workflows</a>
          <a href="#/devices">Devices</a>
        </div>
        <div class="landing-footer-col">
          <h4>Quality</h4>
          <a href="#/a11y">Accessibility</a>
          <a href="#/performance">Performance</a>
          <a href="#/visual">Visual Diff</a>
          <a href="#/reports">Reports</a>
        </div>
        <div class="landing-footer-col">
          <h4>Connect</h4>
          <a href="https://github.com" target="_blank">GitHub</a>
          <a href="#" target="_blank">Discord</a>
          <a href="#" target="_blank">Twitter</a>
          <a href="mailto:hello@inspect.dev">Contact</a>
        </div>
      </div>
      <div class="landing-footer-bottom">
        <span>© 2026 Inspect. Open source.</span>
      </div>
    </footer>
  `;

  container.appendChild(landing);
}
