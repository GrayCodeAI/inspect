/**
 * DOM Interactability Checks - Tasks 251-270
 *
 * Detect disabled states, pointer events, click handlers, and element interactions
 */

import type { Page } from "playwright";

/**
 * Interactability check result
 */
export interface InteractabilityResult {
  isClickable: boolean;
  isDisabled: boolean;
  isHidden: boolean;
  hasPointerEvents: boolean;
  hasClickHandler: boolean;
  isReadOnly: boolean;
  ariaDisabled: boolean;
  reason?: string;
}

/**
 * Interactability options
 */
export interface InteractabilityOptions {
  checkDisabled: boolean;
  checkAriaDisabled: boolean;
  checkPointerEvents: boolean;
  checkClickHandlers: boolean;
  checkReadOnly: boolean;
}

export const DEFAULT_INTERACTABILITY_OPTIONS: InteractabilityOptions = {
  checkDisabled: true,
  checkAriaDisabled: true,
  checkPointerEvents: true,
  checkClickHandlers: false,
  checkReadOnly: true,
};

/**
 * Task 251-255: Check if element is clickable/interactable
 */
export async function checkElementInteractability(
  page: Page,
  selector: string,
  options: Partial<InteractabilityOptions> = {}
): Promise<InteractabilityResult> {
  const opts = { ...DEFAULT_INTERACTABILITY_OPTIONS, ...options };

  return page.evaluate(
    (args) => {
      const { selector, opts } = args;
      const element = document.querySelector(selector) as HTMLElement;
      if (!element) {
        return {
          isClickable: false,
          isDisabled: true,
          isHidden: true,
          hasPointerEvents: false,
          hasClickHandler: false,
          isReadOnly: false,
          ariaDisabled: false,
          reason: "Element not found",
        };
      }

      const result: any = {
        isClickable: true,
        isDisabled: false,
        isHidden: false,
        hasPointerEvents: true,
        hasClickHandler: false,
        isReadOnly: false,
        ariaDisabled: false,
      };

      // Task 251: Check disabled attribute
      if (opts.checkDisabled) {
        const isDisabledAttr =
          element.hasAttribute("disabled") ||
          (element as any).disabled === true ||
          element.getAttribute("data-disabled") === "true";

        if (isDisabledAttr) {
          result.isDisabled = true;
          result.isClickable = false;
          result.reason = "Element has disabled attribute";
        }
      }

      // Task 252: Check aria-disabled
      if (opts.checkAriaDisabled) {
        const ariaDisabled = element.getAttribute("aria-disabled");
        if (ariaDisabled === "true") {
          result.ariaDisabled = true;
          result.isClickable = false;
          result.reason = "Element has aria-disabled=true";
        }
      }

      // Task 253: Check readonly (for inputs)
      if (opts.checkReadOnly && (element as HTMLInputElement).readOnly) {
        result.isReadOnly = true;
        result.isClickable = false;
        result.reason = "Input element is readonly";
      }

      // Task 254: Check pointer-events CSS
      if (opts.checkPointerEvents) {
        const style = window.getComputedStyle(element);
        if (style.pointerEvents === "none") {
          result.hasPointerEvents = false;
          result.isClickable = false;
          result.reason = "Element has pointer-events: none";
        }
      }

      // Task 255: Check if element is hidden
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      ) {
        result.isHidden = true;
        result.isClickable = false;
        result.reason = "Element is hidden (display/visibility)";
      }

      // Task 256: Check opacity
      const opacity = parseFloat(style.opacity);
      if (opacity === 0) {
        result.isClickable = false;
        result.reason = "Element has opacity 0";
      }

      // Task 257: Check for click handlers (basic detection)
      if (opts.checkClickHandlers) {
        // Check for onclick attribute
        if (element.onclick !== null) {
          result.hasClickHandler = true;
        }

        // Check for event listeners (note: can't reliably detect in all cases)
        // This is a heuristic - we check if element is a button or link
        const tagName = element.tagName.toLowerCase();
        if (
          tagName === "button" ||
          tagName === "a" ||
          tagName === "[object HTMLButtonElement]"
        ) {
          result.hasClickHandler = true;
        }
      }

      // Task 258: Check viewport visibility
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        result.isClickable = false;
        result.reason = "Element has zero dimensions";
      }

      if (
        rect.top < 0 ||
        rect.left < 0 ||
        rect.bottom > window.innerHeight ||
        rect.right > window.innerWidth
      ) {
        // Element is outside viewport - set to false for strict checking
        // Some apps still want to click off-screen elements
      }

      return result;
    },
    { selector, opts }
  );
}

/**
 * Task 259-265: Check multiple elements for interactability
 */
export async function checkElementsInteractability(
  page: Page,
  selectors: string[],
  options: Partial<InteractabilityOptions> = {}
): Promise<Map<string, InteractabilityResult>> {
  const results = new Map<string, InteractabilityResult>();

  for (const selector of selectors) {
    const result = await checkElementInteractability(page, selector, options);
    results.set(selector, result);
  }

  return results;
}

/**
 * Task 266-270: Filter clickable elements
 */
export async function getClickableElements(
  page: Page,
  baseSelector: string = "*",
  options: Partial<InteractabilityOptions> = {}
): Promise<string[]> {
  const opts = { ...DEFAULT_INTERACTABILITY_OPTIONS, ...options };

  return page.evaluate(
    (args) => {
      const { baseSelector, opts } = args;
      const elements = document.querySelectorAll(baseSelector);
      const clickable: string[] = [];

      for (let i = 0; i < elements.length; i++) {
        const element = elements[i] as HTMLElement;

        // Skip if disabled
        if (opts.checkDisabled && (element as any).disabled) continue;

        // Skip if aria-disabled
        if (
          opts.checkAriaDisabled &&
          element.getAttribute("aria-disabled") === "true"
        ) {
          continue;
        }

        // Skip if readonly
        if (
          opts.checkReadOnly &&
          (element as HTMLInputElement).readOnly
        ) {
          continue;
        }

        // Skip if pointer-events: none
        if (opts.checkPointerEvents) {
          const style = window.getComputedStyle(element);
          if (style.pointerEvents === "none") continue;
        }

        // Build selector for this element
        let selector = element.tagName.toLowerCase();
        if (element.id) {
          selector = `#${element.id}`;
        } else if (element.className) {
          const className = element.className.split(" ").join(".");
          selector = `${selector}.${className}`;
        }

        clickable.push(selector);
      }

      return clickable;
    },
    { baseSelector, opts }
  );
}

/**
 * Task 271-275: Element state detection
 */
export interface ElementState {
  isVisible: boolean;
  isClickable: boolean;
  isFocused: boolean;
  isHovered: boolean;
  hasText: boolean;
  textContent: string;
  attributes: Record<string, string>;
}

/**
 * Get detailed element state
 */
export async function getElementState(
  page: Page,
  selector: string
): Promise<ElementState | null> {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const html = element as HTMLElement;

    return {
      isVisible:
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        parseFloat(style.opacity) > 0,
      isClickable:
        !(html as any).disabled &&
        style.pointerEvents !== "none" &&
        rect.width > 0 &&
        rect.height > 0,
      isFocused: document.activeElement === element,
      isHovered: element.matches(":hover"),
      hasText: (element.textContent ?? "").trim().length > 0,
      textContent: (element.textContent ?? "").trim(),
      attributes: Array.from(element.attributes).reduce(
        (acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        },
        {} as Record<string, string>
      ),
    };
  }, selector);
}
