import type { A11yReport, A11yIssue, KeyboardNavResult, ProgressCallback } from "./types.js";
import { safeEvaluate } from "./evaluate.js";

// ---------------------------------------------------------------------------
// axe-core injection and execution
// ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAxeCore(page: any, url: string): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  try {
    // Inject axe-core — try local node_modules first, then CDN fallback
    const alreadyLoaded = await page.evaluate("typeof window.axe !== 'undefined'") as boolean;
    if (!alreadyLoaded) {
      let injected = false;

      // Strategy 1: load from node_modules (works if axe-core is installed)
      try {
        const axePath = require.resolve("axe-core/axe.min.js");
        const { readFileSync } = await import("node:fs");
        const axeSource = readFileSync(axePath, "utf-8");
        await page.addScriptTag({ content: axeSource });
        injected = true;
      } catch {
        // axe-core not installed locally
      }

      // Strategy 2: CDN fallback
      if (!injected) {
        try {
          await page.addScriptTag({
            url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js",
          });
        } catch {
          // CDN blocked by CSP or network — axe-core unavailable
        }
      }

      // Wait for axe to be available (with short timeout)
      try {
        await page.waitForFunction("typeof window.axe !== 'undefined'", { timeout: 3000 });
      } catch {
        // axe-core not available — manual checks will still run
      }
    }

    // Run axe
    const results = await page.evaluate(`
      (async () => {
        try {
          const results = await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
            resultTypes: ["violations"],
          });
          return results.violations.map(v => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            tags: v.tags,
            nodes: v.nodes.slice(0, 5).map(n => ({
              html: n.html?.slice(0, 120),
              target: n.target?.[0],
              failureSummary: n.failureSummary?.slice(0, 200),
            })),
          }));
        } catch (e) {
          return [{ id: "axe-error", impact: "minor", description: e.message, help: "", nodes: [] }];
        }
      })()
    `) as Array<{
      id: string;
      impact: string;
      description: string;
      help: string;
      helpUrl?: string;
      tags?: string[];
      nodes: Array<{ html?: string; target?: string; failureSummary?: string }>;
    }>;

    for (const violation of results) {
      if (violation.id === "axe-error") continue;

      const severity = mapAxeSeverity(violation.impact);
      const wcag = extractWcag(violation.tags ?? []);

      for (const node of violation.nodes) {
        issues.push({
          severity,
          rule: violation.id,
          description: violation.help,
          element: node.html,
          page: url,
          wcag,
          fix: node.failureSummary,
        });
      }
    }
  } catch {
    // axe-core injection failed, fall back to manual checks
  }

  return issues;
}

function mapAxeSeverity(impact: string): "critical" | "serious" | "moderate" | "minor" {
  switch (impact) {
    case "critical": return "critical";
    case "serious": return "serious";
    case "moderate": return "moderate";
    default: return "minor";
  }
}

function extractWcag(tags: string[]): string | undefined {
  for (const tag of tags) {
    const match = tag.match(/wcag(\d)(\d)(\d)/);
    if (match) return `${match[1]}.${match[2]}.${match[3]}`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Manual accessibility checks (run always, augment axe results)
// ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkImagesAlt(page: any, url: string): Promise<A11yIssue[]> {
  const results = await safeEvaluate<Array<{ src: string; html: string }>>(page, `
    (() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs
        .filter(i => !i.getAttribute("alt") || i.getAttribute("alt").trim() === "")
        .filter(i => {
          const role = i.getAttribute("role");
          return role !== "presentation" && role !== "none";
        })
        .map(i => ({ src: i.src?.slice(0, 80) ?? "unknown", html: i.outerHTML.slice(0, 120) }));
    })()
  `, []);

  return results.map(img => ({
    severity: "serious" as const,
    rule: "image-alt",
    description: `Image missing alt text: ${img.src}`,
    element: img.html,
    page: url,
    wcag: "1.1.1",
    fix: "Add a descriptive alt attribute to the image",
  }));
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkFormLabels(page: any, url: string): Promise<A11yIssue[]> {
  const results = await safeEvaluate<Array<{ tag: string; type: string; name: string; id: string; html: string }>>(page, `
    (() => {
      const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
      return inputs.filter(el => {
        if (el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "reset" || el.type === "image") return false;
        const id = el.id;
        const ariaLabel = el.getAttribute("aria-label");
        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        const hasLabel = id ? document.querySelector('label[for="' + id + '"]') : false;
        const parentLabel = el.closest("label");
        const title = el.getAttribute("title");
        return !ariaLabel && !ariaLabelledBy && !hasLabel && !parentLabel && !title;
      }).map(el => ({
        tag: el.tagName,
        type: el.type || "",
        name: el.name || "",
        id: el.id || "",
        html: el.outerHTML.slice(0, 120),
      }));
    })()
  `, []);

  return results.map(input => ({
    severity: "serious" as const,
    rule: "label",
    description: `${input.tag} (type=${input.type}, name=${input.name}) has no accessible label`,
    element: input.html,
    page: url,
    wcag: "1.3.1",
    fix: "Associate a <label> element or add aria-label attribute",
  }));
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkHeadingHierarchy(page: any, url: string): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const headings = await safeEvaluate<Array<{ level: number; text: string; html: string }>>(page, `
    (() => {
      const hs = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      return hs.map(h => ({
        level: parseInt(h.tagName.slice(1)),
        text: h.textContent?.trim().slice(0, 60),
        html: h.outerHTML.slice(0, 120),
      }));
    })()
  `, []);

  const h1s = headings.filter(h => h.level === 1);
  if (h1s.length === 0) {
    issues.push({
      severity: "moderate",
      rule: "heading-h1",
      description: "Page has no H1 heading",
      page: url,
      wcag: "1.3.1",
      fix: "Add a single H1 heading that describes the page content",
    });
  } else if (h1s.length > 1) {
    issues.push({
      severity: "minor",
      rule: "heading-h1-multiple",
      description: `Page has ${h1s.length} H1 headings (recommended: 1)`,
      element: h1s[1].html,
      page: url,
      wcag: "1.3.1",
      fix: "Use only one H1 per page; use H2 for subsections",
    });
  }

  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      issues.push({
        severity: "moderate",
        rule: "heading-order",
        description: `Heading level skipped: H${headings[i - 1].level} "${headings[i - 1].text}" → H${headings[i].level} "${headings[i].text}"`,
        element: headings[i].html,
        page: url,
        wcag: "1.3.1",
        fix: `Use H${headings[i - 1].level + 1} instead of H${headings[i].level}`,
      });
      break;
    }
  }

  return issues;
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkColorContrast(page: any, url: string): Promise<A11yIssue[]> {
  const results = await safeEvaluate<Array<{ text: string; ratio: string; required: string; color: string; bgColor: string; html: string }>>(page, `
    (() => {
      const issues = [];

      function getLuminance(r, g, b) {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function parseColor(str) {
        const match = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        return null;
      }

      function getContrastRatio(fg, bg) {
        const l1 = getLuminance(...fg);
        const l2 = getLuminance(...bg);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      const els = document.querySelectorAll("p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, button");
      for (const el of Array.from(els).slice(0, 100)) {
        if (!el.textContent?.trim()) continue;
        if (el.offsetParent === null) continue; // hidden

        const style = window.getComputedStyle(el);
        const fgColor = parseColor(style.color);
        const bgColor = parseColor(style.backgroundColor);
        if (!fgColor || !bgColor) continue;

        // Skip if bg is transparent (we'd need to compute effective bg)
        if (style.backgroundColor === "rgba(0, 0, 0, 0)") continue;

        const ratio = getContrastRatio(fgColor, bgColor);
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = parseInt(style.fontWeight) || 400;
        const isLargeText = fontSize >= 18.66 || (fontSize >= 14 && fontWeight >= 700);
        const minRatio = isLargeText ? 3 : 4.5;

        if (ratio < minRatio) {
          issues.push({
            text: el.textContent.trim().slice(0, 40),
            ratio: ratio.toFixed(2),
            required: minRatio.toFixed(1),
            color: style.color,
            bgColor: style.backgroundColor,
            html: el.outerHTML.slice(0, 120),
          });
          if (issues.length >= 10) break;
        }
      }
      return issues;
    })()
  `, []);

  return results.map(r => ({
    severity: "serious" as const,
    rule: "color-contrast",
    description: `Low contrast (${r.ratio}:1, need ${r.required}:1): "${r.text}" — ${r.color} on ${r.bgColor}`,
    element: r.html,
    page: url,
    wcag: "1.4.3",
    fix: `Increase contrast ratio to at least ${r.required}:1`,
  }));
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkLangAttribute(page: any, url: string): Promise<A11yIssue[]> {
  const hasLang = await safeEvaluate<boolean>(page, `!!document.documentElement.getAttribute("lang")`, false);
  if (!hasLang) {
    return [{
      severity: "serious",
      rule: "html-lang",
      description: "HTML element missing lang attribute",
      page: url,
      wcag: "3.1.1",
      fix: 'Add lang attribute to <html> element, e.g., <html lang="en">',
    }];
  }

  const lang = await safeEvaluate<string>(page, `document.documentElement.getAttribute("lang")`, "");
  if (lang && !/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) {
    return [{
      severity: "moderate",
      rule: "html-lang-valid",
      description: `Invalid lang attribute value: "${lang}"`,
      page: url,
      wcag: "3.1.1",
      fix: "Use a valid BCP 47 language tag (e.g., 'en', 'en-US', 'fr')",
    }];
  }

  return [];
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkViewportMeta(page: any, url: string): Promise<A11yIssue[]> {
  const viewport = await safeEvaluate<string | null>(page, `
    (() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.getAttribute("content") : null;
    })()
  `, null);

  if (!viewport) {
    return [{
      severity: "serious",
      rule: "viewport",
      description: "Missing viewport meta tag",
      page: url,
      wcag: "1.4.10",
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
    }];
  }

  const issues: A11yIssue[] = [];
  if (viewport.includes("user-scalable=no") || viewport.includes("user-scalable=0")) {
    issues.push({
      severity: "critical",
      rule: "viewport-user-scalable",
      description: "Viewport prevents user from zooming (user-scalable=no)",
      page: url,
      wcag: "1.4.4",
      fix: "Remove user-scalable=no from viewport meta tag",
    });
  }

  const maxScaleMatch = viewport.match(/maximum-scale=(\d+(\.\d+)?)/);
  if (maxScaleMatch && parseFloat(maxScaleMatch[1]) < 2) {
    issues.push({
      severity: "serious",
      rule: "viewport-max-scale",
      description: `Viewport limits zoom to ${maxScaleMatch[1]}x (should allow at least 2x)`,
      page: url,
      wcag: "1.4.4",
      fix: "Set maximum-scale to at least 2.0 or remove the restriction",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Keyboard navigation testing
// ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function testKeyboardNavigation(page: any, _url: string): Promise<KeyboardNavResult> {
  // Count total focusable elements
  const focusableCount = await safeEvaluate<number>(page, `
    document.querySelectorAll('a[href], button, input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])').length
  `, 0);

  // Tab through elements and track focus
  const focusOrder: string[] = [];
  const traps: string[] = [];
  const missingIndicators: string[] = [];

  const maxTabs = Math.min(focusableCount + 5, 30);
  let lastFocused = "";
  let stuckCount = 0;

  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);

    const focused = await safeEvaluate<{ tag: string; text: string; role: string; hasFocusIndicator: boolean; selector: string } | null>(page, `
      (() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const tag = el.tagName.toLowerCase();
        const text = el.textContent?.trim().slice(0, 30) || el.getAttribute("aria-label") || el.getAttribute("name") || "";
        const role = el.getAttribute("role") || "";

        // Check for focus indicator
        const style = window.getComputedStyle(el);
        const outline = style.outlineStyle;
        const boxShadow = style.boxShadow;
        const hasFocusIndicator = (outline && outline !== "none") || (boxShadow && boxShadow !== "none");

        return { tag, text, role, hasFocusIndicator, selector: tag + (el.id ? "#" + el.id : "") + (el.className ? "." + el.className.split(" ")[0] : "") };
      })()
    `, null);

    if (!focused) continue;

    const label = `${focused.tag}${focused.text ? `: "${focused.text}"` : ""}`;

    if (label === lastFocused) {
      stuckCount++;
      if (stuckCount >= 3) {
        traps.push(label);
        break; // Focus trap detected
      }
    } else {
      stuckCount = 0;
    }

    lastFocused = label;
    focusOrder.push(label);

    if (!focused.hasFocusIndicator) {
      missingIndicators.push(label);
    }
  }

  return {
    totalFocusable: focusableCount,
    reachable: focusOrder.length,
    focusOrder: focusOrder.slice(0, 20),
    traps,
    missingIndicators: missingIndicators.slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Skip navigation check
// ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkSkipNavigation(page: any): Promise<boolean> {
  return safeEvaluate<boolean>(page, `
    (() => {
      // Check for skip-to-content links
      const links = Array.from(document.querySelectorAll("a"));
      return links.some(a => {
        const text = (a.textContent || "").toLowerCase().trim();
        const href = a.getAttribute("href") || "";
        return (text.includes("skip") && (text.includes("content") || text.includes("main") || text.includes("nav"))) ||
               (href.startsWith("#") && (href.includes("content") || href.includes("main")));
      });
    })()
  `, false);
}

// ---------------------------------------------------------------------------
// Focus indicator check
// ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkFocusIndicators(page: any): Promise<boolean> {
  return safeEvaluate<boolean>(page, `
    (() => {
      // Check a sample of interactive elements for focus styles
      const elements = Array.from(document.querySelectorAll("a[href], button, input, textarea, select")).slice(0, 10);
      let withIndicator = 0;

      for (const el of elements) {
        el.focus();
        const style = window.getComputedStyle(el);
        const outline = style.outlineStyle;
        const boxShadow = style.boxShadow;
        if ((outline && outline !== "none") || (boxShadow && boxShadow !== "none")) {
          withIndicator++;
        }
      }

      // If >70% have focus indicators, consider it good
      return elements.length === 0 || (withIndicator / elements.length) > 0.7;
    })()
  `, false);
}

// ---------------------------------------------------------------------------
// ARIA validation
// ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAriaUsage(page: any, _url: string): Promise<A11yIssue[]> {
  return safeEvaluate<A11yIssue[]>(page, `
    (() => {
      const issues = [];

      // Check for invalid ARIA roles
      const validRoles = new Set([
        "alert", "alertdialog", "application", "article", "banner", "button",
        "cell", "checkbox", "columnheader", "combobox", "complementary",
        "contentinfo", "definition", "dialog", "directory", "document",
        "feed", "figure", "form", "grid", "gridcell", "group", "heading",
        "img", "link", "list", "listbox", "listitem", "log", "main",
        "marquee", "math", "menu", "menubar", "menuitem", "menuitemcheckbox",
        "menuitemradio", "navigation", "none", "note", "option", "presentation",
        "progressbar", "radio", "radiogroup", "region", "row", "rowgroup",
        "rowheader", "scrollbar", "search", "searchbox", "separator",
        "slider", "spinbutton", "status", "switch", "tab", "table",
        "tablist", "tabpanel", "term", "textbox", "timer", "toolbar",
        "tooltip", "tree", "treegrid", "treeitem",
      ]);

      const roled = document.querySelectorAll("[role]");
      for (const el of roled) {
        const role = el.getAttribute("role");
        if (role && !validRoles.has(role)) {
          issues.push({
            severity: "moderate",
            rule: "aria-valid-role",
            description: "Invalid ARIA role: " + role,
            element: el.outerHTML.slice(0, 120),
          });
        }
      }

      // Check for aria-labelledby pointing to non-existent elements
      const labelledBy = document.querySelectorAll("[aria-labelledby]");
      for (const el of labelledBy) {
        const ids = (el.getAttribute("aria-labelledby") || "").split(/\\s+/);
        for (const id of ids) {
          if (id && !document.getElementById(id)) {
            issues.push({
              severity: "serious",
              rule: "aria-labelledby-ref",
              description: "aria-labelledby references non-existent id: " + id,
              element: el.outerHTML.slice(0, 120),
            });
          }
        }
      }

      // Check for aria-describedby pointing to non-existent elements
      const describedBy = document.querySelectorAll("[aria-describedby]");
      for (const el of describedBy) {
        const ids = (el.getAttribute("aria-describedby") || "").split(/\\s+/);
        for (const id of ids) {
          if (id && !document.getElementById(id)) {
            issues.push({
              severity: "moderate",
              rule: "aria-describedby-ref",
              description: "aria-describedby references non-existent id: " + id,
              element: el.outerHTML.slice(0, 120),
            });
          }
        }
      }

      return issues.slice(0, 20);
    })()
  `, []);
}

// ---------------------------------------------------------------------------
// Main accessibility checker
// ---------------------------------------------------------------------------

export async function checkAccessibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  url: string,
  onProgress: ProgressCallback,
): Promise<A11yReport> {
  onProgress("info", "Running accessibility audit...");

  const allIssues: A11yIssue[] = [];

  // 1. Try axe-core (comprehensive automated checks)
  onProgress("info", "  Running axe-core WCAG audit...");
  const axeIssues = await runAxeCore(page, url);
  allIssues.push(...axeIssues);
  if (axeIssues.length > 0) {
    onProgress("info", `  axe-core found ${axeIssues.length} issues`);
  }

  // 2. Manual checks (supplement axe-core or run standalone)
  const existingRules = new Set(axeIssues.map(i => i.rule));

  // Only run manual checks for rules axe-core didn't cover
  if (!existingRules.has("image-alt")) {
    const imgIssues = await checkImagesAlt(page, url);
    allIssues.push(...imgIssues);
  }

  if (!existingRules.has("label")) {
    const labelIssues = await checkFormLabels(page, url);
    allIssues.push(...labelIssues);
  }

  if (!existingRules.has("heading-order")) {
    const headingIssues = await checkHeadingHierarchy(page, url);
    allIssues.push(...headingIssues);
  }

  if (!existingRules.has("color-contrast")) {
    const contrastIssues = await checkColorContrast(page, url);
    allIssues.push(...contrastIssues);
  }

  const langIssues = await checkLangAttribute(page, url);
  allIssues.push(...langIssues);

  const viewportIssues = await checkViewportMeta(page, url);
  allIssues.push(...viewportIssues);

  // 3. ARIA validation
  onProgress("info", "  Checking ARIA usage...");
  const ariaIssues = await checkAriaUsage(page, url);
  allIssues.push(...ariaIssues.map(i => ({ ...i, page: url })));

  // 4. Keyboard navigation
  onProgress("info", "  Testing keyboard navigation...");
  const keyboardNav = await testKeyboardNavigation(page, url);

  if (keyboardNav.traps.length > 0) {
    allIssues.push({
      severity: "critical",
      rule: "keyboard-trap",
      description: `Focus trap detected: ${keyboardNav.traps[0]}`,
      page: url,
      wcag: "2.1.2",
      fix: "Ensure all interactive elements can be reached and left using the keyboard",
    });
  }

  if (keyboardNav.totalFocusable > 0 && keyboardNav.reachable < keyboardNav.totalFocusable * 0.5) {
    allIssues.push({
      severity: "serious",
      rule: "keyboard-access",
      description: `Only ${keyboardNav.reachable}/${keyboardNav.totalFocusable} focusable elements reachable via Tab`,
      page: url,
      wcag: "2.1.1",
      fix: "Ensure all interactive elements are keyboard accessible",
    });
  }

  // 5. Skip navigation
  const hasSkipNav = await checkSkipNavigation(page);
  if (!hasSkipNav) {
    allIssues.push({
      severity: "moderate",
      rule: "skip-navigation",
      description: "No skip navigation link found",
      page: url,
      wcag: "2.4.1",
      fix: 'Add a "Skip to main content" link as the first focusable element',
    });
  }

  // 6. Focus indicators
  const hasFocusIndicators = await checkFocusIndicators(page);

  // Calculate score
  const criticalCount = allIssues.filter(i => i.severity === "critical").length;
  const seriousCount = allIssues.filter(i => i.severity === "serious").length;
  const moderateCount = allIssues.filter(i => i.severity === "moderate").length;
  const minorCount = allIssues.filter(i => i.severity === "minor").length;
  const score = Math.max(0, Math.min(100,
    100 - criticalCount * 15 - seriousCount * 8 - moderateCount * 4 - minorCount * 1,
  ));

  const report: A11yReport = {
    url,
    issues: allIssues,
    score,
    keyboardNav,
    ariaValid: ariaIssues.length === 0,
    hasSkipNav,
    hasFocusIndicators,
  };

  // Report summary
  if (allIssues.length === 0) {
    onProgress("pass", `  ✓ Accessibility: No issues found (100/100)`);
  } else {
    onProgress("warn", `  ⚠ Accessibility: ${allIssues.length} issues (${score}/100)`);
    if (criticalCount > 0) onProgress("fail", `    ${criticalCount} critical`);
    if (seriousCount > 0) onProgress("warn", `    ${seriousCount} serious`);
    if (moderateCount > 0) onProgress("warn", `    ${moderateCount} moderate`);
    if (minorCount > 0) onProgress("info", `    ${minorCount} minor`);

    // Show top 5 issues
    for (const issue of allIssues.slice(0, 5)) {
      onProgress("warn", `    [${issue.severity}] ${issue.rule}: ${issue.description.slice(0, 80)}`);
    }
  }

  // Keyboard nav summary
  if (keyboardNav.traps.length > 0) {
    onProgress("fail", `Keyboard: Focus trap detected`);
  } else if (keyboardNav.missingIndicators.length > 0) {
    onProgress("warn", `  ⚠ Keyboard: ${keyboardNav.missingIndicators.length} elements missing focus indicators`);
  } else {
    onProgress("pass", `  ✓ Keyboard: ${keyboardNav.reachable} elements reachable, no traps`);
  }

  return report;
}
