// ──────────────────────────────────────────────────────────────────────────────
// @inspect/expect-jest - Custom Matchers
// ──────────────────────────────────────────────────────────────────────────────

import type { Page, Locator } from "playwright";

export const matchers = {
  async toBeVisible(received: Locator | Page, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const visible = await element.isVisible().catch(() => false);

    return {
      pass: visible,
      message: () => `expected element to be visible`,
    };
  },

  async toBeHidden(received: Locator | Page, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const hidden = await element.isHidden().catch(() => true);

    return {
      pass: hidden,
      message: () => `expected element to be hidden`,
    };
  },

  async toBeEnabled(received: Locator | Page, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const enabled = await element.isEnabled().catch(() => false);

    return {
      pass: enabled,
      message: () => `expected element to be enabled`,
    };
  },

  async toBeDisabled(received: Locator | Page, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const disabled = await element.isDisabled().catch(() => false);

    return {
      pass: disabled,
      message: () => `expected element to be disabled`,
    };
  },

  async toHaveText(received: Locator | Page, expected: string | RegExp, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const text = await element.textContent().catch(() => "");

    const pass = typeof expected === "string" ? text === expected : expected.test(text ?? "");

    return {
      pass,
      message: () => `expected element to have text "${expected}", got "${text}"`,
    };
  },

  async toContainText(received: Locator | Page, expected: string | RegExp, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const text = await element.textContent().catch(() => "");

    const pass =
      typeof expected === "string" ? text?.includes(expected) : expected.test(text ?? "");

    return {
      pass: pass ?? false,
      message: () => `expected element to contain text "${expected}"`,
    };
  },

  async toHaveValue(received: Locator | Page, expected: string | RegExp, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const value = await element.inputValue().catch(() => "");

    const pass = typeof expected === "string" ? value === expected : expected.test(value);

    return {
      pass,
      message: () => `expected element to have value "${expected}"`,
    };
  },

  async toHaveURL(received: Page, expected: string | RegExp) {
    const url = received.url();
    const pass = typeof expected === "string" ? url === expected : expected.test(url);

    return {
      pass,
      message: () => `expected URL to be "${expected}", got "${url}"`,
    };
  },

  async toHaveTitle(received: Page, expected: string | RegExp) {
    const title = await received.title();
    const pass = typeof expected === "string" ? title === expected : expected.test(title);

    return {
      pass,
      message: () => `expected title to be "${expected}"`,
    };
  },

  async toHaveCount(received: Page, expected: number, selector?: string) {
    const locator = selector ? received.locator(selector) : received.locator("*");
    const count = await locator.count();

    return {
      pass: count === expected,
      message: () => `expected ${expected} elements, got ${count}`,
    };
  },

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
      message: () => `expected attribute "${name}" to be "${expected}"`,
    };
  },

  async toHaveClass(received: Locator | Page, expected: string | string[], selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const classValue = await element
      .evaluate((el) => (el as HTMLElement).className)
      .catch(() => "");

    const classes = classValue.split(" ").filter(Boolean);
    const expectedClasses = Array.isArray(expected) ? expected : [expected];

    const pass = expectedClasses.every((cls) => classes.includes(cls));

    return {
      pass,
      message: () => `expected element to have classes "${expectedClasses.join(", ")}"`,
    };
  },

  async toBeChecked(received: Locator | Page, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const checked = await element.isChecked().catch(() => false);

    return {
      pass: checked,
      message: () => `expected element to be checked`,
    };
  },

  async toBeFocused(received: Locator | Page, selector?: string) {
    const element = selector ? (received as Page).locator(selector) : (received as Locator);
    const focused = await element
      .evaluate((el) => el === document.activeElement)
      .catch(() => false);

    return {
      pass: focused,
      message: () => `expected element to be focused`,
    };
  },

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
    };
  },
};

export default matchers;
