import type { ResponsiveReport, ViewportResult, ResponsiveIssue, ProgressCallback } from "./types.js";
import { safeEvaluate } from "./evaluate.js";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

// ============================================================================
// Responsive Agent (Agent 11) — Tests pages at multiple viewports
// ============================================================================

interface ViewportDef {
  width: number;
  height: number;
  label: string;
}

const VIEWPORTS: ViewportDef[] = [
  { width: 375, height: 667, label: "iPhone SE" },
  { width: 390, height: 844, label: "iPhone 14" },
  { width: 412, height: 915, label: "Pixel 7" },
  { width: 768, height: 1024, label: "iPad Mini" },
  { width: 820, height: 1180, label: "iPad Air" },
  { width: 1024, height: 1366, label: "iPad Pro" },
  { width: 1280, height: 800, label: "Laptop" },
  { width: 1440, height: 900, label: "Desktop" },
  { width: 1920, height: 1080, label: "Full HD" },
];

const MOBILE_BREAKPOINT = 768;

export async function runResponsiveAudit(
  page: any,
  url: string,
  onProgress: ProgressCallback,
): Promise<ResponsiveReport> {
  onProgress("info", "Running responsive audit across 9 viewports...");

  const viewportResults: ViewportResult[] = [];

  for (const vp of VIEWPORTS) {
    onProgress("step", `  Testing ${vp.label} (${vp.width}×${vp.height})...`);

    try {
      const result = await testViewport(page, url, vp.width, vp.height, vp.label);
      viewportResults.push(result);

      const issueCount = result.issues.length;
      if (issueCount === 0) {
        onProgress("pass", `    ✓ ${vp.label}: No issues`);
      } else {
        onProgress("warn", `    ⚠ ${vp.label}: ${issueCount} issue(s)`);
        for (const issue of result.issues.slice(0, 3)) {
          onProgress("warn", `      ${issue.severity}: ${issue.description}`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      onProgress("fail", `    ✗ ${vp.label}: ${message}`);
      viewportResults.push({
        width: vp.width,
        height: vp.height,
        label: vp.label,
        issues: [
          {
            type: "layout",
            description: `Viewport test failed: ${message}`,
            severity: "critical",
          },
        ],
      });
    }
  }

  // Calculate overall score: average per-viewport scores
  let totalScore = 0;
  for (const vr of viewportResults) {
    let vpScore = 100;
    for (const issue of vr.issues) {
      switch (issue.severity) {
        case "critical":
          vpScore -= 15;
          break;
        case "serious":
          vpScore -= 10;
          break;
        case "moderate":
          vpScore -= 5;
          break;
        case "minor":
          vpScore -= 2;
          break;
      }
    }
    totalScore += Math.max(0, vpScore);
  }
  const score = viewportResults.length > 0 ? Math.round(totalScore / viewportResults.length) : 0;

  if (score >= 90) {
    onProgress("pass", `  ✓ Responsive score: ${score}/100`);
  } else if (score >= 60) {
    onProgress("warn", `  ⚠ Responsive score: ${score}/100`);
  } else {
    onProgress("fail", `  ✗ Responsive score: ${score}/100`);
  }

  onProgress("done", `Responsive audit complete — ${viewportResults.length} viewports tested`);

  return { viewports: viewportResults, score };
}

export async function testViewport(
  page: any,
  url: string,
  width: number,
  height: number,
  label: string,
): Promise<ViewportResult> {
  // Set viewport
  await page.setViewportSize({ width, height });

  // Navigate and wait for load
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });

  // Take screenshot
  const screenshotDir = join(process.cwd(), ".inspect", "screenshots");
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  const sanitizedLabel = label.replace(/\s+/g, "-").toLowerCase();
  const timestamp = Date.now();
  const screenshotPath = join(screenshotDir, `responsive-${sanitizedLabel}-${timestamp}.png`);

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const isMobile = width < MOBILE_BREAKPOINT;
  const issues: ResponsiveIssue[] = [];

  // Run all checks
  const overflowIssues = await checkHorizontalOverflow(page);
  issues.push(...overflowIssues);

  const touchTargetIssues = await checkTouchTargets(page, isMobile);
  issues.push(...touchTargetIssues);

  const fontIssues = await checkFontReadability(page, isMobile);
  issues.push(...fontIssues);

  const imageIssues = await checkImageScaling(page);
  issues.push(...imageIssues);

  const stickyIssues = await checkStickyElements(page);
  issues.push(...stickyIssues);

  // Test mobile menu on mobile viewports
  let mobileMenuWorks: boolean | undefined;
  if (isMobile) {
    mobileMenuWorks = await testMobileMenu(page);
  }

  return {
    width,
    height,
    label,
    screenshot: screenshotPath,
    issues,
    mobileMenuWorks,
    orientation: height > width ? "portrait" : "landscape",
  };
}

export async function checkHorizontalOverflow(page: any): Promise<ResponsiveIssue[]> {
  const issues: ResponsiveIssue[] = [];

  const overflowData = await safeEvaluate<{
    hasOverflow: boolean;
    scrollWidth: number;
    docWidth: number;
    overflowingElements: Array<{
      tag: string;
      id: string | null;
      className: string | null;
      right: number;
      docWidth: number;
    }>;
  }>(page, `
    (() => {
      const docWidth = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const hasOverflow = scrollWidth > docWidth;

      const overflowingElements = [];
      if (hasOverflow) {
        const children = Array.from(document.body.children);
        for (const child of children) {
          const rect = child.getBoundingClientRect();
          if (rect.right > docWidth || rect.left < 0) {
            overflowingElements.push({
              tag: child.tagName.toLowerCase(),
              id: child.id || null,
              className: (child.className && typeof child.className === "string")
                ? child.className.slice(0, 60)
                : null,
              right: Math.round(rect.right),
              docWidth,
            });
          }
        }
      }

      return { hasOverflow, scrollWidth, docWidth, overflowingElements };
    })()
  `, { hasOverflow: false, scrollWidth: 0, docWidth: 0, overflowingElements: [] });

  if (overflowData.hasOverflow) {
    if (overflowData.overflowingElements.length === 0) {
      issues.push({
        type: "overflow",
        description: `Page has horizontal overflow (scrollWidth ${overflowData.scrollWidth}px > viewportWidth ${overflowData.docWidth}px)`,
        severity: "serious",
      });
    } else {
      for (const el of overflowData.overflowingElements) {
        const identifier = el.id
          ? `#${el.id}`
          : el.className
            ? `${el.tag}.${el.className.split(/\s+/)[0]}`
            : el.tag;
        issues.push({
          type: "overflow",
          description: `Element <${identifier}> overflows viewport (right edge at ${el.right}px, viewport is ${el.docWidth}px)`,
          element: identifier,
          severity: "serious",
        });
      }
    }
  }

  return issues;
}

export async function checkTouchTargets(page: any, isMobile: boolean): Promise<ResponsiveIssue[]> {
  if (!isMobile) {
    return [];
  }

  const issues: ResponsiveIssue[] = [];

  const smallTargets = await safeEvaluate<Array<{
    tag: string;
    text: string;
    width: number;
    height: number;
    selector: string;
  }>>(page, `
    (() => {
      const clickable = Array.from(document.querySelectorAll(
        'a, button, input, [role="button"], [onclick]'
      ));
      const small = [];
      for (const el of clickable) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.width < 44 || rect.height < 44) {
          small.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || "").trim().slice(0, 30),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            selector: el.id
              ? "#" + el.id
              : el.className && typeof el.className === "string"
                ? el.tagName.toLowerCase() + "." + el.className.split(/\\s+/)[0]
                : el.tagName.toLowerCase(),
          });
          if (small.length >= 10) break;
        }
      }
      return small;
    })()
  `, []);

  for (const target of smallTargets) {
    issues.push({
      type: "touch-target",
      description: `Touch target too small: <${target.selector}> "${target.text}" is ${target.width}×${target.height}px (minimum 44×44px)`,
      element: target.selector,
      severity: "moderate",
    });
  }

  return issues;
}

export async function checkFontReadability(page: any, isMobile: boolean): Promise<ResponsiveIssue[]> {
  if (!isMobile) {
    return [];
  }

  const issues: ResponsiveIssue[] = [];
  const minFontSize = 16;

  const smallFonts = await safeEvaluate<Array<{
    tag: string;
    text: string;
    fontSize: number;
    selector: string;
  }>>(page, `
    (() => {
      const textElements = Array.from(document.querySelectorAll("p, span, a, li, td, label"));
      const small = [];
      for (const el of textElements) {
        const text = (el.textContent || "").trim();
        if (!text || text.length < 2) continue;
        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        if (fontSize < ${minFontSize}) {
          small.push({
            tag: el.tagName.toLowerCase(),
            text: text.slice(0, 30),
            fontSize: Math.round(fontSize * 10) / 10,
            selector: el.id
              ? "#" + el.id
              : el.className && typeof el.className === "string"
                ? el.tagName.toLowerCase() + "." + el.className.split(/\\s+/)[0]
                : el.tagName.toLowerCase(),
          });
          if (small.length >= 10) break;
        }
      }
      return small;
    })()
  `, []);

  for (const font of smallFonts) {
    issues.push({
      type: "font-size",
      description: `Font too small on mobile: <${font.selector}> "${font.text}" is ${font.fontSize}px (minimum ${minFontSize}px)`,
      element: font.selector,
      severity: "moderate",
    });
  }

  return issues;
}

export async function checkImageScaling(page: any): Promise<ResponsiveIssue[]> {
  const issues: ResponsiveIssue[] = [];

  const imageData = await safeEvaluate<Array<{
    src: string;
    displayWidth: number;
    displayHeight: number;
    naturalWidth: number;
    naturalHeight: number;
    oversized: boolean;
    overflows: boolean;
    distorted: boolean;
  }>>(page, `
    (() => {
      const images = Array.from(document.querySelectorAll("img"));
      const problems = [];
      for (const img of images) {
        if (!img.complete || img.naturalWidth === 0) continue;

        const rect = img.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const displayWidth = rect.width;
        const displayHeight = rect.height;
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        const src = (img.src || "").slice(0, 80);

        // Check if image is much larger than displayed (unoptimized)
        const oversized = naturalWidth > displayWidth * 2;

        // Check if image overflows its container
        const parent = img.parentElement;
        let overflows = false;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          overflows = rect.right > parentRect.right + 1 || rect.bottom > parentRect.bottom + 1;
        }

        // Check if image is distorted (aspect ratio mismatch)
        const naturalRatio = naturalWidth / naturalHeight;
        const displayRatio = displayWidth / displayHeight;
        const distorted = Math.abs(naturalRatio - displayRatio) > 0.1;

        if (oversized || overflows || distorted) {
          problems.push({ src, displayWidth: Math.round(displayWidth), displayHeight: Math.round(displayHeight), naturalWidth, naturalHeight, oversized, overflows, distorted });
        }
      }
      return problems;
    })()
  `, []);

  for (const img of imageData) {
    if (img.oversized) {
      issues.push({
        type: "image-scale",
        description: `Unoptimized image: ${img.src} is ${img.naturalWidth}×${img.naturalHeight}px but displayed at ${img.displayWidth}×${img.displayHeight}px`,
        element: `img[src="${img.src}"]`,
        severity: "minor",
      });
    }

    if (img.overflows) {
      issues.push({
        type: "image-scale",
        description: `Image overflows container: ${img.src} (${img.displayWidth}×${img.displayHeight}px)`,
        element: `img[src="${img.src}"]`,
        severity: "serious",
      });
    }

    if (img.distorted) {
      const naturalRatio = (img.naturalWidth / img.naturalHeight).toFixed(2);
      const displayRatio = (img.displayWidth / img.displayHeight).toFixed(2);
      issues.push({
        type: "image-scale",
        description: `Distorted image: ${img.src} (natural ratio ${naturalRatio}, displayed ratio ${displayRatio})`,
        element: `img[src="${img.src}"]`,
        severity: "moderate",
      });
    }
  }

  return issues;
}

export async function checkStickyElements(page: any): Promise<ResponsiveIssue[]> {
  const issues: ResponsiveIssue[] = [];

  // Find sticky/fixed elements before scrolling
  const stickyElements = await safeEvaluate<Array<{
    tag: string;
    id: string | null;
    className: string | null;
    position: string;
    top: number;
    left: number;
    width: number;
    height: number;
  }>>(page, `
    (() => {
      const all = Array.from(document.querySelectorAll("*"));
      const sticky = [];
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.position === "sticky" || style.position === "fixed") {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          sticky.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: (el.className && typeof el.className === "string") ? el.className.slice(0, 60) : null,
            position: style.position,
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
      return sticky;
    })()
  `, []);

  if (stickyElements.length === 0) {
    return issues;
  }

  // Scroll down to test sticky behavior
  await page.evaluate(`window.scrollTo(0, 500)`);
  // Brief wait for scroll to settle
  await page.waitForTimeout(300);

  // Check sticky elements after scrolling
  const afterScroll = await safeEvaluate<Array<{
    tag: string;
    id: string | null;
    className: string | null;
    position: string;
    visible: boolean;
    overlapRatio: number;
  }>>(page, `
    (() => {
      const all = Array.from(document.querySelectorAll("*"));
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const sticky = [];
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.position === "sticky" || style.position === "fixed") {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;

          // Check if it's visible in viewport
          const visible = rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0;

          // Check if it overlaps a large portion of the viewport
          const overlapArea = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)) *
                              Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
          const viewportArea = viewportWidth * viewportHeight;
          const overlapRatio = overlapArea / viewportArea;

          sticky.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: (el.className && typeof el.className === "string") ? el.className.slice(0, 60) : null,
            position: style.position,
            visible,
            overlapRatio: Math.round(overlapRatio * 100),
          });
        }
      }
      return sticky;
    })()
  `, []);

  // Scroll back to top
  await page.evaluate(`window.scrollTo(0, 0)`);

  for (const el of afterScroll) {
    const identifier = el.id
      ? `#${el.id}`
      : el.className
        ? `${el.tag}.${el.className.split(/\s+/)[0]}`
        : el.tag;

    // If a sticky/fixed element takes up more than 30% of the viewport, flag it
    if (el.overlapRatio > 30) {
      issues.push({
        type: "sticky",
        description: `Fixed/sticky element <${identifier}> covers ${el.overlapRatio}% of viewport`,
        element: identifier,
        severity: "serious",
      });
    }

    // If a sticky element is not visible after scroll, it may be broken
    if (el.position === "sticky" && !el.visible) {
      issues.push({
        type: "sticky",
        description: `Sticky element <${identifier}> is not visible after scroll — may be broken`,
        element: identifier,
        severity: "moderate",
      });
    }
  }

  return issues;
}

export async function testMobileMenu(page: any): Promise<boolean | undefined> {
  // Look for common hamburger menu selectors
  const menuButton = await safeEvaluate<{ found: boolean; selector: string | null }>(page, `
    (() => {
      const selectors = [
        '[aria-label*="menu" i]',
        '[aria-label*="Menu" i]',
        '[aria-label*="navigation" i]',
        '.hamburger',
        '.nav-toggle',
        '.menu-toggle',
        '.navbar-toggler',
        '.mobile-menu-button',
        '[data-toggle="collapse"]',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          return { found: true, selector: sel };
        }
      }

      // Check for buttons containing hamburger character or three-line icon
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const btn of buttons) {
        const text = (btn.textContent || "").trim();
        const html = btn.innerHTML || "";
        if (text === "☰" || text === "≡" || html.includes("bar") || html.includes("hamburger") || html.includes("menu-icon")) {
          return { found: true, selector: "button:hamburger" };
        }
      }

      return { found: false, selector: null };
    })()
  `, { found: false, selector: null });

  if (!menuButton.found || !menuButton.selector) {
    return undefined;
  }

  try {
    // Click the menu button
    if (menuButton.selector === "button:hamburger") {
      // Use evaluate to find and click the hamburger button
      await safeEvaluate<boolean>(page, `
        (() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          for (const btn of buttons) {
            const text = (btn.textContent || "").trim();
            const html = btn.innerHTML || "";
            if (text === "☰" || text === "≡" || html.includes("bar") || html.includes("hamburger") || html.includes("menu-icon")) {
              btn.click();
              return true;
            }
          }
          return false;
        })()
      `, false);
    } else {
      await page.click(menuButton.selector, { timeout: 3000 });
    }

    // Wait for menu animation
    await page.waitForTimeout(500);

    // Check if a navigation menu appeared
    const menuVisible = await safeEvaluate<{ visible: boolean; linkCount: number }>(page, `
      (() => {
        const navSelectors = [
          "nav",
          '[role="navigation"]',
          ".nav-menu",
          ".mobile-menu",
          ".navbar-collapse",
          ".menu-items",
          ".dropdown-menu",
          ".nav-links",
        ];

        for (const sel of navSelectors) {
          const els = Array.from(document.querySelectorAll(sel));
          for (const el of els) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const isVisible = style.display !== "none"
              && style.visibility !== "hidden"
              && parseFloat(style.opacity) > 0
              && rect.height > 0;
            if (isVisible) {
              // Check for menu items inside
              const links = el.querySelectorAll("a");
              if (links.length > 0) {
                return { visible: true, linkCount: links.length };
              }
            }
          }
        }

        return { visible: false, linkCount: 0 };
      })()
    `, { visible: false, linkCount: 0 });

    if (!menuVisible.visible) {
      return false;
    }

    // Try clicking a menu item
    const clickedItem = await safeEvaluate<boolean>(page, `
      (() => {
        const navSelectors = [
          "nav a",
          '[role="navigation"] a',
          ".nav-menu a",
          ".mobile-menu a",
          ".navbar-collapse a",
          ".menu-items a",
          ".nav-links a",
        ];

        for (const sel of navSelectors) {
          const links = Array.from(document.querySelectorAll(sel));
          for (const link of links) {
            const style = window.getComputedStyle(link);
            const rect = link.getBoundingClientRect();
            if (style.display !== "none" && rect.height > 0) {
              link.click();
              return true;
            }
          }
        }
        return false;
      })()
    `, false);

    return clickedItem;
  } catch {
    return false;
  }
}
