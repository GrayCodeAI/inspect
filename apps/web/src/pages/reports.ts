export async function renderReports(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h2>Reports</h2>
      <p>View test run reports and results</p>
    </div>

    <div class="empty-state">
      <h3>No reports yet</h3>
      <p>Run a test to generate reports: <code>inspect test -m "test login" --url https://example.com -y</code></p>
      <p style="margin-top: 12px; font-size: 13px;">Reports are generated in Markdown, HTML, and JSON formats after each test run.</p>
    </div>
  `;
}
