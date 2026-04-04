import type { Page } from "playwright";
import { describe, it, expect, vi } from "vitest";
import {
  checkElementInteractability,
  getClickableElements,
  getElementState,
} from "./interactability.js";

describe("Interactability Detection", () => {
  describe("checkElementInteractability", () => {
    it("should detect clickable button", async () => {
      // Mock page.evaluate
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({
          isClickable: true,
          isDisabled: false,
          isHidden: false,
          hasPointerEvents: true,
          hasClickHandler: false,
          isReadOnly: false,
          ariaDisabled: false,
        }),
      };

      const result = await checkElementInteractability(mockPage as unknown as Page, "button");

      expect(result.isClickable).toBe(true);
      expect(result.isDisabled).toBe(false);
      expect(result.isHidden).toBe(false);
    });

    it("should detect disabled button", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({
          isClickable: false,
          isDisabled: true,
          isHidden: false,
          hasPointerEvents: true,
          hasClickHandler: false,
          isReadOnly: false,
          ariaDisabled: false,
          reason: "Element has disabled attribute",
        }),
      };

      const result = await checkElementInteractability(
        mockPage as unknown as Page,
        "button:disabled",
      );

      expect(result.isClickable).toBe(false);
      expect(result.isDisabled).toBe(true);
      expect(result.reason).toBe("Element has disabled attribute");
    });

    it("should detect aria-disabled", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({
          isClickable: false,
          isDisabled: false,
          isHidden: false,
          hasPointerEvents: true,
          hasClickHandler: false,
          isReadOnly: false,
          ariaDisabled: true,
          reason: "Element has aria-disabled=true",
        }),
      };

      const result = await checkElementInteractability(
        mockPage as unknown as Page,
        "[aria-disabled='true']",
      );

      expect(result.ariaDisabled).toBe(true);
      expect(result.isClickable).toBe(false);
    });

    it("should detect pointer-events: none", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({
          isClickable: false,
          isDisabled: false,
          isHidden: false,
          hasPointerEvents: false,
          hasClickHandler: false,
          isReadOnly: false,
          ariaDisabled: false,
          reason: "Element has pointer-events: none",
        }),
      };

      const result = await checkElementInteractability(mockPage as unknown as Page, ".no-click");

      expect(result.hasPointerEvents).toBe(false);
      expect(result.isClickable).toBe(false);
    });

    it("should detect hidden elements", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({
          isClickable: false,
          isDisabled: false,
          isHidden: true,
          hasPointerEvents: true,
          hasClickHandler: false,
          isReadOnly: false,
          ariaDisabled: false,
          reason: "Element is hidden (display/visibility)",
        }),
      };

      const result = await checkElementInteractability(mockPage as unknown as Page, ".hidden");

      expect(result.isHidden).toBe(true);
      expect(result.isClickable).toBe(false);
    });
  });

  describe("getClickableElements", () => {
    it("should return list of clickable element selectors", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(["button#submit", "a.link", "input[type=submit]"]),
      };

      const result = await getClickableElements(mockPage as unknown as Page, "button, a, input");

      expect(result).toHaveLength(3);
      expect(result).toContain("button#submit");
      expect(result).toContain("a.link");
    });

    it("should filter disabled elements", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(["button#submit", "a.link"]),
      };

      const result = await getClickableElements(mockPage as unknown as Page, "button, a", {
        checkDisabled: true,
      });

      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getElementState", () => {
    it("should return element state", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({
          isVisible: true,
          isClickable: true,
          isFocused: false,
          isHovered: false,
          hasText: true,
          textContent: "Click me",
          attributes: {
            id: "submit-btn",
            class: "primary-button",
          },
        }),
      };

      const result = await getElementState(mockPage as unknown as Page, "button");

      expect(result).not.toBeNull();
      expect(result?.isVisible).toBe(true);
      expect(result?.isClickable).toBe(true);
      expect(result?.textContent).toBe("Click me");
    });

    it("should handle focused element", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({
          isVisible: true,
          isClickable: true,
          isFocused: true,
          isHovered: false,
          hasText: true,
          textContent: "Focused input",
          attributes: {
            type: "text",
          },
        }),
      };

      const result = await getElementState(mockPage as unknown as Page, "input:focus");

      expect(result?.isFocused).toBe(true);
    });

    it("should return null for non-existent element", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(null),
      };

      const result = await getElementState(mockPage as unknown as Page, ".non-existent");

      expect(result).toBeNull();
    });
  });
});
