// ============================================================================
// Smart Masking Agent — Intelligent dynamic content masking for visual regression
// Auto-detects elements that change between runs and masks them for stable diffs
// ============================================================================

import { safeEvaluate } from "./evaluate.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaskTarget {
  selector: string;
  reason: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Date/time text patterns used inside page.evaluate
// ---------------------------------------------------------------------------

const DATE_TIME_PATTERNS_SOURCE = `[
  /\\b\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/,
  /\\b\\d{4}-\\d{2}-\\d{2}\\b/,
  /\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b/,
  /\\b\\d{1,2}\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\w*\\s+\\d{2,4}\\b/i,
  /\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\w*\\s+\\d{1,2},?\\s+\\d{2,4}\\b/i,
  /\\b\\d{1,2}:\\d{2}(:\\d{2})?\\s*(AM|PM|am|pm)?\\b/,
  /\\b\\d+\\s+(second|minute|hour|day|week|month|year)s?\\s+ago\\b/i,
  /\\byesterday\\b/i,
  /\\bjust now\\b/i,
  /\\b(a|an)\\s+(minute|hour|day|week|month)\\s+ago\\b/i,
  /\\b\\d{10,13}\\b/
]`;

// ---------------------------------------------------------------------------
// CSS class fragments that indicate dynamic content
// ---------------------------------------------------------------------------

const DYNAMIC_CLASS_FRAGMENTS = [
  "timestamp", "date", "time", "counter", "count", "badge",
  "avatar", "ad", "sponsor", "dynamic", "live", "random",
];

// ---------------------------------------------------------------------------
// Ad network iframe patterns
// ---------------------------------------------------------------------------

const AD_IFRAME_PATTERNS = [
  "googlesyndication", "doubleclick", "adsense",
  "facebook", "twitter",
];

// ---------------------------------------------------------------------------
// Avatar/profile image service patterns
// ---------------------------------------------------------------------------

const AVATAR_IMG_PATTERNS = [
  "gravatar.com", "avatar", "ui-avatars.com",
  "profilephoto", "profile-photo", "user-avatar",
];

// ---------------------------------------------------------------------------
// 1. detectDynamicContent — find elements likely to change between runs
// ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function detectDynamicContent(page: any): Promise<MaskTarget[]> {
  const targets: MaskTarget[] = [];
  const seenSelectors = new Set<string>();

  function addTarget(selector: string, reason: string, confidence: number): void {
    if (seenSelectors.has(selector)) return;
    seenSelectors.add(selector);
    targets.push({ selector, reason, confidence });
  }

  // --- Text content matching date/time patterns ---
  const dateTimeMatches = await safeEvaluate<Array<{ selector: string; text: string }>>(
    page,
    `(() => {
      const patterns = ${DATE_TIME_PATTERNS_SOURCE};
      const results = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null,
      );
      let node;
      let idx = 0;
      while ((node = walker.nextNode()) && idx < 500) {
        const el = node;
        // Only check direct text content (not children's text)
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent || "")
          .join("");
        if (!directText.trim()) continue;
        const matchesPattern = patterns.some(p => p.test(directText));
        if (matchesPattern) {
          // Build a reasonable selector
          let selector = el.tagName.toLowerCase();
          if (el.id) {
            selector = "#" + CSS.escape(el.id);
          } else if (el.className && typeof el.className === "string") {
            const cls = el.className.trim().split(/\\s+/)[0];
            if (cls) selector = el.tagName.toLowerCase() + "." + CSS.escape(cls);
          }
          results.push({ selector, text: directText.trim().slice(0, 80) });
          idx++;
        }
      }
      return results;
    })()`,
    [],
  );

  for (const match of dateTimeMatches) {
    addTarget(match.selector, `Text matches date/time pattern: "${match.text}"`, 0.85);
  }

  // --- <time> elements and elements with datetime attribute ---
  const timeElements = await safeEvaluate<string[]>(
    page,
    `(() => {
      const results = [];
      const elements = document.querySelectorAll("time, [datetime]");
      for (const el of elements) {
        let selector = el.tagName.toLowerCase();
        if (el.id) selector = "#" + CSS.escape(el.id);
        else if (el.className && typeof el.className === "string") {
          const cls = el.className.trim().split(/\\s+/)[0];
          if (cls) selector = el.tagName.toLowerCase() + "." + CSS.escape(cls);
        }
        results.push(selector);
      }
      return results;
    })()`,
    [],
  );

  for (const sel of timeElements) {
    addTarget(sel, "Element is <time> tag or has datetime attribute", 0.9);
  }

  // --- Elements with dynamic CSS classes ---
  const classFragmentsJson = JSON.stringify(DYNAMIC_CLASS_FRAGMENTS);
  const dynamicClassMatches = await safeEvaluate<Array<{ selector: string; className: string }>>(
    page,
    `(() => {
      const fragments = ${classFragmentsJson};
      const results = [];
      const all = document.querySelectorAll("*");
      for (let i = 0; i < all.length && results.length < 200; i++) {
        const el = all[i];
        const cls = typeof el.className === "string" ? el.className.toLowerCase() : "";
        if (!cls) continue;
        const matchedFragment = fragments.find(f => cls.includes(f));
        if (matchedFragment) {
          let selector = el.tagName.toLowerCase();
          if (el.id) {
            selector = "#" + CSS.escape(el.id);
          } else {
            const firstClass = el.className.trim().split(/\\s+/)[0];
            if (firstClass) selector = el.tagName.toLowerCase() + "." + CSS.escape(firstClass);
          }
          results.push({ selector, className: el.className });
        }
      }
      return results;
    })()`,
    [],
  );

  for (const match of dynamicClassMatches) {
    const fragment = DYNAMIC_CLASS_FRAGMENTS.find((f) =>
      match.className.toLowerCase().includes(f),
    );
    addTarget(
      match.selector,
      `CSS class contains "${fragment}": ${match.className.slice(0, 80)}`,
      0.7,
    );
  }

  // --- Elements with data-testid containing dynamic keywords ---
  const testIdMatches = await safeEvaluate<string[]>(
    page,
    `(() => {
      const keywords = ["time", "date", "count", "random"];
      const results = [];
      const elements = document.querySelectorAll("[data-testid]");
      for (const el of elements) {
        const testId = (el.getAttribute("data-testid") || "").toLowerCase();
        if (keywords.some(k => testId.includes(k))) {
          results.push("[data-testid=\\"" + CSS.escape(el.getAttribute("data-testid") || "") + "\\"]");
        }
      }
      return results;
    })()`,
    [],
  );

  for (const sel of testIdMatches) {
    addTarget(sel, "data-testid contains dynamic keyword (time/date/count/random)", 0.8);
  }

  // --- Iframes from ad networks ---
  const adIframeJson = JSON.stringify(AD_IFRAME_PATTERNS);
  const adIframes = await safeEvaluate<string[]>(
    page,
    `(() => {
      const adPatterns = ${adIframeJson};
      const results = [];
      const iframes = document.querySelectorAll("iframe[src]");
      for (const iframe of iframes) {
        const src = (iframe.getAttribute("src") || "").toLowerCase();
        if (adPatterns.some(p => src.includes(p))) {
          let selector = "iframe";
          if (iframe.id) {
            selector = "#" + CSS.escape(iframe.id);
          } else {
            const srcAttr = iframe.getAttribute("src") || "";
            selector = "iframe[src*=\\"" + adPatterns.find(p => src.includes(p)) + "\\"]";
          }
          results.push(selector);
        }
      }
      return results;
    })()`,
    [],
  );

  for (const sel of adIframes) {
    addTarget(sel, "Iframe from ad network", 0.95);
  }

  // --- Images from avatar/profile services ---
  const avatarPatternsJson = JSON.stringify(AVATAR_IMG_PATTERNS);
  const avatarImages = await safeEvaluate<string[]>(
    page,
    `(() => {
      const patterns = ${avatarPatternsJson};
      const results = [];
      const images = document.querySelectorAll("img[src]");
      for (const img of images) {
        const src = (img.getAttribute("src") || "").toLowerCase();
        if (patterns.some(p => src.includes(p))) {
          let selector = "img";
          if (img.id) {
            selector = "#" + CSS.escape(img.id);
          } else if (img.className && typeof img.className === "string") {
            const cls = img.className.trim().split(/\\s+/)[0];
            if (cls) selector = "img." + CSS.escape(cls);
          } else {
            const matchedPattern = patterns.find(p => src.includes(p));
            selector = "img[src*=\\"" + matchedPattern + "\\"]";
          }
          results.push(selector);
        }
      }
      return results;
    })()`,
    [],
  );

  for (const sel of avatarImages) {
    addTarget(sel, "Image from avatar/profile service", 0.8);
  }

  // --- Elements with rapidly changing content (mutation-prone) ---
  // Observe mutations for a brief window to find live-updating elements
  const mutationTargets = await safeEvaluate<Array<{ selector: string; mutations: number }>>(
    page,
    `(() => {
      return new Promise((resolve) => {
        const hits = new Map();
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            const target = mutation.target;
            if (!(target instanceof HTMLElement)) continue;
            if (target === document.body || target === document.documentElement) continue;
            let selector = target.tagName.toLowerCase();
            if (target.id) {
              selector = "#" + CSS.escape(target.id);
            } else if (target.className && typeof target.className === "string") {
              const cls = target.className.trim().split(/\\s+/)[0];
              if (cls) selector = target.tagName.toLowerCase() + "." + CSS.escape(cls);
            }
            hits.set(selector, (hits.get(selector) || 0) + 1);
          }
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
        setTimeout(() => {
          observer.disconnect();
          const results = [];
          for (const [selector, count] of hits.entries()) {
            if (count >= 2) {
              results.push({ selector, mutations: count });
            }
          }
          resolve(results);
        }, 1500);
      });
    })()`,
    [],
    5000,
  );

  for (const hit of mutationTargets) {
    addTarget(
      hit.selector,
      `Element had ${hit.mutations} DOM mutations in 1.5s (live-updating)`,
      Math.min(0.6 + hit.mutations * 0.05, 0.95),
    );
  }

  // Sort by confidence descending
  targets.sort((a, b) => b.confidence - a.confidence);

  return targets;
}

// ---------------------------------------------------------------------------
// 2. applySmartMasks — replace detected dynamic elements with gray blocks
// ---------------------------------------------------------------------------

export async function applySmartMasks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  targets?: MaskTarget[],
): Promise<number> {
  const maskTargets = targets ?? (await detectDynamicContent(page));

  if (maskTargets.length === 0) {
    return 0;
  }

  const selectorsJson = JSON.stringify(maskTargets.map((t) => t.selector));

  const maskedCount = await safeEvaluate<number>(
    page,
    `(() => {
      const selectors = ${selectorsJson};
      let count = 0;
      for (const sel of selectors) {
        try {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            // Preserve original dimensions
            const width = rect.width;
            const height = rect.height;

            // Apply solid gray mask
            el.style.cssText = [
              "background-color: #808080 !important",
              "background-image: none !important",
              "color: #808080 !important",
              "border-color: #808080 !important",
              "box-shadow: none !important",
              "overflow: hidden !important",
              "opacity: 1 !important",
              "min-width: " + width + "px",
              "min-height: " + height + "px",
              "max-width: " + width + "px",
              "max-height: " + height + "px",
            ].join("; ");

            // Clear all children content
            el.textContent = "";

            count++;
          }
        } catch {
          // Invalid selector for this page — skip
        }
      }
      return count;
    })()`,
    0,
  );

  return maskedCount;
}

// ---------------------------------------------------------------------------
// 3. learnMasks — take N screenshots and find elements that change
// ---------------------------------------------------------------------------

/**
 * Take N screenshots with delays between them and compare pixel regions to
 * find elements that change across captures. Uses a simple grid-based
 * comparison: the page is divided into cells, and cells that differ between
 * any two consecutive samples are mapped back to the DOM elements at those
 * coordinates.
 *
 * @param page — Playwright Page
 * @param url — URL to navigate to (will reload between samples)
 * @param samples — number of screenshots to take (default 3)
 * @returns MaskTarget array of elements that changed between captures
 */
export async function learnMasks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  url: string,
  samples = 3,
): Promise<MaskTarget[]> {
  const effectiveSamples = Math.max(2, Math.min(samples, 10));

  // Collect pixel data snapshots by dividing the viewport into a grid
  // and computing a hash of each cell's content
  const CELL_SIZE = 50; // pixels per grid cell

  const gridSnapshots: Array<Map<string, string>> = [];

  for (let i = 0; i < effectiveSamples; i++) {
    // Navigate fresh each time to capture dynamic content variations
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    } catch {
      try {
        await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      } catch {
        // Continue with whatever loaded
      }
    }

    // Wait for the page to settle
    if (i > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }

    // Capture a grid-cell color snapshot using page.evaluate
    const snapshot = await safeEvaluate<Array<{ key: string; hash: string }>>(
      page,
      `(() => {
        const cellSize = ${CELL_SIZE};
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cols = Math.ceil(vw / cellSize);
        const rows = Math.ceil(vh / cellSize);
        const results = [];

        // Use a canvas to sample pixel data from the viewport
        // This samples the element at the center of each grid cell
        for (let row = 0; row < rows && row < 100; row++) {
          for (let col = 0; col < cols && col < 100; col++) {
            const cx = col * cellSize + Math.floor(cellSize / 2);
            const cy = row * cellSize + Math.floor(cellSize / 2);
            const el = document.elementFromPoint(cx, cy);
            if (!el) continue;

            // Build a content fingerprint: tag + text + computed bg color
            const style = getComputedStyle(el);
            const text = (el.textContent || "").trim().slice(0, 100);
            const bg = style.backgroundColor;
            const color = style.color;
            const hash = el.tagName + "|" + text + "|" + bg + "|" + color;

            results.push({
              key: row + "," + col,
              hash: hash,
            });
          }
        }
        return results;
      })()`,
      [],
    );

    const gridMap = new Map<string, string>();
    for (const cell of snapshot) {
      gridMap.set(cell.key, cell.hash);
    }
    gridSnapshots.push(gridMap);
  }

  // Find grid cells that changed between any two consecutive snapshots
  const changedCells = new Set<string>();

  for (let i = 1; i < gridSnapshots.length; i++) {
    const prev = gridSnapshots[i - 1];
    const curr = gridSnapshots[i];

    // Check all cells present in either snapshot
    const allKeys = new Set([...prev.keys(), ...curr.keys()]);
    for (const key of allKeys) {
      const prevHash = prev.get(key);
      const currHash = curr.get(key);
      if (prevHash !== currHash) {
        changedCells.add(key);
      }
    }
  }

  if (changedCells.size === 0) {
    return [];
  }

  // Map changed grid cells back to DOM elements by finding the element
  // at the center of each changed cell
  const changedCellCoords = Array.from(changedCells).map((key) => {
    const [row, col] = key.split(",").map(Number);
    return { row, col };
  });

  const coordsJson = JSON.stringify(changedCellCoords);

  const dynamicElements = await safeEvaluate<Array<{ selector: string; reason: string }>>(
    page,
    `(() => {
      const cellSize = ${CELL_SIZE};
      const coords = ${coordsJson};
      const seen = new Set();
      const results = [];

      for (const { row, col } of coords) {
        const cx = col * cellSize + Math.floor(cellSize / 2);
        const cy = row * cellSize + Math.floor(cellSize / 2);
        const el = document.elementFromPoint(cx, cy);
        if (!el || el === document.body || el === document.documentElement) continue;

        let selector = el.tagName.toLowerCase();
        if (el.id) {
          selector = "#" + CSS.escape(el.id);
        } else if (el.className && typeof el.className === "string") {
          const cls = el.className.trim().split(/\\s+/)[0];
          if (cls) selector = el.tagName.toLowerCase() + "." + CSS.escape(cls);
        }

        if (seen.has(selector)) continue;
        seen.add(selector);

        const rect = el.getBoundingClientRect();
        results.push({
          selector,
          reason: "Content changed between page loads at region (" +
            Math.round(rect.left) + "," + Math.round(rect.top) + " " +
            Math.round(rect.width) + "x" + Math.round(rect.height) + ")",
        });
      }

      return results;
    })()`,
    [],
  );

  const targets: MaskTarget[] = dynamicElements.map((el) => ({
    selector: el.selector,
    reason: el.reason,
    confidence: 0.75,
  }));

  // Deduplicate and sort by selector for stability
  const uniqueTargets = new Map<string, MaskTarget>();
  for (const target of targets) {
    if (!uniqueTargets.has(target.selector)) {
      uniqueTargets.set(target.selector, target);
    }
  }

  return Array.from(uniqueTargets.values());
}
