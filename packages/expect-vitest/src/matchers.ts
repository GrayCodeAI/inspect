// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-vitest - Custom Matchers
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Locator } from "@inspect/browser";
import type { InspectMatchers, AssertionResult } from "./types.js";
import { expect } from "vitest";

/** Extend Vitest's expect with Inspect matchers */
export function extendExpect(vitestExpect: typeof expect) {
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
  });
}
