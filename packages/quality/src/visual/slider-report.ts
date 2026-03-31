// ============================================================================
// @inspect/visual - Interactive Slider Report Generator
// ============================================================================

import type { ViewportConfig } from "@inspect/core";

/** A single visual comparison result for the report */
export interface VisualReportEntry {
  /** Test scenario label */
  label: string;
  /** Viewport used */
  viewport: ViewportConfig;
  /** Whether the images matched */
  matched: boolean;
  /** Mismatch percentage */
  mismatchPercentage: number;
  /** Base64-encoded reference image (PNG) */
  referenceImage: string;
  /** Base64-encoded test image (PNG) */
  testImage: string;
  /** Base64-encoded diff image (PNG) */
  diffImage?: string;
  /** URL of the page tested */
  url?: string;
  /** Timestamp of the comparison */
  timestamp?: number;
}

/**
 * SliderReport generates self-contained HTML files with an interactive
 * CSS slider to scrub between reference/test/diff images.
 */
export class SliderReport {
  /**
   * Generate a self-contained HTML report from visual comparison results.
   * The report includes:
   * - CSS slider for before/after comparison
   * - Diff overlay toggle
   * - Filtering by pass/fail
   * - Zoom on hover
   * - Keyboard navigation between scenarios
   */
  generate(results: VisualReportEntry[]): string {
    const passed = results.filter((r) => r.matched);
    const failed = results.filter((r) => !r.matched);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual Regression Report - Inspect</title>
<style>
  :root {
    --bg: #0f1117;
    --card-bg: #1a1d29;
    --border: #2d3148;
    --text: #e4e7f1;
    --text-muted: #8b8fa3;
    --green: #22c55e;
    --red: #ef4444;
    --blue: #3b82f6;
    --accent: #6366f1;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); }
  header { padding: 24px 32px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  header h1 { font-size: 20px; font-weight: 600; }
  .stats { display: flex; gap: 16px; font-size: 14px; }
  .stat-badge { padding: 4px 12px; border-radius: 16px; font-weight: 500; }
  .stat-pass { background: rgba(34,197,94,0.15); color: var(--green); }
  .stat-fail { background: rgba(239,68,68,0.15); color: var(--red); }
  .stat-total { background: rgba(99,102,241,0.15); color: var(--accent); }
  .filters { padding: 16px 32px; display: flex; gap: 8px; border-bottom: 1px solid var(--border); }
  .filter-btn { padding: 6px 16px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 13px; transition: all 0.15s; }
  .filter-btn:hover, .filter-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
  .container { padding: 24px 32px; }
  .scenario { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
  .scenario-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
  .scenario-label { font-weight: 500; font-size: 15px; }
  .scenario-meta { display: flex; gap: 12px; align-items: center; font-size: 13px; color: var(--text-muted); }
  .badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .badge-pass { background: rgba(34,197,94,0.15); color: var(--green); }
  .badge-fail { background: rgba(239,68,68,0.15); color: var(--red); }
  .slider-container { position: relative; overflow: hidden; cursor: col-resize; user-select: none; }
  .slider-container img { display: block; width: 100%; height: auto; }
  .slider-overlay { position: absolute; top: 0; left: 0; bottom: 0; overflow: hidden; border-right: 2px solid var(--accent); }
  .slider-overlay img { display: block; height: 100%; }
  .slider-handle { position: absolute; top: 0; bottom: 0; width: 40px; margin-left: -20px; cursor: col-resize; display: flex; align-items: center; justify-content: center; z-index: 10; }
  .slider-handle::after { content: ''; width: 4px; height: 40px; background: var(--accent); border-radius: 2px; box-shadow: 0 0 8px rgba(99,102,241,0.5); }
  .slider-labels { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 12px; pointer-events: none; }
  .slider-label { background: rgba(0,0,0,0.7); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
  .controls { padding: 12px 20px; display: flex; gap: 8px; border-top: 1px solid var(--border); }
  .ctrl-btn { padding: 4px 12px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 12px; }
  .ctrl-btn:hover, .ctrl-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
  .zoom-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); display: none; align-items: center; justify-content: center; z-index: 100; cursor: zoom-out; }
  .zoom-overlay.visible { display: flex; }
  .zoom-overlay img { max-width: 95vw; max-height: 95vh; object-fit: contain; }
  .keyboard-hint { position: fixed; bottom: 16px; right: 16px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font-size: 11px; color: var(--text-muted); }
  .keyboard-hint kbd { background: var(--border); padding: 1px 5px; border-radius: 3px; font-family: monospace; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<header>
  <h1>Visual Regression Report</h1>
  <div class="stats">
    <span class="stat-badge stat-total">${results.length} total</span>
    <span class="stat-badge stat-pass">${passed.length} passed</span>
    <span class="stat-badge stat-fail">${failed.length} failed</span>
  </div>
</header>
<div class="filters">
  <button class="filter-btn active" data-filter="all">All</button>
  <button class="filter-btn" data-filter="fail">Failed</button>
  <button class="filter-btn" data-filter="pass">Passed</button>
</div>
<div class="container" id="scenarios">
${results.map((r, i) => this.renderScenario(r, i)).join("\n")}
</div>
<div class="zoom-overlay" id="zoomOverlay" onclick="this.classList.remove('visible')">
  <img id="zoomImg" src="" alt="Zoomed view">
</div>
<div class="keyboard-hint">
  <kbd>&larr;</kbd><kbd>&rarr;</kbd> navigate &nbsp;
  <kbd>d</kbd> diff &nbsp;
  <kbd>z</kbd> zoom &nbsp;
  <kbd>f</kbd> filter
</div>
<script>
(function() {
  var current = 0;
  var scenarios = document.querySelectorAll('.scenario');

  // Slider functionality
  document.querySelectorAll('.slider-container').forEach(function(container) {
    var overlay = container.querySelector('.slider-overlay');
    var handle = container.querySelector('.slider-handle');
    var active = false;

    function updatePosition(x) {
      var rect = container.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
      overlay.style.width = (pct * 100) + '%';
      handle.style.left = (pct * 100) + '%';
    }

    container.addEventListener('mousedown', function(e) { active = true; updatePosition(e.clientX); });
    container.addEventListener('mousemove', function(e) { if (active) updatePosition(e.clientX); });
    document.addEventListener('mouseup', function() { active = false; });
    container.addEventListener('touchstart', function(e) { active = true; updatePosition(e.touches[0].clientX); });
    container.addEventListener('touchmove', function(e) { if (active) { e.preventDefault(); updatePosition(e.touches[0].clientX); } });
    document.addEventListener('touchend', function() { active = false; });

    // Initialize at 50%
    updatePosition(container.getBoundingClientRect().left + container.getBoundingClientRect().width / 2);
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var filter = btn.dataset.filter;
      scenarios.forEach(function(s) {
        if (filter === 'all') { s.classList.remove('hidden'); }
        else if (filter === 'fail') { s.classList.toggle('hidden', s.dataset.status !== 'fail'); }
        else if (filter === 'pass') { s.classList.toggle('hidden', s.dataset.status !== 'pass'); }
      });
    });
  });

  // View toggle (reference / test / diff)
  document.querySelectorAll('.ctrl-btn[data-view]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var scenario = btn.closest('.scenario');
      var slider = scenario.querySelector('.slider-container');
      var view = btn.dataset.view;
      var overlay = slider.querySelector('.slider-overlay');

      scenario.querySelectorAll('.ctrl-btn[data-view]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      if (view === 'diff' && btn.dataset.diff) {
        slider.querySelector('.test-img').src = 'data:image/png;base64,' + btn.dataset.diff;
        overlay.style.width = '0%';
      } else if (view === 'reference') {
        overlay.style.width = '100%';
      } else {
        overlay.style.width = '0%';
      }
    });
  });

  // Zoom on click
  document.querySelectorAll('.zoom-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var scenario = btn.closest('.scenario');
      var img = scenario.querySelector('.test-img');
      document.getElementById('zoomImg').src = img.src;
      document.getElementById('zoomOverlay').classList.add('visible');
    });
  });

  // Keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      current = Math.min(current + 1, scenarios.length - 1);
      scenarios[current].scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      current = Math.max(current - 1, 0);
      scenarios[current].scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (e.key === 'f') {
      var btns = document.querySelectorAll('.filter-btn');
      var activeIdx = Array.from(btns).findIndex(function(b) { return b.classList.contains('active'); });
      btns[(activeIdx + 1) % btns.length].click();
    } else if (e.key === 'z') {
      var img = scenarios[current].querySelector('.test-img');
      if (img) { document.getElementById('zoomImg').src = img.src; document.getElementById('zoomOverlay').classList.add('visible'); }
    }
  });
})();
</script>
</body>
</html>`;
  }

  /**
   * Render a single scenario card.
   */
  private renderScenario(entry: VisualReportEntry, index: number): string {
    const status = entry.matched ? "pass" : "fail";
    const badgeClass = entry.matched ? "badge-pass" : "badge-fail";
    const badgeText = entry.matched ? "PASS" : "FAIL";
    const mismatch = entry.mismatchPercentage.toFixed(2);

    return `
  <div class="scenario" data-status="${status}" data-index="${index}">
    <div class="scenario-header">
      <span class="scenario-label">${this.escapeHtml(entry.label)}</span>
      <div class="scenario-meta">
        <span>${entry.viewport.width}x${entry.viewport.height}</span>
        <span>${mismatch}% diff</span>
        ${entry.url ? `<span>${this.escapeHtml(entry.url)}</span>` : ""}
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
    </div>
    <div class="slider-container">
      <img class="test-img" src="data:image/png;base64,${entry.testImage}" alt="Test">
      <div class="slider-overlay">
        <img src="data:image/png;base64,${entry.referenceImage}" alt="Reference" style="width:${entry.viewport.width}px;">
      </div>
      <div class="slider-handle"></div>
      <div class="slider-labels">
        <span class="slider-label">Reference</span>
        <span class="slider-label">Test</span>
      </div>
    </div>
    <div class="controls">
      <button class="ctrl-btn" data-view="reference">Reference</button>
      <button class="ctrl-btn active" data-view="slider">Slider</button>
      <button class="ctrl-btn" data-view="test">Test</button>
      ${entry.diffImage ? `<button class="ctrl-btn" data-view="diff" data-diff="${entry.diffImage}">Diff</button>` : ""}
      <button class="ctrl-btn zoom-btn">Zoom</button>
    </div>
  </div>`;
  }

  /**
   * Escape HTML characters.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
