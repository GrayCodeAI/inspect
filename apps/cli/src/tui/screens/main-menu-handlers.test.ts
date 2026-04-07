import { describe, it, expect } from "vitest";
import {
  cycleOption,
  getCanStart,
  getCurrentField,
  getHints,
  handleGlobalShortcuts,
  handleHistoryNavigation,
  handleFieldNavigation,
  handleTextInput,
  handleOptionCycling,
  handleSubmit,
  FIELDS,
  SCOPES,
  AGENTS,
  DEVICES,
  MODES,
} from "./main-menu-handlers.js";
import type { MenuState } from "./MainMenu.js";

describe("main-menu-handlers", () => {
  describe("cycleOption", () => {
    it("cycles forward through options", () => {
      const result = cycleOption(SCOPES, "unstaged", 1);
      expect(result).toBe("branch");
    });

    it("cycles backward through options", () => {
      const result = cycleOption(SCOPES, "branch", -1);
      expect(result).toBe("unstaged");
    });

    it("wraps around to beginning when cycling forward at end", () => {
      const result = cycleOption(SCOPES, "commit", 1);
      expect(result).toBe("unstaged");
    });

    it("wraps around to end when cycling backward at start", () => {
      const result = cycleOption(SCOPES, "unstaged", -1);
      expect(result).toBe("commit");
    });

    it("works with agents", () => {
      expect(cycleOption(AGENTS, "claude", 1)).toBe("gpt");
      expect(cycleOption(AGENTS, "gpt", -1)).toBe("claude");
    });

    it("works with devices", () => {
      expect(cycleOption(DEVICES, "desktop-chrome", 1)).toBe("desktop-firefox");
    });

    it("works with modes", () => {
      expect(cycleOption(MODES, "dom", 1)).toBe("hybrid");
      expect(cycleOption(MODES, "cua", 1)).toBe("dom");
    });
  });

  describe("getCanStart", () => {
    it("returns true when instruction has content", () => {
      const state: MenuState = {
        instruction: "test the login page",
        url: "",
        scope: "unstaged",
        agent: "claude",
        device: "desktop-chrome",
        mode: "dom",
        headed: false,
        a11y: false,
        lighthouse: false,
        focusedField: 0,
        isLoading: false,
      };
      expect(getCanStart(state)).toBe(true);
    });

    it("returns false when instruction is empty", () => {
      const state: MenuState = {
        instruction: "",
        url: "",
        scope: "unstaged",
        agent: "claude",
        device: "desktop-chrome",
        mode: "dom",
        headed: false,
        a11y: false,
        lighthouse: false,
        focusedField: 0,
        isLoading: false,
      };
      expect(getCanStart(state)).toBe(false);
    });

    it("returns false when instruction is whitespace only", () => {
      const state: MenuState = {
        instruction: "   ",
        url: "",
        scope: "unstaged",
        agent: "claude",
        device: "desktop-chrome",
        mode: "dom",
        headed: false,
        a11y: false,
        lighthouse: false,
        focusedField: 0,
        isLoading: false,
      };
      expect(getCanStart(state)).toBe(false);
    });
  });

  describe("getCurrentField", () => {
    it("returns correct field for index 0", () => {
      const state = { focusedField: 0 } as MenuState;
      expect(getCurrentField(state)).toBe("instruction");
    });

    it("returns correct field for index 9 (start)", () => {
      const state = { focusedField: 9 } as MenuState;
      expect(getCurrentField(state)).toBe("start");
    });

    it("returns correct field for middle index", () => {
      const state = { focusedField: 4 } as MenuState;
      expect(getCurrentField(state)).toBe("device");
    });
  });

  describe("getHints", () => {
    it("returns instruction field hints with history", () => {
      const hints = getHints("instruction", true, 5);
      expect(hints).toContainEqual({ label: "type", value: "input" });
      expect(hints).toContainEqual({ label: "\u2191\u2193", value: "history" });
      expect(hints).toContainEqual({ label: "\u21b5", value: "start" });
    });

    it("returns instruction field hints without history", () => {
      const hints = getHints("instruction", true, 0);
      expect(hints).not.toContainEqual({ label: "\u2191\u2193", value: "history" });
    });

    it("returns instruction field hints without start when cant start", () => {
      const hints = getHints("instruction", false, 0);
      expect(hints).not.toContainEqual({ label: "\u21b5", value: "start" });
    });

    it("returns start field hints", () => {
      const hints = getHints("start", true, 0);
      expect(hints).toContainEqual({ label: "\u21b5", value: "run tests" });
      expect(hints).toContainEqual({ label: "ctrl+d", value: "headed" });
    });

    it("returns generic field hints", () => {
      const hints = getHints("scope", true, 0);
      expect(hints).toContainEqual({ label: "\u2190\u2192", value: "change" });
      expect(hints).toContainEqual({ label: "tab", value: "next" });
    });
  });

  describe("handleGlobalShortcuts", () => {
    const mockExit = () => {};
    const mockReset = () => {};
    const mockToggleHeaded = () => {};

    it("handles escape key", () => {
      const result = handleGlobalShortcuts(
        "",
        { escape: true, ctrl: false },
        mockExit,
        mockReset,
        mockToggleHeaded,
      );
      expect(result).toBe(true);
    });

    it("handles ctrl+c", () => {
      const result = handleGlobalShortcuts(
        "c",
        { escape: false, ctrl: true },
        mockExit,
        mockReset,
        mockToggleHeaded,
      );
      expect(result).toBe(true);
    });

    it("handles ctrl+l (reset)", () => {
      const result = handleGlobalShortcuts(
        "l",
        { escape: false, ctrl: true },
        mockExit,
        mockReset,
        mockToggleHeaded,
      );
      expect(result).toBe(true);
    });

    it("handles ctrl+d (toggle headed)", () => {
      const result = handleGlobalShortcuts(
        "d",
        { escape: false, ctrl: true },
        mockExit,
        mockReset,
        mockToggleHeaded,
      );
      expect(result).toBe(true);
    });

    it("returns false for unmatched shortcuts", () => {
      const result = handleGlobalShortcuts(
        "x",
        { escape: false, ctrl: true },
        mockExit,
        mockReset,
        mockToggleHeaded,
      );
      expect(result).toBe(false);
    });
  });

  describe("handleHistoryNavigation", () => {
    const history = ["first", "second", "third"];

    it("navigates up through history", () => {
      const result = handleHistoryNavigation(
        { upArrow: true, downArrow: false },
        "instruction",
        history,
        -1,
        "",
        "",
      );
      expect(result.handled).toBe(true);
      expect(result.newIndex).toBe(0);
      expect(result.newInstruction).toBe("first");
    });

    it("navigates down through history", () => {
      const result = handleHistoryNavigation(
        { upArrow: false, downArrow: true },
        "instruction",
        history,
        1,
        "second",
        "draft",
      );
      expect(result.handled).toBe(true);
      expect(result.newIndex).toBe(0);
      expect(result.newInstruction).toBe("first");
    });

    it("returns to draft when navigating down from index 0", () => {
      const result = handleHistoryNavigation(
        { upArrow: false, downArrow: true },
        "instruction",
        history,
        0,
        "first",
        "my draft",
      );
      expect(result.handled).toBe(true);
      expect(result.newIndex).toBe(-1);
      expect(result.newInstruction).toBe("my draft");
    });

    it("does not handle when field is not instruction", () => {
      const result = handleHistoryNavigation(
        { upArrow: true, downArrow: false },
        "url",
        history,
        -1,
        "",
        "",
      );
      expect(result.handled).toBe(false);
    });

    it("does not handle when history is empty", () => {
      const result = handleHistoryNavigation(
        { upArrow: true, downArrow: false },
        "instruction",
        [],
        -1,
        "",
        "",
      );
      expect(result.handled).toBe(false);
    });
  });

  describe("handleFieldNavigation", () => {
    it("navigates to previous field with shift+tab", () => {
      const result = handleFieldNavigation(
        { upArrow: false, downArrow: false, tab: true, shift: true },
        "scope",
        5,
      );
      expect(result).toBe(4);
    });

    it("navigates to next field with tab", () => {
      const result = handleFieldNavigation(
        { upArrow: false, downArrow: false, tab: true, shift: false },
        "scope",
        5,
      );
      expect(result).toBe(6);
    });

    it("wraps around with tab at last field", () => {
      const result = handleFieldNavigation(
        { upArrow: false, downArrow: false, tab: true, shift: false },
        "start",
        9,
      );
      expect(result).toBe(0);
    });

    it("navigates up with up arrow (non-instruction field)", () => {
      const result = handleFieldNavigation(
        { upArrow: true, downArrow: false, tab: false, shift: false },
        "scope",
        5,
      );
      expect(result).toBe(4);
    });

    it("navigates down with down arrow (non-instruction field)", () => {
      const result = handleFieldNavigation(
        { upArrow: false, downArrow: true, tab: false, shift: false },
        "scope",
        5,
      );
      expect(result).toBe(6);
    });

    it("returns null for unhandled keys", () => {
      const result = handleFieldNavigation(
        { upArrow: false, downArrow: false, tab: false, shift: false },
        "scope",
        5,
      );
      expect(result).toBeNull();
    });
  });

  describe("handleTextInput", () => {
    it("handles return key when can start", () => {
      const result = handleTextInput(
        "",
        { return: true, backspace: false, delete: false, ctrl: false, meta: false },
        "instruction",
        "test",
        true,
        "",
      );
      expect(result.handled).toBe(true);
      expect(result.shouldStart).toBe(true);
    });

    it("handles return key when cannot start", () => {
      const result = handleTextInput(
        "",
        { return: true, backspace: false, delete: false, ctrl: false, meta: false },
        "instruction",
        "",
        false,
        "",
      );
      expect(result.handled).toBe(true);
      expect(result.shouldFocusStart).toBe(true);
    });

    it("handles backspace", () => {
      const result = handleTextInput(
        "",
        { return: false, backspace: true, delete: false, ctrl: false, meta: false },
        "instruction",
        "test",
        true,
        "",
      );
      expect(result.handled).toBe(true);
      expect(result.newValue).toBe("tes");
    });

    it("handles delete key", () => {
      const result = handleTextInput(
        "",
        { return: false, backspace: false, delete: true, ctrl: false, meta: false },
        "instruction",
        "test",
        true,
        "",
      );
      expect(result.handled).toBe(true);
      expect(result.newValue).toBe("tes");
    });

    it("handles character input", () => {
      const result = handleTextInput(
        "a",
        { return: false, backspace: false, delete: false, ctrl: false, meta: false },
        "instruction",
        "test",
        true,
        "",
      );
      expect(result.handled).toBe(true);
      expect(result.newValue).toBe("testa");
    });

    it("extracts URL from instruction", () => {
      const result = handleTextInput(
        " ",
        { return: false, backspace: false, delete: false, ctrl: false, meta: false },
        "instruction",
        "test http://example.com",
        true,
        "",
      );
      expect(result.extractedUrl).toBe("http://example.com");
    });

    it("does not handle non-text fields", () => {
      const result = handleTextInput(
        "a",
        { return: false, backspace: false, delete: false, ctrl: false, meta: false },
        "scope",
        "",
        true,
        "",
      );
      expect(result.handled).toBe(false);
    });

    it("ignores ctrl+character", () => {
      const result = handleTextInput(
        "c",
        { return: false, backspace: false, delete: false, ctrl: true, meta: false },
        "instruction",
        "test",
        true,
        "",
      );
      expect(result.handled).toBe(false);
    });
  });

  describe("handleOptionCycling", () => {
    const baseState: MenuState = {
      instruction: "",
      url: "",
      scope: "unstaged",
      agent: "claude",
      device: "desktop-chrome",
      mode: "dom",
      headed: false,
      a11y: false,
      lighthouse: false,
      focusedField: 0,
      isLoading: false,
    };

    it("cycles scope with right arrow", () => {
      const result = handleOptionCycling(
        { leftArrow: false, rightArrow: true },
        "scope",
        baseState,
      );
      expect(result.handled).toBe(true);
      expect(result.field).toBe("scope");
      expect(result.value).toBe("branch");
    });

    it("cycles agent with right arrow", () => {
      const result = handleOptionCycling(
        { leftArrow: false, rightArrow: true },
        "agent",
        baseState,
      );
      expect(result.handled).toBe(true);
      expect(result.field).toBe("agent");
      expect(result.value).toBe("gpt");
    });

    it("cycles device with left arrow", () => {
      const result = handleOptionCycling(
        { leftArrow: true, rightArrow: false },
        "device",
        baseState,
      );
      expect(result.handled).toBe(true);
      expect(result.field).toBe("device");
      expect(result.value).toBe("tablet-ipad"); // wraps around
    });

    it("toggles headed", () => {
      const result = handleOptionCycling(
        { leftArrow: false, rightArrow: true },
        "headed",
        baseState,
      );
      expect(result.handled).toBe(true);
      expect(result.field).toBe("headed");
      expect(result.value).toBe(true);
    });

    it("toggles a11y", () => {
      const result = handleOptionCycling({ leftArrow: false, rightArrow: true }, "a11y", baseState);
      expect(result.handled).toBe(true);
      expect(result.field).toBe("a11y");
      expect(result.value).toBe(true);
    });

    it("toggles lighthouse", () => {
      const result = handleOptionCycling(
        { leftArrow: false, rightArrow: true },
        "lighthouse",
        baseState,
      );
      expect(result.handled).toBe(true);
      expect(result.field).toBe("lighthouse");
      expect(result.value).toBe(true);
    });

    it("does not handle non-option fields", () => {
      const result = handleOptionCycling(
        { leftArrow: false, rightArrow: true },
        "instruction",
        baseState,
      );
      expect(result.handled).toBe(false);
    });

    it("does not handle when no arrow pressed", () => {
      const result = handleOptionCycling(
        { leftArrow: false, rightArrow: false },
        "scope",
        baseState,
      );
      expect(result.handled).toBe(false);
    });
  });

  describe("handleSubmit", () => {
    it("handles return key when can start", () => {
      const result = handleSubmit({ return: true }, true);
      expect(result.handled).toBe(true);
      expect(result.shouldStart).toBe(true);
    });

    it("handles return key when cannot start", () => {
      const result = handleSubmit({ return: true }, false);
      expect(result.handled).toBe(true);
      expect(result.shouldFocusStart).toBe(true);
    });

    it("does not handle when return not pressed", () => {
      const result = handleSubmit({ return: false }, true);
      expect(result.handled).toBe(false);
    });
  });
});
