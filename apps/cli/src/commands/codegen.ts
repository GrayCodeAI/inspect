import type { Command } from "commander";
import chalk from "chalk";

interface CodegenOptions {
  output?: string;
  target?: string;
  device?: string;
  viewport?: string;
  browser?: string;
}

interface RecordedAction {
  type: "navigate" | "click" | "fill" | "select" | "hover" | "press" | "scroll";
  selector?: string;
  value?: string;
  url?: string;
  timestamp: number;
}

async function runCodegen(url: string | undefined, options: CodegenOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Codegen — Record & Generate Tests\n"));
  console.log(chalk.dim("Actions will be recorded. Close the browser to generate code.\n"));

  const { BrowserManager } = await import("@inspect/browser");
  const browserMgr = new BrowserManager();

  let viewport = { width: 1280, height: 720 };
  if (options.viewport) {
    const [w, h] = options.viewport.split(/[x,]/).map(s => parseInt(s.trim(), 10));
    if (w && h) viewport = { width: w, height: h };
  }
  if (options.device) {
    const { DEVICE_PRESETS } = await import("@inspect/shared");
    const preset = (DEVICE_PRESETS as Record<string, any>)[options.device];
    if (preset) viewport = { width: preset.width, height: preset.height };
  }

  await browserMgr.launchBrowser({ headless: false, viewport } as any);
  const page = await browserMgr.newPage();

  const actions: RecordedAction[] = [];

  if (url) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    actions.push({ type: "navigate", url, timestamp: Date.now() });
    console.log(chalk.dim(`  → navigate: ${url}`));
  }

  // Inject recording script into page
  await page.evaluate(`
    (function() {
      if (window.__inspectRecording) return;
      window.__inspectRecording = true;

      const actions = [];
      window.__inspectActions = actions;

      // Record clicks
      document.addEventListener('click', function(e) {
        const el = e.target;
        const selector = getSelector(el);
        actions.push({ type: 'click', selector: selector, timestamp: Date.now() });
      }, true);

      // Record input changes
      document.addEventListener('input', function(e) {
        const el = e.target;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          const selector = getSelector(el);
          actions.push({ type: 'fill', selector: selector, value: el.value, timestamp: Date.now() });
        }
      }, true);

      // Record select changes
      document.addEventListener('change', function(e) {
        const el = e.target;
        if (el.tagName === 'SELECT') {
          const selector = getSelector(el);
          actions.push({ type: 'select', selector: selector, value: el.value, timestamp: Date.now() });
        }
      }, true);

      // Record keyboard presses on non-input elements
      document.addEventListener('keydown', function(e) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          if (['Enter', 'Escape', 'Tab', 'Backspace'].includes(e.key)) {
            actions.push({ type: 'press', value: e.key, timestamp: Date.now() });
          }
        }
      }, true);

      function getSelector(el) {
        if (el.id) return '#' + el.id;
        if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
        if (el.getAttribute('name')) return el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]';
        if (el.getAttribute('aria-label')) return '[aria-label="' + el.getAttribute('aria-label') + '"]';

        // Role-based
        const role = el.getAttribute('role');
        if (role) {
          const text = el.textContent?.trim().slice(0, 30);
          if (text) return role + ':has-text("' + text + '")';
          return '[role="' + role + '"]';
        }

        // Text content for buttons/links
        if (el.tagName === 'BUTTON' || el.tagName === 'A') {
          const text = el.textContent?.trim().slice(0, 30);
          if (text) return el.tagName.toLowerCase() + ':has-text("' + text + '")';
        }

        // CSS path fallback
        const path = [];
        let current = el;
        while (current && current !== document.body) {
          let seg = current.tagName.toLowerCase();
          if (current.className && typeof current.className === 'string') {
            const cls = current.className.trim().split(/\\s+/)[0];
            if (cls) seg += '.' + cls;
          }
          path.unshift(seg);
          current = current.parentElement;
          if (path.length >= 3) break;
        }
        return path.join(' > ');
      }
    })();
  `);

  // Track navigations
  page.on("framenavigated", (frame: any) => {
    if (frame === page.mainFrame()) {
      const navUrl = page.url();
      actions.push({ type: "navigate", url: navUrl, timestamp: Date.now() });
      console.log(chalk.dim(`  → navigate: ${navUrl}`));
      // Re-inject recording script after navigation
      page.evaluate(`
        if (!window.__inspectRecording) {
          // Script will be re-injected on next page load
        }
      `).catch(() => {});
    }
  });

  // Poll for recorded actions
  const pollInterval = setInterval(async () => {
    try {
      const pageActions = await page.evaluate(`window.__inspectActions || []`) as RecordedAction[];
      for (let i = actions.length; i < pageActions.length + actions.filter(a => a.type === "navigate").length; i++) {
        // Just display new actions
      }
      // Merge page actions into our list (avoiding duplicates of navigations we already track)
      const newActions = pageActions.filter((a: any) => a.type !== "navigate");
      if (newActions.length > actions.filter(a => a.type !== "navigate").length) {
        const added = newActions.slice(actions.filter(a => a.type !== "navigate").length);
        for (const a of added) {
          actions.push(a as RecordedAction);
          console.log(chalk.dim(`  → ${(a as RecordedAction).type}: ${(a as RecordedAction).selector ?? (a as RecordedAction).value ?? ""}`));
        }
      }
    } catch {
      // Page may be navigating
    }
  }, 500);

  // Wait for browser close
  await new Promise<void>((resolve) => {
    page.context().on("close", () => resolve());
    process.on("SIGINT", async () => {
      clearInterval(pollInterval);
      await browserMgr.closeBrowser();
      resolve();
    });
  });

  clearInterval(pollInterval);

  // Collect final actions from page
  try {
    const finalActions = await page.evaluate(`window.__inspectActions || []`) as RecordedAction[];
    const navActions = actions.filter(a => a.type === "navigate");
    const pageOnlyActions = finalActions.filter((a: any) => a.type !== "navigate");
    actions.length = 0;
    actions.push(...navActions);
    actions.push(...(pageOnlyActions as RecordedAction[]));
    // Sort by timestamp
    actions.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    // Browser already closed
  }

  if (actions.length === 0) {
    console.log(chalk.yellow("\nNo actions recorded."));
    return;
  }

  console.log(chalk.blue(`\n${actions.length} action(s) recorded.\n`));

  // Generate code
  const target = options.target ?? "yaml";
  const code = generateCode(actions, target, url);

  if (options.output) {
    const { writeFileSync, mkdirSync, existsSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    const dir = dirname(options.output);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(options.output, code, "utf-8");
    console.log(chalk.green(`Generated test saved: ${options.output}`));
  } else {
    console.log(chalk.dim("--- Generated Test ---\n"));
    console.log(code);
    console.log(chalk.dim("\n--- End ---"));
    console.log(chalk.dim('\nUse -o <file> to save to a file.'));
  }
}

function generateCode(actions: RecordedAction[], target: string, startUrl?: string): string {
  switch (target) {
    case "yaml": return generateYAML(actions, startUrl);
    case "typescript":
    case "ts": return generateTypeScript(actions, startUrl);
    case "json": return generateJSON(actions, startUrl);
    default: return generateYAML(actions, startUrl);
  }
}

function generateYAML(actions: RecordedAction[], startUrl?: string): string {
  const lines: string[] = [];
  lines.push(`name: Recorded test`);
  lines.push(`description: Auto-generated from codegen recording`);
  if (startUrl) lines.push(`url: ${startUrl}`);
  lines.push(`steps:`);

  for (const action of actions) {
    switch (action.type) {
      case "navigate":
        lines.push(`  - name: Navigate to page`);
        lines.push(`    action: navigate`);
        lines.push(`    url: ${action.url}`);
        break;
      case "click":
        lines.push(`  - name: Click ${action.selector}`);
        lines.push(`    action: click`);
        lines.push(`    selector: "${action.selector}"`);
        break;
      case "fill":
        lines.push(`  - name: Type in ${action.selector}`);
        lines.push(`    action: fill`);
        lines.push(`    selector: "${action.selector}"`);
        lines.push(`    value: "${action.value}"`);
        break;
      case "select":
        lines.push(`  - name: Select ${action.value} in ${action.selector}`);
        lines.push(`    action: select`);
        lines.push(`    selector: "${action.selector}"`);
        lines.push(`    value: "${action.value}"`);
        break;
      case "press":
        lines.push(`  - name: Press ${action.value}`);
        lines.push(`    action: press`);
        lines.push(`    value: "${action.value}"`);
        break;
    }
  }

  return lines.join("\n") + "\n";
}

function generateTypeScript(actions: RecordedAction[], startUrl?: string): string {
  const lines: string[] = [];
  lines.push(`import { test, expect } from "@playwright/test";`);
  lines.push(``);
  lines.push(`test("recorded test", async ({ page }) => {`);

  for (const action of actions) {
    switch (action.type) {
      case "navigate":
        lines.push(`  await page.goto("${action.url}");`);
        break;
      case "click":
        lines.push(`  await page.locator("${action.selector}").click();`);
        break;
      case "fill":
        lines.push(`  await page.locator("${action.selector}").fill("${action.value}");`);
        break;
      case "select":
        lines.push(`  await page.locator("${action.selector}").selectOption("${action.value}");`);
        break;
      case "press":
        lines.push(`  await page.keyboard.press("${action.value}");`);
        break;
    }
  }

  lines.push(`});`);
  return lines.join("\n") + "\n";
}

function generateJSON(actions: RecordedAction[], startUrl?: string): string {
  return JSON.stringify({
    name: "Recorded test",
    description: "Auto-generated from codegen recording",
    url: startUrl,
    steps: actions.map(a => ({
      name: `${a.type} ${a.selector ?? a.url ?? a.value ?? ""}`.trim(),
      action: a.type === "navigate" ? "goto" : a.type,
      ...(a.url ? { url: a.url } : {}),
      ...(a.selector ? { selector: a.selector } : {}),
      ...(a.value && a.type !== "navigate" ? { value: a.value } : {}),
    })),
  }, null, 2) + "\n";
}

export function registerCodegenCommand(program: Command): void {
  program
    .command("codegen")
    .description("Record browser actions and generate test code")
    .argument("[url]", "Starting URL")
    .option("-o, --output <file>", "Save generated test to file")
    .option("--target <format>", "Output format: yaml, typescript, json (default: yaml)", "yaml")
    .option("-d, --device <device>", "Emulate device preset")
    .option("--viewport <size>", "Viewport: WIDTHxHEIGHT")
    .option("-b, --browser <browser>", "Browser: chromium, firefox, webkit", "chromium")
    .addHelpText("after", `
Examples:
  $ inspect codegen https://myapp.com
  $ inspect codegen https://myapp.com -o tests/login.yaml
  $ inspect codegen https://myapp.com --target typescript -o tests/login.spec.ts
  $ inspect codegen https://myapp.com -d iphone-15
  $ inspect codegen --target json -o tests/flow.json
`)
    .action(async (url: string | undefined, opts: CodegenOptions) => {
      try {
        await runCodegen(url, opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
