import { getVersion } from "../lib/api.js";

export async function renderSettings(container: HTMLElement): Promise<void> {
  let version = { version: "?", name: "inspect", node: "?", platform: "?" };

  try {
    version = await getVersion();
  } catch { /* empty */ }

  container.innerHTML = `
    <div class="page-header">
      <h2>Settings</h2>
      <p>Configuration and system information</p>
    </div>

    <div class="card" style="margin-bottom: 16px">
      <h3 style="font-size: 16px; margin-bottom: 12px;">System Information</h3>
      <table style="width: auto;">
        <tbody>
          <tr><td style="color:var(--text-dim);padding:4px 16px 4px 0">Version</td><td style="font-family:var(--font-mono)">${version.version}</td></tr>
          <tr><td style="color:var(--text-dim);padding:4px 16px 4px 0">Node.js</td><td style="font-family:var(--font-mono)">${version.node}</td></tr>
          <tr><td style="color:var(--text-dim);padding:4px 16px 4px 0">Platform</td><td style="font-family:var(--font-mono)">${version.platform}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-bottom: 16px">
      <h3 style="font-size: 16px; margin-bottom: 12px;">API Keys</h3>
      <p style="font-size: 13px; color: var(--text-dim); margin-bottom: 12px;">Set these environment variables before starting the server:</p>
      <table style="width: auto;">
        <tbody>
          <tr><td style="font-family:var(--font-mono);font-size:13px;padding:4px 16px 4px 0">ANTHROPIC_API_KEY</td><td style="color:var(--text-dim)">Claude</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:13px;padding:4px 16px 4px 0">OPENAI_API_KEY</td><td style="color:var(--text-dim)">GPT / OpenAI</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:13px;padding:4px 16px 4px 0">GOOGLE_AI_KEY</td><td style="color:var(--text-dim)">Gemini</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:13px;padding:4px 16px 4px 0">DEEPSEEK_API_KEY</td><td style="color:var(--text-dim)">DeepSeek</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3 style="font-size: 16px; margin-bottom: 12px;">CLI Reference</h3>
      <p style="font-size: 13px; color: var(--text-dim); margin-bottom: 8px;">Common commands:</p>
      <pre style="background:var(--bg);padding:12px;border-radius:6px;font-size:13px;overflow-x:auto;color:var(--text-dim)">inspect doctor          # Check environment
inspect test            # Run AI-powered tests
inspect serve           # Start API server
inspect a11y &lt;url&gt;     # Accessibility audit
inspect lighthouse &lt;url&gt; # Performance audit
inspect security &lt;url&gt;  # Security scan
inspect workflow run &lt;file&gt; # Execute workflow</pre>
    </div>
  `;
}
