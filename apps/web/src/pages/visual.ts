// ============================================================================
// Visual Regression — Diff viewer inspired by BackstopJS
// ============================================================================

let baselineDataUrl: string | null = null;
let currentDataUrl: string | null = null;

export async function renderVisual(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h2>Visual Regression</h2>
      <p>Compare screenshots and manage baselines</p>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="compare">Compare</div>
      <div class="tab" data-tab="baselines">Baselines</div>
      <div class="tab" data-tab="history">History</div>
    </div>

    <div id="visual-content">
      <!-- Compare tab: upload or select two images for side-by-side comparison -->
      <div class="two-col" style="margin-bottom:24px">
        <div class="card">
          <div class="card-label">Baseline</div>
          <div class="drop-zone" id="baseline-drop" style="min-height:200px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--border);border-radius:var(--radius);cursor:pointer">
            <span style="color:var(--text-muted)">Drop baseline image or click to upload</span>
          </div>
          <input type="file" id="baseline-input" accept="image/*" style="display:none">
        </div>
        <div class="card">
          <div class="card-label">Current</div>
          <div class="drop-zone" id="current-drop" style="min-height:200px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--border);border-radius:var(--radius);cursor:pointer">
            <span style="color:var(--text-muted)">Drop current image or click to upload</span>
          </div>
          <input type="file" id="current-input" accept="image/*" style="display:none">
        </div>
      </div>

      <!-- Diff result area -->
      <div id="diff-result" style="display:none">
        <div class="section-header">
          <h3>Comparison Result</h3>
          <div id="diff-stats" class="badge badge-dim"></div>
        </div>

        <!-- View mode tabs -->
        <div class="tabs" style="margin-bottom:12px">
          <div class="tab active" data-view="slider">Slider</div>
          <div class="tab" data-view="side-by-side">Side by Side</div>
          <div class="tab" data-view="diff-only">Diff Only</div>
        </div>

        <!-- Slider view -->
        <div id="slider-view" class="diff-container" style="position:relative;overflow:hidden">
          <img id="diff-img-base" class="diff-image" style="display:block;width:100%">
          <div class="diff-overlay" id="diff-overlay" style="position:absolute;top:0;left:0;bottom:0;overflow:hidden;width:50%">
            <img id="diff-img-current" class="diff-image" style="display:block;width:100%">
          </div>
          <div class="diff-slider" id="diff-slider" style="left:50%"></div>
        </div>

        <!-- Side by side view -->
        <div id="side-by-side-view" class="two-col" style="display:none">
          <div><div class="card-label">Baseline</div><img id="sbs-base" style="width:100%;border-radius:var(--radius)"></div>
          <div><div class="card-label">Current</div><img id="sbs-current" style="width:100%;border-radius:var(--radius)"></div>
        </div>

        <!-- Diff only view -->
        <div id="diff-only-view" style="display:none">
          <img id="diff-canvas-output" style="width:100%;border-radius:var(--radius)">
        </div>
      </div>
    </div>
  `;

  // Wire up file upload interactions
  setupDropZone("baseline-drop", "baseline-input", "baseline");
  setupDropZone("current-drop", "current-input", "current");

  // Wire up tab switching
  container.querySelectorAll(".tabs").forEach((tabBar) => {
    tabBar.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        tabBar
          .querySelectorAll(".tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        // Handle view mode tabs
        const view = (tab as HTMLElement).dataset.view;
        if (view) {
          document.getElementById("slider-view")!.style.display =
            view === "slider" ? "" : "none";
          document.getElementById("side-by-side-view")!.style.display =
            view === "side-by-side" ? "" : "none";
          document.getElementById("diff-only-view")!.style.display =
            view === "diff-only" ? "" : "none";
        }
      });
    });
  });

  // Wire up slider drag
  setupSlider();
}

function setupDropZone(
  dropId: string,
  inputId: string,
  type: "baseline" | "current",
) {
  const drop = document.getElementById(dropId)!;
  const input = document.getElementById(inputId) as HTMLInputElement;

  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.style.borderColor = "var(--accent)";
  });
  drop.addEventListener("dragleave", () => {
    drop.style.borderColor = "var(--border)";
  });
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.style.borderColor = "var(--border)";
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file, type, drop);
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) handleFile(file, type, drop);
  });
}

function handleFile(
  file: File,
  type: "baseline" | "current",
  drop: HTMLElement,
) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    if (type === "baseline") baselineDataUrl = dataUrl;
    else currentDataUrl = dataUrl;

    drop.innerHTML = `<img src="${dataUrl}" style="max-width:100%;max-height:300px;border-radius:var(--radius)">`;

    if (baselineDataUrl && currentDataUrl) {
      showDiff();
    }
  };
  reader.readAsDataURL(file);
}

function showDiff() {
  document.getElementById("diff-result")!.style.display = "";

  // Set slider images
  (document.getElementById("diff-img-base") as HTMLImageElement).src =
    baselineDataUrl!;
  (document.getElementById("diff-img-current") as HTMLImageElement).src =
    currentDataUrl!;

  // Set side-by-side images
  (document.getElementById("sbs-base") as HTMLImageElement).src =
    baselineDataUrl!;
  (document.getElementById("sbs-current") as HTMLImageElement).src =
    currentDataUrl!;

  // Compute pixel diff on canvas for diff-only view
  computeCanvasDiff();

  document.getElementById("diff-stats")!.textContent = "Comparing...";
}

function computeCanvasDiff() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const imgA = new Image();
  const imgB = new Image();

  let loadedCount = 0;
  const onLoad = () => {
    loadedCount++;
    if (loadedCount < 2) return;

    const w = Math.max(imgA.width, imgB.width);
    const h = Math.max(imgA.height, imgB.height);
    canvas.width = w;
    canvas.height = h;

    // Draw image A
    ctx.drawImage(imgA, 0, 0);
    const dataA = ctx.getImageData(0, 0, w, h);

    // Draw image B
    ctx.drawImage(imgB, 0, 0);
    const dataB = ctx.getImageData(0, 0, w, h);

    // Compute diff
    const diff = ctx.createImageData(w, h);
    let diffPixels = 0;
    const threshold = 25;

    for (let i = 0; i < dataA.data.length; i += 4) {
      const dr = Math.abs(dataA.data[i] - dataB.data[i]);
      const dg = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
      const db = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);

      if (dr > threshold || dg > threshold || db > threshold) {
        diff.data[i] = 255; // Red
        diff.data[i + 1] = 0;
        diff.data[i + 2] = 0;
        diff.data[i + 3] = 200;
        diffPixels++;
      } else {
        diff.data[i] = Math.floor(dataB.data[i] * 0.3);
        diff.data[i + 1] = Math.floor(dataB.data[i + 1] * 0.3);
        diff.data[i + 2] = Math.floor(dataB.data[i + 2] * 0.3);
        diff.data[i + 3] = 255;
      }
    }

    ctx.putImageData(diff, 0, 0);
    (document.getElementById("diff-canvas-output") as HTMLImageElement).src =
      canvas.toDataURL();

    const totalPixels = w * h;
    const pct = ((diffPixels / totalPixels) * 100).toFixed(2);
    const statsEl = document.getElementById("diff-stats")!;
    statsEl.textContent = `${pct}% different (${diffPixels.toLocaleString()} pixels)`;
    statsEl.className = `badge ${parseFloat(pct) > 1 ? "badge-red" : "badge-green"}`;
  };

  imgA.onload = onLoad;
  imgB.onload = onLoad;
  imgA.src = baselineDataUrl!;
  imgB.src = currentDataUrl!;
}

function setupSlider() {
  let isDragging = false;

  document.addEventListener("mousedown", (e) => {
    if (
      (e.target as HTMLElement)?.id === "diff-slider" ||
      (e.target as HTMLElement)?.closest("#diff-slider")
    ) {
      isDragging = true;
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const container = document.getElementById("slider-view");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    document.getElementById("diff-overlay")!.style.width = `${x * 100}%`;
    document.getElementById("diff-slider")!.style.left = `${x * 100}%`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
}
