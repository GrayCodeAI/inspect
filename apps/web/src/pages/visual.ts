export async function renderVisual(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h2>Visual Diff</h2>
      <p>Visual regression testing with pixel-level comparison</p>
    </div>

    <div class="empty-state">
      <h3>No visual baselines</h3>
      <p>Capture baselines first: <code>inspect visual --baseline --url https://example.com</code></p>
      <p style="margin-top: 8px; font-size: 13px;">Then run comparisons: <code>inspect visual --url https://example.com</code></p>
    </div>
  `;
}
