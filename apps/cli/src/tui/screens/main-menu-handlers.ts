// ─────────────────────────────────────────────────────────────────────────────
// MainMenu Handlers - Extracted for testability
// ─────────────────────────────────────────────────────────────────────────────

import type { MenuState, GitScopeSelection, AgentSelection } from "./MainMenu.js";

// ── Constants ───────────────────────────────────────────────────────────────

export const FIELDS = [
  "instruction",
  "url",
  "scope",
  "agent",
  "device",
  "mode",
  "headed",
  "a11y",
  "lighthouse",
  "start",
] as const;

export const SCOPES: GitScopeSelection[] = ["unstaged", "branch", "commit"];
export const AGENTS: AgentSelection[] = ["claude", "gpt", "gemini", "deepseek", "ollama"];
export const DEVICES = [
  "desktop-chrome",
  "desktop-firefox",
  "desktop-safari",
  "mobile-ios",
  "mobile-android",
  "tablet-ipad",
] as const;
export const MODES = ["dom", "hybrid", "cua"] as const;

// ── Type Definitions ────────────────────────────────────────────────────────

export type FieldType = (typeof FIELDS)[number];

export interface HandlerContext {
  state: MenuState;
  setState: React.Dispatch<React.SetStateAction<MenuState>>;
  history: string[];
  historyIndex: number;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
  setHistoryDraft: React.Dispatch<React.SetStateAction<string>>;
  exit: () => void;
  handleStart: () => void;
}

// ── Utility Functions ───────────────────────────────────────────────────────

export function cycleOption<T>(options: readonly T[], current: T, direction: 1 | -1): T {
  const idx = options.indexOf(current);
  return options[(idx + direction + options.length) % options.length];
}

export function getCanStart(state: MenuState): boolean {
  return state.instruction.trim().length > 0;
}

export function getCurrentField(state: MenuState): FieldType {
  return FIELDS[state.focusedField];
}

// ── Hint Generation ─────────────────────────────────────────────────────────

export interface Hint {
  label: string;
  value: string;
}

export function getHints(
  currentField: FieldType,
  canStart: boolean,
  historyLength: number,
): Hint[] {
  if (currentField === "instruction" || currentField === "url") {
    return [
      { label: "type", value: "input" },
      ...(historyLength > 0 ? [{ label: "\u2191\u2193", value: "history" }] : []),
      { label: "tab", value: "next" },
      ...(canStart ? [{ label: "\u21b5", value: "start" }] : []),
      { label: "esc", value: "quit" },
    ];
  }
  if (currentField === "start") {
    return [
      ...(canStart ? [{ label: "\u21b5", value: "run tests" }] : []),
      { label: "tab", value: "back" },
      { label: "ctrl+d", value: "headed" },
      { label: "esc", value: "quit" },
    ];
  }
  return [
    { label: "\u2190\u2192", value: "change" },
    { label: "tab", value: "next" },
    ...(canStart ? [{ label: "\u21b5", value: "start" }] : []),
    { label: "esc", value: "quit" },
  ];
}

// ── Global Shortcuts Handler ────────────────────────────────────────────────

export interface KeyGlobal {
  escape: boolean;
  ctrl: boolean;
}

export function handleGlobalShortcuts(
  input: string,
  key: KeyGlobal,
  exit: () => void,
  reset: () => void,
  toggleHeaded: () => void,
): boolean {
  if (key.escape || (key.ctrl && input === "c")) {
    exit();
    return true;
  }
  if (key.ctrl && input === "l") {
    reset();
    return true;
  }
  if (key.ctrl && input === "d") {
    toggleHeaded();
    return true;
  }
  return false;
}

// ── History Navigation Handler ──────────────────────────────────────────────

export interface KeyHistory {
  upArrow: boolean;
  downArrow: boolean;
}

export interface HistoryNavigationResult {
  handled: boolean;
  newIndex: number;
  newInstruction?: string;
}

export function handleHistoryNavigation(
  key: KeyHistory,
  currentField: FieldType,
  history: string[],
  historyIndex: number,
  currentInstruction: string,
  historyDraft: string,
): HistoryNavigationResult {
  if (currentField !== "instruction" || history.length === 0) {
    return { handled: false, newIndex: historyIndex };
  }

  if (key.upArrow) {
    const nextIndex = Math.min(historyIndex + 1, history.length - 1);
    const newDraft = historyIndex === -1 ? currentInstruction : historyDraft;
    return {
      handled: true,
      newIndex: nextIndex,
      newInstruction: history[nextIndex],
    };
  }

  if (key.downArrow) {
    if (historyIndex <= 0) {
      return {
        handled: true,
        newIndex: -1,
        newInstruction: historyDraft,
      };
    }
    const nextIndex = historyIndex - 1;
    return {
      handled: true,
      newIndex: nextIndex,
      newInstruction: history[nextIndex],
    };
  }

  return { handled: false, newIndex: historyIndex };
}

// ── Field Navigation Handler ────────────────────────────────────────────────

export interface KeyNavigation {
  upArrow: boolean;
  downArrow: boolean;
  tab: boolean;
  shift: boolean;
}

export function handleFieldNavigation(
  key: KeyNavigation,
  currentField: FieldType,
  focusedField: number,
): number | null {
  if (key.shift && key.tab) {
    return Math.max(0, focusedField - 1);
  }

  if (key.tab) {
    return (focusedField + 1) % FIELDS.length;
  }

  if (currentField !== "instruction" && key.upArrow) {
    return Math.max(0, focusedField - 1);
  }

  if (currentField !== "instruction" && key.downArrow) {
    return Math.min(FIELDS.length - 1, focusedField + 1);
  }

  return null;
}

// ── Text Input Handler ──────────────────────────────────────────────────────

export interface KeyText {
  return: boolean;
  backspace: boolean;
  delete: boolean;
  ctrl: boolean;
  meta: boolean;
}

export interface TextInputResult {
  handled: boolean;
  newValue?: string;
  shouldStart?: boolean;
  shouldFocusStart?: boolean;
  extractedUrl?: string;
}

export function handleTextInput(
  input: string,
  key: KeyText,
  currentField: FieldType,
  currentValue: string,
  canStart: boolean,
  currentUrl: string,
): TextInputResult {
  if (currentField !== "instruction" && currentField !== "url") {
    return { handled: false };
  }

  if (key.return) {
    if (canStart) {
      return { handled: true, shouldStart: true };
    } else {
      return { handled: true, shouldFocusStart: true };
    }
  }

  if (key.backspace || key.delete) {
    return { handled: true, newValue: currentValue.slice(0, -1) };
  }

  if (!key.ctrl && !key.meta && input && input.length === 1) {
    const updated = currentValue + input;
    let extractedUrl: string | undefined;

    // Extract URL from instruction if URL field is empty
    if (currentField === "instruction" && !currentUrl) {
      const urlMatch = updated.match(/(?:https?:\/\/|localhost[:/])\S+/i);
      if (urlMatch) {
        extractedUrl = urlMatch[0];
      }
    }

    return { handled: true, newValue: updated, extractedUrl };
  }

  return { handled: false };
}

// ── Option Cycling Handler ──────────────────────────────────────────────────

export interface KeyCycling {
  leftArrow: boolean;
  rightArrow: boolean;
}

export interface OptionCyclingResult {
  handled: boolean;
  field?: string;
  value?: string | boolean;
}

export function handleOptionCycling(
  key: KeyCycling,
  currentField: FieldType,
  state: MenuState,
): OptionCyclingResult {
  if (!key.leftArrow && !key.rightArrow) {
    return { handled: false };
  }

  const dir = key.rightArrow ? 1 : -1;

  switch (currentField) {
    case "scope":
      return {
        handled: true,
        field: "scope",
        value: cycleOption(SCOPES, state.scope, dir as 1 | -1),
      };
    case "agent":
      return {
        handled: true,
        field: "agent",
        value: cycleOption(AGENTS, state.agent, dir as 1 | -1),
      };
    case "device":
      return {
        handled: true,
        field: "device",
        value: cycleOption(DEVICES, state.device, dir as 1 | -1),
      };
    case "mode":
      return {
        handled: true,
        field: "mode",
        value: cycleOption(MODES, state.mode, dir as 1 | -1),
      };
    case "headed":
      return { handled: true, field: "headed", value: !state.headed };
    case "a11y":
      return { handled: true, field: "a11y", value: !state.a11y };
    case "lighthouse":
      return { handled: true, field: "lighthouse", value: !state.lighthouse };
    default:
      return { handled: false };
  }
}

// ── Submit Handler ──────────────────────────────────────────────────────────

export interface SubmitResult {
  handled: boolean;
  shouldStart?: boolean;
  shouldFocusStart?: boolean;
}

export function handleSubmit(key: { return: boolean }, canStart: boolean): SubmitResult {
  if (!key.return) {
    return { handled: false };
  }

  if (canStart) {
    return { handled: true, shouldStart: true };
  } else {
    return { handled: true, shouldFocusStart: true };
  }
}
