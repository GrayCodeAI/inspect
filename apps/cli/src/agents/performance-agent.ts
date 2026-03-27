import type {
  PerformanceReport,
  CoreWebVitals,
  ResourceAnalysis,
  UnoptimizedImage,
  SlowApiCall,
  RedirectChain,
  ProgressCallback,
} from "./types.js";

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runPerformanceAudit(
  page: any,
  url: string,
  onProgress: ProgressCallback,
): Promise<PerformanceReport> {
  onProgress("info", "Running performance audit...");

  // Capture JS errors before navigation (must attach listeners first)
  const jsErrorsPromise = captureJsErrors(page);

  // Set up API call monitoring before navigation
  const apiCallsPromise = monitorApiCalls(page, url);

  // Track redirect chains via request interception
  const redirectChains: RedirectChain[] = [];
  const redirectMap = new Map<string, string[]>();

  page.on("request", (req: any) => {
    const redirected = req.redirectedFrom();
    if (redirected) {
      const startUrl = redirected.url();
      const existing = redirectMap.get(startUrl) ?? [startUrl];
      existing.push(req.url());
      redirectMap.set(startUrl, existing);
    }
  });

  // Navigate to URL and measure load time
  onProgress("step", "  Navigating to page...");
  const navStart = Date.now();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    // If networkidle times out, try with load event
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    } catch {
      onProgress("warn", "  Page navigation timed out, continuing with partial results");
    }
  }
  const navDuration = Date.now() - navStart;
  onProgress("step", `  Page loaded in ${navDuration}ms`);

  // Give observers a moment to collect data
  await page.waitForTimeout(1000);

  // Collect redirect chains from the map
  for (const [startUrl, hops] of redirectMap) {
    if (hops.length > 1) {
      redirectChains.push({
        startUrl,
        hops: hops.slice(1, -1),
        finalUrl: hops[hops.length - 1],
      });
    }
  }

  // Run all checks in parallel
  onProgress("step", "  Measuring Core Web Vitals...");
  const [metrics, resources, jsErrors, slowApis, mixedContent] =
    await Promise.all([
      measureCoreWebVitals(page),
      analyzeResources(page),
      jsErrorsPromise,
      apiCallsPromise,
      detectMixedContent(page),
    ]);

  // Calculate score using weighted average
  const score = calculateScore(metrics, resources);

  const report: PerformanceReport = {
    url,
    metrics,
    resources,
    jsErrors,
    slowApis,
    redirectChains,
    mixedContent,
    score,
  };

  // Report results
  if (score >= 90) {
    onProgress("pass", `  ✓ Performance: ${score}/100`);
  } else if (score >= 50) {
    onProgress("warn", `  ⚠ Performance: ${score}/100`);
  } else {
    onProgress("fail", `  ✗ Performance: ${score}/100`);
  }

  if (metrics.lcp > 2500) {
    onProgress("warn", `    LCP: ${metrics.lcp}ms (should be <2500ms)`);
  }
  if (metrics.cls > 0.1) {
    onProgress("warn", `    CLS: ${metrics.cls.toFixed(3)} (should be <0.1)`);
  }
  if (metrics.fid > 200) {
    onProgress("warn", `    FID: ${metrics.fid}ms (should be <200ms)`);
  }
  if (resources.unoptimizedImages.length > 0) {
    onProgress(
      "warn",
      `    ${resources.unoptimizedImages.length} unoptimized image(s)`,
    );
  }
  if (slowApis.length > 0) {
    onProgress("warn", `    ${slowApis.length} slow/failed API call(s)`);
  }
  if (mixedContent.length > 0) {
    onProgress("warn", `    ${mixedContent.length} mixed content URL(s)`);
  }
  if (jsErrors.length > 0) {
    onProgress("warn", `    ${jsErrors.length} JavaScript error(s)`);
  }

  onProgress("done", "  Performance audit complete");
  return report;
}

// ---------------------------------------------------------------------------
// Core Web Vitals
// ---------------------------------------------------------------------------

export async function measureCoreWebVitals(page: any): Promise<CoreWebVitals> {
  const vitals = await page.evaluate(`
    (async () => {
      const result = {
        lcp: 0,
        cls: 0,
        fid: 0,
        fcp: 0,
        ttfb: 0,
        domContentLoaded: 0,
        fullLoad: 0,
      };

      // Navigation timing (reliable baseline)
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) {
        result.ttfb = Math.round(nav.responseStart - nav.requestStart);
        result.domContentLoaded = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
        result.fullLoad = Math.round(nav.loadEventEnd - nav.startTime);
      }

      // FCP from paint timing
      const paintEntries = performance.getEntriesByType("paint");
      for (const entry of paintEntries) {
        if (entry.name === "first-contentful-paint") {
          result.fcp = Math.round(entry.startTime);
          break;
        }
      }

      // LCP — try PerformanceObserver buffered entries first
      try {
        const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
        if (lcpEntries && lcpEntries.length > 0) {
          result.lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
        }
      } catch {}

      // If LCP not available from getEntriesByType, try observer approach
      if (result.lcp === 0) {
        try {
          result.lcp = await new Promise((resolve) => {
            let lcpValue = 0;
            const observer = new PerformanceObserver((list) => {
              const entries = list.getEntries();
              for (const entry of entries) {
                lcpValue = Math.round(entry.startTime);
              }
            });
            observer.observe({ type: "largest-contentful-paint", buffered: true });
            setTimeout(() => {
              observer.disconnect();
              resolve(lcpValue);
            }, 2000);
          });
        } catch {
          // Fallback: use domContentLoaded as rough LCP estimate
          result.lcp = result.domContentLoaded;
        }
      }

      // CLS — accumulate layout shift entries
      try {
        const layoutShiftEntries = performance.getEntriesByType("layout-shift");
        if (layoutShiftEntries && layoutShiftEntries.length > 0) {
          let clsValue = 0;
          for (const entry of layoutShiftEntries) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
          result.cls = parseFloat(clsValue.toFixed(4));
        }
      } catch {}

      // If CLS not from getEntriesByType, try observer
      if (result.cls === 0) {
        try {
          result.cls = await new Promise((resolve) => {
            let clsTotal = 0;
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                  clsTotal += entry.value;
                }
              }
            });
            observer.observe({ type: "layout-shift", buffered: true });
            setTimeout(() => {
              observer.disconnect();
              resolve(parseFloat(clsTotal.toFixed(4)));
            }, 2000);
          });
        } catch {
          result.cls = 0;
        }
      }

      // FID — try observer with buffered flag
      try {
        const fidResult = await new Promise((resolve) => {
          let fidValue = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              fidValue = Math.round(entry.processingStart - entry.startTime);
            }
          });
          observer.observe({ type: "first-input", buffered: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(fidValue);
          }, 2000);
        });
        result.fid = fidResult;
      } catch {
        // Estimate FID from total blocking time heuristic
        // Long tasks > 50ms contribute to TBT which correlates with FID
        try {
          const longTasks = performance.getEntriesByType("longtask");
          let tbt = 0;
          for (const task of longTasks) {
            if (task.duration > 50) {
              tbt += task.duration - 50;
            }
          }
          // Rough FID estimate: TBT / 5 (empirical correlation)
          result.fid = Math.round(Math.min(tbt / 5, 500));
        } catch {
          result.fid = 0;
        }
      }

      // Ensure fallback values if navigation timing was sparse
      if (result.lcp === 0 && result.domContentLoaded > 0) {
        result.lcp = result.domContentLoaded;
      }
      if (result.fcp === 0 && result.domContentLoaded > 0) {
        result.fcp = Math.round(result.domContentLoaded * 0.7);
      }

      return result;
    })()
  `) as CoreWebVitals;

  return vitals;
}

// ---------------------------------------------------------------------------
// Resource analysis
// ---------------------------------------------------------------------------

export async function analyzeResources(page: any): Promise<ResourceAnalysis> {
  const rawResources = await page.evaluate(`
    (() => {
      const entries = performance.getEntriesByType("resource");
      return entries.map(e => ({
        name: e.name,
        type: e.initiatorType,
        size: e.transferSize || e.encodedBodySize || 0,
        duration: e.duration,
      }));
    })()
  `) as Array<{
    name: string;
    type: string;
    size: number;
    duration: number;
  }>;

  let jsSize = 0;
  let cssSize = 0;
  let imageSize = 0;
  let fontSize = 0;
  let totalSize = 0;

  for (const r of rawResources) {
    totalSize += r.size;
    if (r.type === "script" || r.name.match(/\.m?js(\?|$)/i)) {
      jsSize += r.size;
    } else if (r.type === "css" || r.name.match(/\.css(\?|$)/i)) {
      cssSize += r.size;
    } else if (
      r.type === "img" ||
      r.name.match(/\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)(\?|$)/i)
    ) {
      imageSize += r.size;
    } else if (r.name.match(/\.(woff2?|ttf|otf|eot)(\?|$)/i)) {
      fontSize += r.size;
    }
  }

  // Identify unoptimized images
  const unoptimizedImages: UnoptimizedImage[] = [];
  const imageEntries = rawResources.filter(
    (r) =>
      r.type === "img" ||
      r.name.match(/\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)(\?|$)/i),
  );

  for (const img of imageEntries) {
    const isOptimizedFormat = /\.(webp|avif)(\?|$)/i.test(img.name);
    const sizeThreshold = 200 * 1024; // 200KB

    if (img.size > sizeThreshold && !isOptimizedFormat) {
      const formatMatch = img.name.match(/\.(png|jpe?g|gif|svg|bmp)(\?|$)/i);
      const format = formatMatch ? formatMatch[1].toUpperCase() : "unknown";
      unoptimizedImages.push({
        url: img.name.length > 120 ? img.name.slice(0, 120) + "..." : img.name,
        size: img.size,
        format,
        suggestion:
          format === "SVG"
            ? "Minify SVG or consider rasterizing if complex"
            : `Convert to WebP/AVIF (current: ${format}, ${formatBytes(img.size)})`,
      });
    }
  }

  // Check for images without lazy loading below the fold
  const lazyIssues = await page.evaluate(`
    (() => {
      const results = [];
      const viewportHeight = window.innerHeight;
      const imgs = Array.from(document.querySelectorAll("img"));
      for (const img of imgs) {
        const rect = img.getBoundingClientRect();
        const isBelowFold = rect.top > viewportHeight;
        const hasLazy = img.loading === "lazy" || img.getAttribute("loading") === "lazy";
        if (isBelowFold && !hasLazy && img.src) {
          results.push({
            url: img.src.length > 120 ? img.src.slice(0, 120) + "..." : img.src,
            width: img.naturalWidth || 0,
            height: img.naturalHeight || 0,
          });
        }
      }
      return results.slice(0, 10);
    })()
  `) as Array<{ url: string; width: number; height: number }>;

  for (const img of lazyIssues) {
    // Avoid duplicates if already flagged for size
    if (!unoptimizedImages.some((u) => img.url.startsWith(u.url.replace("...", "")))) {
      unoptimizedImages.push({
        url: img.url,
        size: 0, // Size unknown from DOM
        format: "unknown",
        suggestion: "Add loading=\"lazy\" (image is below the fold)",
      });
    }
  }

  // Identify render-blocking resources
  const renderBlocking = await page.evaluate(`
    (() => {
      const blocking = [];
      // Synchronous scripts in <head>
      const headScripts = document.querySelectorAll("head script[src]:not([async]):not([defer]):not([type='module'])");
      for (const s of Array.from(headScripts)) {
        blocking.push(s.getAttribute("src") || "");
      }
      // Stylesheets without media query (all are render-blocking by default)
      const sheets = document.querySelectorAll("link[rel='stylesheet']");
      for (const s of Array.from(sheets)) {
        const media = s.getAttribute("media");
        if (!media || media === "all") {
          blocking.push(s.getAttribute("href") || "");
        }
      }
      return blocking.filter(Boolean).map(u => u.length > 120 ? u.slice(0, 120) + "..." : u);
    })()
  `) as string[];

  return {
    totalRequests: rawResources.length,
    totalSize,
    jsSize,
    cssSize,
    imageSize,
    fontSize,
    unoptimizedImages,
    renderBlocking,
  };
}

// ---------------------------------------------------------------------------
// JavaScript error capture
// ---------------------------------------------------------------------------

export async function captureJsErrors(page: any): Promise<string[]> {
  const errors: string[] = [];

  page.on("pageerror", (error: Error) => {
    errors.push(`[PageError] ${error.message}`);
  });

  page.on("console", (msg: any) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Avoid duplicating page errors that also appear in console
      if (!errors.some((e) => e.includes(text.slice(0, 50)))) {
        errors.push(`[ConsoleError] ${text}`);
      }
    }
  });

  // Return the errors array — callers should await this after navigation
  // The array is populated by event listeners attached above
  return errors;
}

// ---------------------------------------------------------------------------
// API call monitoring
// ---------------------------------------------------------------------------

export async function monitorApiCalls(
  page: any,
  url: string,
): Promise<SlowApiCall[]> {
  const slowCalls: SlowApiCall[] = [];
  const requestTimings = new Map<string, { method: string; start: number }>();

  const SLOW_THRESHOLD_MS = 3000;

  page.on("request", (request: any) => {
    const resourceType = request.resourceType();
    if (resourceType === "xhr" || resourceType === "fetch") {
      requestTimings.set(request.url(), {
        method: request.method(),
        start: Date.now(),
      });
    }
  });

  page.on("response", (response: any) => {
    const reqUrl = response.url();
    const timing = requestTimings.get(reqUrl);
    if (!timing) return;

    const duration = Date.now() - timing.start;
    const status = response.status();

    const isSlow = duration > SLOW_THRESHOLD_MS;
    const isFailed = status >= 400;

    if (isSlow || isFailed) {
      slowCalls.push({
        url: reqUrl.length > 200 ? reqUrl.slice(0, 200) + "..." : reqUrl,
        method: timing.method,
        duration,
        status,
      });
    }

    requestTimings.delete(reqUrl);
  });

  // Also capture timed-out requests that never got a response
  page.on("requestfailed", (request: any) => {
    const reqUrl = request.url();
    const timing = requestTimings.get(reqUrl);
    if (!timing) return;

    const duration = Date.now() - timing.start;
    slowCalls.push({
      url: reqUrl.length > 200 ? reqUrl.slice(0, 200) + "..." : reqUrl,
      method: timing.method,
      duration,
      status: 0,
    });

    requestTimings.delete(reqUrl);
  });

  return slowCalls;
}

// ---------------------------------------------------------------------------
// Mixed content detection
// ---------------------------------------------------------------------------

export async function detectMixedContent(page: any): Promise<string[]> {
  const pageUrl = page.url() as string;

  // Only relevant for HTTPS pages
  if (!pageUrl.startsWith("https://")) {
    return [];
  }

  const mixedUrls = await page.evaluate(`
    (() => {
      const mixed = new Set();

      // Check images
      for (const el of document.querySelectorAll("img[src]")) {
        const src = el.getAttribute("src") || "";
        if (src.startsWith("http://")) mixed.add(src);
      }

      // Check scripts
      for (const el of document.querySelectorAll("script[src]")) {
        const src = el.getAttribute("src") || "";
        if (src.startsWith("http://")) mixed.add(src);
      }

      // Check stylesheets
      for (const el of document.querySelectorAll("link[rel='stylesheet'][href]")) {
        const href = el.getAttribute("href") || "";
        if (href.startsWith("http://")) mixed.add(href);
      }

      // Check iframes
      for (const el of document.querySelectorAll("iframe[src]")) {
        const src = el.getAttribute("src") || "";
        if (src.startsWith("http://")) mixed.add(src);
      }

      // Check fonts (via CSS @font-face — check link preloads)
      for (const el of document.querySelectorAll("link[rel='preload'][as='font'][href]")) {
        const href = el.getAttribute("href") || "";
        if (href.startsWith("http://")) mixed.add(href);
      }

      // Check video/audio sources
      for (const el of document.querySelectorAll("video[src], audio[src], source[src]")) {
        const src = el.getAttribute("src") || "";
        if (src.startsWith("http://")) mixed.add(src);
      }

      // Check object/embed
      for (const el of document.querySelectorAll("object[data], embed[src]")) {
        const attr = el.getAttribute("data") || el.getAttribute("src") || "";
        if (attr.startsWith("http://")) mixed.add(attr);
      }

      return Array.from(mixed);
    })()
  `) as string[];

  return mixedUrls;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function calculateScore(
  metrics: CoreWebVitals,
  resources: ResourceAnalysis,
): number {
  // LCP scoring (30% weight)
  // Good: <2500ms, Needs improvement: 2500-4000ms, Poor: >4000ms
  let lcpScore: number;
  if (metrics.lcp <= 2500) {
    lcpScore = 100 - (metrics.lcp / 2500) * 10; // 90-100
  } else if (metrics.lcp <= 4000) {
    lcpScore = 90 - ((metrics.lcp - 2500) / 1500) * 40; // 50-90
  } else {
    lcpScore = Math.max(0, 50 - ((metrics.lcp - 4000) / 4000) * 50); // 0-50
  }

  // CLS scoring (25% weight)
  // Good: <0.1, Needs improvement: 0.1-0.25, Poor: >0.25
  let clsScore: number;
  if (metrics.cls <= 0.1) {
    clsScore = 100 - (metrics.cls / 0.1) * 10; // 90-100
  } else if (metrics.cls <= 0.25) {
    clsScore = 90 - ((metrics.cls - 0.1) / 0.15) * 40; // 50-90
  } else {
    clsScore = Math.max(0, 50 - ((metrics.cls - 0.25) / 0.25) * 50); // 0-50
  }

  // FCP scoring (20% weight)
  // Good: <1800ms, Needs improvement: 1800-3000ms, Poor: >3000ms
  let fcpScore: number;
  if (metrics.fcp <= 1800) {
    fcpScore = 100 - (metrics.fcp / 1800) * 10; // 90-100
  } else if (metrics.fcp <= 3000) {
    fcpScore = 90 - ((metrics.fcp - 1800) / 1200) * 40; // 50-90
  } else {
    fcpScore = Math.max(0, 50 - ((metrics.fcp - 3000) / 3000) * 50); // 0-50
  }

  // TTFB scoring (15% weight)
  // Good: <800ms, Needs improvement: 800-1800ms, Poor: >1800ms
  let ttfbScore: number;
  if (metrics.ttfb <= 800) {
    ttfbScore = 100 - (metrics.ttfb / 800) * 10; // 90-100
  } else if (metrics.ttfb <= 1800) {
    ttfbScore = 90 - ((metrics.ttfb - 800) / 1000) * 40; // 50-90
  } else {
    ttfbScore = Math.max(0, 50 - ((metrics.ttfb - 1800) / 1800) * 50); // 0-50
  }

  // Resource scoring (10% weight)
  // Penalize for unoptimized images and render-blocking resources
  let resourceScore = 100;
  resourceScore -= resources.unoptimizedImages.length * 10;
  resourceScore -= resources.renderBlocking.length * 5;
  // Penalize for excessive total size (>3MB)
  if (resources.totalSize > 3 * 1024 * 1024) {
    resourceScore -= 20;
  } else if (resources.totalSize > 1.5 * 1024 * 1024) {
    resourceScore -= 10;
  }
  // Penalize for excessive requests (>80)
  if (resources.totalRequests > 80) {
    resourceScore -= 15;
  } else if (resources.totalRequests > 50) {
    resourceScore -= 5;
  }
  resourceScore = Math.max(0, resourceScore);

  // Weighted average
  const score =
    lcpScore * 0.3 +
    clsScore * 0.25 +
    fcpScore * 0.2 +
    ttfbScore * 0.15 +
    resourceScore * 0.1;

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
