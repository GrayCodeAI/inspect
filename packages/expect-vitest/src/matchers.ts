// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-vitest - Custom Matchers
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Locator } from "@inspect/browser";
import { expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

/** Extend Vitest's expect with Inspect matchers */
export function extendExpect(_vitestExpect: typeof expect) {
  expect.extend({
    // Element visibility
    async toBeVisible(received: Locator | Page, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const visible = await element.isVisible().catch(() => false);

      return {
        pass: visible,
        message: () => `expected element to be visible`,
        actual: visible,
        expected: true,
      };
    },

    async toBeHidden(received: Locator | Page, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const hidden = await element.isHidden().catch(() => true);

      return {
        pass: hidden,
        message: () => `expected element to be hidden`,
        actual: hidden,
        expected: true,
      };
    },

    // Element state
    async toBeEnabled(received: Locator | Page, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const enabled = await element.isEnabled().catch(() => false);

      return {
        pass: enabled,
        message: () => `expected element to be enabled`,
        actual: enabled,
        expected: true,
      };
    },

    async toBeDisabled(received: Locator | Page, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const disabled = await element.isDisabled().catch(() => false);

      return {
        pass: disabled,
        message: () => `expected element to be disabled`,
        actual: disabled,
        expected: true,
      };
    },

    // Text content
    async toHaveText(received: Locator | Page, expected: string | RegExp, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const text = await element.textContent().catch(() => "");

      const pass = typeof expected === "string" ? text === expected : expected.test(text ?? "");

      return {
        pass,
        message: () => `expected element to have text "${expected}", got "${text}"`,
        actual: text,
        expected,
      };
    },

    async toContainText(received: Locator | Page, expected: string | RegExp, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const text = await element.textContent().catch(() => "");

      const pass =
        typeof expected === "string" ? text?.includes(expected) : expected.test(text ?? "");

      return {
        pass: pass ?? false,
        message: () => `expected element to contain text "${expected}", got "${text}"`,
        actual: text,
        expected,
      };
    },

    // Input value
    async toHaveValue(received: Locator | Page, expected: string | RegExp, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const value = await element.inputValue().catch(() => "");

      const pass = typeof expected === "string" ? value === expected : expected.test(value);

      return {
        pass,
        message: () => `expected element to have value "${expected}", got "${value}"`,
        actual: value,
        expected,
      };
    },

    // URL
    async toHaveURL(received: Page, expected: string | RegExp) {
      const url = received.url();

      const pass = typeof expected === "string" ? url === expected : expected.test(url);

      return {
        pass,
        message: () => `expected URL to be "${expected}", got "${url}"`,
        actual: url,
        expected,
      };
    },

    // Title
    async toHaveTitle(received: Page, expected: string | RegExp) {
      const title = await received.title();

      const pass = typeof expected === "string" ? title === expected : expected.test(title);

      return {
        pass,
        message: () => `expected title to be "${expected}", got "${title}"`,
        actual: title,
        expected,
      };
    },

    // Element count
    async toHaveCount(received: Page, expected: number, selector?: string) {
      const locator = selector ? received.locator(selector) : received.locator("*");
      const count = await locator.count();

      return {
        pass: count === expected,
        message: () => `expected ${expected} elements, got ${count}`,
        actual: count,
        expected,
      };
    },

    // Attributes
    async toHaveAttribute(
      received: Locator | Page,
      name: string,
      expected?: string | RegExp,
      selector?: string,
    ) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const value = await element.getAttribute(name).catch(() => null);

      let pass: boolean;
      if (expected === undefined) {
        pass = value !== null;
      } else if (typeof expected === "string") {
        pass = value === expected;
      } else {
        pass = expected.test(value ?? "");
      }

      return {
        pass,
        message: () =>
          expected === undefined
            ? `expected element to have attribute "${name}"`
            : `expected attribute "${name}" to be "${expected}", got "${value}"`,
        actual: value,
        expected,
      };
    },

    // CSS classes
    async toHaveClass(received: Locator | Page, expected: string | string[], selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const classValue = await element.evaluate((el: HTMLElement) => el.className).catch(() => "");

      const classes = classValue.split(" ").filter(Boolean);
      const expectedClasses = Array.isArray(expected) ? expected : [expected];

      const pass = expectedClasses.every((cls) => classes.includes(cls));

      return {
        pass,
        message: () => `expected element to have classes "${expectedClasses.join(", ")}"`,
        actual: classes,
        expected: expectedClasses,
      };
    },

    // Checkbox state
    async toBeChecked(received: Locator | Page, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const checked = await element.isChecked().catch(() => false);

      return {
        pass: checked,
        message: () => `expected element to be checked`,
        actual: checked,
        expected: true,
      };
    },

    // Focus state
    async toBeFocused(received: Locator | Page, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const focused = await element
        .evaluate((el: Element) => el === document.activeElement)
        .catch(() => false);

      return {
        pass: focused,
        message: () => `expected element to be focused`,
        actual: focused,
        expected: true,
      };
    },

    // Natural language assertion
    async toSatisfy(received: Page, instruction: string) {
      const { createNLAct } = await import("@inspect/browser");

      const nl = createNLAct(received, {
        llm: async (messages) => {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages,
              temperature: 0.1,
            }),
          });
          const data = (await response.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          return data.choices[0]?.message?.content ?? "";
        },
        snapshot: async () => {
          const { AriaSnapshotBuilder } = await import("@inspect/browser");
          const builder = new AriaSnapshotBuilder();
          await builder.buildTree(received);
          return {
            text: builder.getFormattedTree(),
            url: received.url(),
            title: await received.title(),
          };
        },
      });

      const result = await nl.validate(instruction);

      return {
        pass: result,
        message: () => `expected page to satisfy: "${instruction}"`,
        actual: result,
        expected: true,
      };
    },

    // Computed CSS property
    async toHaveCSS(
      received: Locator | Page,
      property: string,
      expected: string,
      selector?: string,
    ) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const value = await element
        .evaluate(
          (el: Element, prop: string) => window.getComputedStyle(el).getPropertyValue(prop),
          property,
        )
        .catch(() => "");

      const pass = value.trim() === expected.trim();

      return {
        pass,
        message: () => `expected CSS property "${property}" to be "${expected}", got "${value}"`,
        actual: value,
        expected,
      };
    },

    // Inline style attribute
    async toHaveStyle(
      received: Locator | Page,
      property: string,
      expected: string,
      selector?: string,
    ) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const value = await element
        .evaluate((el: HTMLElement, prop: string) => el.style.getPropertyValue(prop), property)
        .catch(() => "");

      const pass = value.trim() === expected.trim();

      return {
        pass,
        message: () => `expected style "${property}" to be "${expected}", got "${value}"`,
        actual: value,
        expected,
      };
    },

    // Viewport visibility
    async toBeInViewport(received: Locator | Page, selector?: string) {
      const element = selector ? (received as Page).locator(selector) : (received as Locator);
      const inViewport = await element
        .evaluate((el: Element) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
          );
        })
        .catch(() => false);

      return {
        pass: inViewport,
        message: () => `expected element to be in viewport`,
        actual: inViewport,
        expected: true,
      };
    },

    // TODO: Screenshot comparison requires @inspect/visual PixelDiff
    // async toHaveScreenshot(received: Page, name: string, options?: { maxDiffPixels?: number }) { }

    // TODO: Accessibility audit requires @inspect/a11y integration with proper type alignment
    // async toSatisfyA11y(received: Page, standard?: "wcag2a" | "wcag2aa" | "wcag2aaa" | "wcag21aa" | "wcag22aa") { }

    // Network response assertion
    async toHaveNetworkResponse(
      received: Page,
      urlPattern: string | RegExp,
      expectedStatus?: number,
    ) {
      const pattern = typeof urlPattern === "string" ? new RegExp(urlPattern) : urlPattern;
      let response: unknown = null;
      let statusCode = 0;

      const handler = async (resp: unknown) => {
        const respTyped = resp as { url: () => string; status: () => number };
        if (pattern.test(respTyped.url())) {
          response = resp;
          statusCode = respTyped.status();
        }
      };

      received.on("response", handler as never);

      // Wait a bit for pending responses
      await new Promise((resolve) => setTimeout(resolve, 100));
      received.off("response", handler as never);

      const pass =
        response !== null && (expectedStatus === undefined || statusCode === expectedStatus);

      return {
        pass,
        message: () =>
          response === null
            ? `expected network response matching "${urlPattern}"`
            : expectedStatus !== undefined
              ? `expected status ${expectedStatus}, got ${statusCode}`
              : `network response found`,
        actual: statusCode,
        expected: expectedStatus,
      };
    },

    // Snapshot testing — serialize and compare against saved snapshots
    async toMatchSnapshot(received: unknown, name?: string) {
      const snapshotDir = join(process.cwd(), "__snapshots__");
      const testName = this.currentTestName ?? "unknown-test";
      const snapshotName = name
        ? `${name}.snap.json`
        : `${testName.replace(/[^a-zA-Z0-9]/g, "-")}.snap.json`;
      const snapshotPath = join(snapshotDir, snapshotName);

      const serialized = JSON.stringify(received, null, 2);
      const updateSnapshot = process.env.UPDATE_SNAPSHOTS === "1";

      if (!existsSync(snapshotDir)) {
        mkdirSync(snapshotDir, { recursive: true });
      }

      if (updateSnapshot || !existsSync(snapshotPath)) {
        writeFileSync(snapshotPath, serialized, "utf-8");
        return {
          pass: true,
          message: () =>
            updateSnapshot
              ? `snapshot updated: ${snapshotName}`
              : `snapshot created: ${snapshotName}`,
          actual: null,
          expected: null,
        };
      }

      const existing = readFileSync(snapshotPath, "utf-8");
      const pass = existing.trim() === serialized.trim();

      return {
        pass,
        message: () =>
          pass ? "snapshot matches" : `snapshot does not match. Update with UPDATE_SNAPSHOTS=1`,
        actual: received,
        expected: JSON.parse(existing),
      };
    },

    // Page screenshot snapshot comparison
    async toMatchPageSnapshot(received: Page, name: string, options?: { maxDiffPixels?: number }) {
      const snapshotDir = join(process.cwd(), "__screenshots__");
      const snapshotPath = join(snapshotDir, `${name}.png`);
      const maxDiffPixels = options?.maxDiffPixels ?? 0;

      const screenshot = await received.screenshot({ fullPage: true });
      const updateSnapshot = process.env.UPDATE_SNAPSHOTS === "1";

      if (!existsSync(snapshotDir)) {
        mkdirSync(snapshotDir, { recursive: true });
      }

      if (updateSnapshot || !existsSync(snapshotPath)) {
        writeFileSync(snapshotPath, screenshot);
        return {
          pass: true,
          message: () =>
            updateSnapshot
              ? `screenshot snapshot updated: ${name}.png`
              : `screenshot snapshot created: ${name}.png`,
          actual: null,
          expected: null,
        };
      }

      const baseline = readFileSync(snapshotPath);
      const diffPixels = compareScreenshotBuffers(screenshot, baseline);
      const pass = diffPixels <= maxDiffPixels;

      if (!pass) {
        const diffPath = join(snapshotDir, `${name}.diff.png`);
        writeFileSync(diffPath, screenshot);
      }

      return {
        pass,
        message: () =>
          pass
            ? `screenshot matches: ${name}.png (${diffPixels} diff pixels)`
            : `screenshot does not match: ${name}.png (${diffPixels} diff pixels, max: ${maxDiffPixels})`,
        actual: diffPixels,
        expected: maxDiffPixels,
      };
    },

    // Accessibility tree snapshot comparison
    async toMatchAccessibilitySnapshot(received: Page, name: string) {
      const snapshotDir = join(process.cwd(), "__snapshots__", "a11y");
      const snapshotPath = join(snapshotDir, `${name}.a11y.json`);

      const { AriaSnapshotBuilder } = await import("@inspect/browser");
      const builder = new AriaSnapshotBuilder();
      await builder.buildTree(received);
      const tree = builder.getFormattedTree();

      const updateSnapshot = process.env.UPDATE_SNAPSHOTS === "1";

      if (!existsSync(snapshotDir)) {
        mkdirSync(snapshotDir, { recursive: true });
      }

      if (updateSnapshot || !existsSync(snapshotPath)) {
        writeFileSync(
          snapshotPath,
          JSON.stringify({ tree, url: received.url(), title: await received.title() }, null, 2),
          "utf-8",
        );
        return {
          pass: true,
          message: () =>
            updateSnapshot
              ? `accessibility snapshot updated: ${name}.a11y.json`
              : `accessibility snapshot created: ${name}.a11y.json`,
          actual: null,
          expected: null,
        };
      }

      const existing = readFileSync(snapshotPath, "utf-8");
      const pass =
        existing.trim() ===
        JSON.stringify(
          { tree, url: received.url(), title: await received.title() },
          null,
          2,
        ).trim();

      return {
        pass,
        message: () =>
          pass
            ? `accessibility tree matches: ${name}.a11y.json`
            : `accessibility tree does not match: ${name}.a11y.json`,
        actual: tree,
        expected: JSON.parse(existing),
      };
    },
  });
}

function compareScreenshotBuffers(current: Buffer, baseline: Buffer): number {
  if (current.length !== baseline.length) {
    const currentHash = createHash("md5").update(current).digest("hex");
    const baselineHash = createHash("md5").update(baseline).digest("hex");
    return currentHash === baselineHash ? 0 : Math.abs(current.length - baseline.length);
  }

  let diffCount = 0;
  for (let i = 0; i < current.length; i++) {
    if (current[i] !== baseline[i]) {
      diffCount++;
    }
  }
  return diffCount;
}
