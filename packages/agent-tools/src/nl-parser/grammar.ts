// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent-tools - Natural Language Grammar Patterns
// 50+ patterns for parsing browser automation instructions
// ──────────────────────────────────────────────────────────────────────────────

import type { GrammarPattern, ActionType, ActionParams } from "./types.js";

/** Helper to create patterns with common extractors */
const createPattern = (
  name: string,
  actionType: ActionType,
  regexes: string[],
  extractors: GrammarPattern["extractors"],
  examples: string[],
  priority = 100,
): GrammarPattern => ({
  name,
  actionType,
  patterns: regexes.map((r) => new RegExp(r, "i")),
  extractors,
  examples,
  priority,
});

/** Extract target element from match groups */
const extractTarget = (match: RegExpMatchArray): Partial<ActionParams> => ({
  target: match[1]?.trim().replace(/^the\s+/i, ""),
});

/** Extract target and value */
const extractTargetAndValue = (match: RegExpMatchArray): Partial<ActionParams> => ({
  target: match[1]?.trim().replace(/^the\s+/i, ""),
  value: match[2]?.trim(),
});

/** Extract numeric value */
const extractNumeric = (match: RegExpMatchArray): Partial<ActionParams> => {
  const num = parseInt(match[1], 10);
  return { numericValue: isNaN(num) ? undefined : num };
};

/** Extract URL */
const extractUrl = (match: RegExpMatchArray): Partial<ActionParams> => ({
  url: match[1]?.trim() || match[2]?.trim(),
});

/** Extract direction */
const _extractDirection = (match: RegExpMatchArray): Partial<ActionParams> => {
  const dir = match[1]?.toLowerCase();
  const directionMap: Record<string, ActionParams["direction"]> = {
    up: "up",
    down: "down",
    left: "left",
    right: "right",
    top: "top",
    bottom: "bottom",
  };
  return { direction: directionMap[dir] };
};

/** Extract key */
const extractKey = (match: RegExpMatchArray): Partial<ActionParams> => ({
  key: match[1]?.trim(),
});

/** Extract timeout */
const extractTimeout = (match: RegExpMatchArray): Partial<ActionParams> => {
  const num = parseInt(match[1], 10);
  return { timeout: isNaN(num) ? undefined : num * 1000 }; // Convert to ms
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLICK ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const clickPatterns: GrammarPattern[] = [
  createPattern(
    "click_basic",
    "click",
    [
      "click (?:on )?the (.+)",
      "click (.+)",
      "tap (?:on )?(.+)",
      "press (?:the )?(.+?) button",
      "press (?:the )?(.+?) tab",
      "click",
    ],
    [extractTarget],
    [
      "Click the login button",
      "Click on submit",
      "Tap on the menu",
      "Press the submit button",
      "Click",
    ],
    100,
  ),

  createPattern(
    "click_by_role",
    "click",
    [
      "click (?:the )?(.+?) button",
      "click (?:the )?(.+?) link",
      "click (?:the )?(.+?) tab",
      "click (?:the )?(.+?) menu",
      "click (?:the )?(.+?) icon",
    ],
    [(match) => ({ target: `${match[1]} button/link` })],
    ["Click the submit button", "Click the home link", "Click the settings tab"],
    95,
  ),

  createPattern(
    "double_click",
    "doubleClick",
    ["double[- ]?click (?:on )?(.+)", "double tap (?:on )?(.+)"],
    [extractTarget],
    ["Double-click the file", "Double tap on the image"],
    90,
  ),

  createPattern(
    "right_click",
    "rightClick",
    ["right[- ]?click (?:on )?(.+)", "context[- ]?click (?:on )?(.+)"],
    [extractTarget],
    ["Right-click on the element", "Context-click the image"],
    90,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE/FILL ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const typePatterns: GrammarPattern[] = [
  createPattern(
    "type_basic",
    "type",
    [
      "type ['\"]?([^'\"]+)['\"]? (?:in|into) (?:the )?(.+)",
      "enter ['\"]?([^'\"]+)['\"]? (?:in|into) (?:the )?(.+)",
      "input ['\"]?([^'\"]+)['\"]? (?:in|into) (?:the )?(.+)",
    ],
    [
      (match) => ({
        target: match[2]?.trim().replace(/^the\s+/i, ""),
        value: match[1]?.trim(),
      }),
    ],
    [
      'Type "hello" in the search box',
      "Enter username in the login field",
      "Input 'password' into the password field",
    ],
    100,
  ),

  createPattern(
    "fill_field",
    "type",
    ["fill (?:the )?(.+?) with ['\"]?([^'\"]+)['\"]?", "fill (?:the )?(.+)"],
    [
      (match) =>
        match[2]
          ? {
              target: match[1]?.trim().replace(/^the\s+/i, ""),
              value: match[2]?.trim(),
            }
          : {
              target: match[1]?.trim().replace(/^the\s+/i, ""),
            },
    ],
    ["Fill the email field with test@example.com", "Fill the search box"],
    100,
  ),

  createPattern(
    "type_variable",
    "type",
    [
      "type (?:my |the )?(.+?) (?:in|into) (?:the )?(.+)",
      "enter (?:my |the )?(.+?) (?:in|into) (?:the )?(.+)",
    ],
    [(match) => ({ target: match[2]?.trim(), value: `{${match[1]?.trim()}}` })],
    ["Type my email in the email field", "Enter the password in the password field"],
    90,
  ),

  createPattern(
    "clear_field",
    "clear",
    [
      "clear (?:the )?(.+)",
      "empty (?:the )?(.+)",
      "delete (?:the )?text (?:in|from) (?:the )?(.+)",
    ],
    [extractTarget],
    ["Clear the search field", "Empty the input box"],
    85,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SELECT ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const selectPatterns: GrammarPattern[] = [
  createPattern(
    "select_option",
    "select",
    [
      "select ['\"]?([^'\"]+)['\"]? from (?:the )?(.+)(?: dropdown)?$",
      "choose ['\"]?([^'\"]+)['\"]? from (?:the )?(.+)(?: dropdown)?$",
      "pick ['\"]?([^'\"]+)['\"]? from (?:the )?(.+)(?: dropdown)?$",
    ],
    [
      (match) => ({
        target: match[2]?.trim().replace(/^the\s+/i, ""),
        value: match[1]?.trim(),
      }),
    ],
    [
      "Select United States from the country dropdown",
      "Choose option 2 from the menu",
      "Pick 'Large' from the size dropdown",
    ],
    105,
  ),

  createPattern(
    "check_checkbox",
    "check",
    ["check (?:the )?(.+)", "tick (?:the )?(.+)", "enable (?:the )?(.+?) checkbox"],
    [extractTarget],
    ["Check the terms checkbox", "Tick the agree box"],
    90,
  ),

  createPattern(
    "uncheck_checkbox",
    "uncheck",
    ["uncheck (?:the )?(.+)", "untick (?:the )?(.+)", "uncheck (?:the )?(.+?) checkbox"],
    [extractTarget],
    ["Uncheck the newsletter checkbox", "Untick the option"],
    90,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const navigationPatterns: GrammarPattern[] = [
  createPattern(
    "navigate_to",
    "navigate",
    [
      "go to (https?://[^\\s'\"]+)",
      "navigate to (https?://[^\\s'\"]+)",
      "open (https?://[^\\s'\"]+)",
      "visit (https?://[^\\s'\"]+)",
      "browse to (https?://[^\\s'\"]+)",
      "go to ['\"]?(https?://[^'\"]+)['\"]?",
      "navigate to ['\"]?(https?://[^'\"]+)['\"]?",
      "go to (.+)",
      "navigate to (.+)",
      "open (.+)",
      "visit (.+)",
    ],
    [extractUrl],
    ["Go to https://example.com", "Navigate to the login page", "Open google.com"],
    100,
  ),

  createPattern(
    "go_back",
    "goBack",
    ["go back", "navigate back", "return to previous page", "click back"],
    [() => ({})],
    ["Go back", "Navigate back", "Return to previous page"],
    90,
  ),

  createPattern(
    "go_forward",
    "goForward",
    ["go forward", "navigate forward", "go to next page"],
    [() => ({})],
    ["Go forward", "Navigate forward"],
    90,
  ),

  createPattern(
    "refresh",
    "refresh",
    ["refresh (?:the )?page", "reload (?:the )?page", "press f5", "hit refresh"],
    [() => ({})],
    ["Refresh the page", "Reload", "Press F5"],
    85,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SCROLL ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const scrollPatterns: GrammarPattern[] = [
  createPattern(
    "scroll_direction",
    "scroll",
    [
      "scroll (up|down|left|right)",
      "scroll (up|down|left|right) (?:by )?(\\d+)?",
      "swipe (up|down|left|right)",
    ],
    [
      (match) => ({
        direction: match[1]?.toLowerCase() as ActionParams["direction"],
        numericValue: match[2] ? parseInt(match[2], 10) : 500,
      }),
    ],
    ["Scroll down", "Scroll up by 300", "Swipe left"],
    90,
  ),

  createPattern(
    "scroll_to",
    "scrollTo",
    ["scroll to (?:the )?(.+)", "scroll (?:the )?page to (?:the )?(.+)", "jump to (?:the )?(.+)"],
    [extractTarget],
    ["Scroll to the footer", "Scroll page to the submit button"],
    85,
  ),

  createPattern(
    "scroll_top_bottom",
    "scrollTo",
    ["scroll to (top|bottom)", "go to (top|bottom) (?:of )?(?:the )?page"],
    [(match) => ({ direction: match[1]?.toLowerCase() as ActionParams["direction"] })],
    ["Scroll to top", "Go to bottom of the page"],
    85,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// WAIT ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const waitPatterns: GrammarPattern[] = [
  createPattern(
    "wait_duration",
    "wait",
    [
      "wait (?:for )?(\\d+) seconds?",
      "wait (?:for )?(\\d+) ms",
      "wait (?:for )?(\\d+) milli",
      "pause (?:for )?(\\d+) seconds?",
      "sleep (?:for )?(\\d+) seconds?",
    ],
    [
      (match) => {
        const num = parseInt(match[1], 10);
        return {
          timeout: isNaN(num) ? undefined : num * 1000,
          numericValue: isNaN(num) ? undefined : num,
        };
      },
    ],
    ["Wait 3 seconds", "Wait for 500 ms", "Pause for 2 seconds"],
    90,
  ),

  createPattern(
    "wait_for_element",
    "wait",
    [
      "wait for (?:the )?(.+?)(?: to (appear|disappear|be visible|be hidden))?$",
      "wait until (?:the )?(.+?)(?: is (visible|hidden|ready|loaded))?$",
    ],
    [
      (match) => {
        const baseTarget = match[1]?.trim() ?? "";
        const suffix = match[2]?.trim();
        const fullTarget = suffix ? `${baseTarget} to ${suffix}` : baseTarget;
        return {
          target: fullTarget,
          timeout: 30000,
        };
      },
    ],
    ["Wait for the modal to appear", "Wait until the page is loaded"],
    85,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// KEYBOARD ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const keyboardPatterns: GrammarPattern[] = [
  createPattern(
    "enter_key",
    "press",
    ["press enter", "hit enter", "press the enter key", "type enter"],
    [() => ({ key: "Enter" })],
    ["Press enter", "Hit Enter"],
    110,
  ),

  createPattern(
    "escape_key",
    "press",
    ["press escape", "hit escape", "press esc", "click escape", "press the escape key"],
    [() => ({ key: "Escape" })],
    ["Press escape", "Hit Esc"],
    110,
  ),

  createPattern(
    "press_key",
    "press",
    ["press (?:the )?(.+?) key", "hit (?:the )?(.+?) key"],
    [extractKey],
    ["Press Enter key", "Hit the Escape key", "Press Tab"],
    90,
  ),

  createPattern(
    "key_combo",
    "keyCombo",
    ["press (.+?) and (.+) together", "hold (.+?) and press (.+)"],
    [(match) => ({ key: `${match[1]}+${match[2]}` })],
    ["Press Ctrl+S", "Press Shift and Tab together", "Hold Alt and press F4"],
    85,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// HOVER/FOCUS ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const hoverPatterns: GrammarPattern[] = [
  createPattern(
    "hover",
    "hover",
    [
      "hover over (?:the )?(.+)",
      "hover on (?:the )?(.+)",
      "mouse over (?:the )?(.+)",
      "move mouse to (?:the )?(.+)",
    ],
    [extractTarget],
    ["Hover over the menu", "Mouse over the image"],
    85,
  ),

  createPattern(
    "focus",
    "focus",
    ["focus (?:on )?(?:the )?(.+)", "click on (?:the )?(.+?) to focus"],
    [extractTarget],
    ["Focus the input field", "Click on the textbox to focus"],
    80,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// ASSERTION/VERIFICATION ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const assertPatterns: GrammarPattern[] = [
  createPattern(
    "assert_visible",
    "assert",
    [
      "verify (?:the )?(.+?) is visible",
      "check (?:the )?(.+?) is visible",
      "assert (?:the )?(.+?) is visible",
      "expect (?:the )?(.+?) to be visible",
    ],
    [(match) => ({ target: match[1]?.trim(), assertion: "visible" })],
    ["Verify the button is visible", "Check the modal is visible"],
    90,
  ),

  createPattern(
    "assert_text",
    "assert",
    [
      "verify (?:the )?(.+?) (?:contains|has) ['\"]?([^'\"]+)['\"]?",
      "check (?:the )?(.+?) (?:contains|has) ['\"]?([^'\"]+)['\"]?",
      "assert (?:the )?(.+?) (?:contains|has) ['\"]?([^'\"]+)['\"]?",
    ],
    [
      (match) => ({
        target: match[1]?.trim(),
        assertion: "containsText",
        expectedValue: match[2]?.trim(),
      }),
    ],
    ["Verify the header contains Welcome", "Check the page has Error message"],
    110,
  ),

  createPattern(
    "assert_url",
    "assert",
    [
      "verify (?:the )?url (?:contains|is) ['\"]?(.+?)['\"]?",
      "check (?:the )?url (?:contains|is) ['\"]?(.+?)['\"]?",
      "assert (?:the )?url (?:contains|is) ['\"]?(.+?)['\"]?",
    ],
    [(match) => ({ assertion: "urlContains", expectedValue: match[1]?.trim() })],
    ["Verify the URL contains /dashboard", "Check the URL is correct"],
    85,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// FILE ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const filePatterns: GrammarPattern[] = [
  createPattern(
    "upload_file",
    "upload",
    [
      "upload ['\"]?(.+?)['\"]? (?:to )?(?:the )?(.+)",
      "select ['\"]?(.+?)['\"]? (?:to )?upload",
      "attach ['\"]?(.+?)['\"]? (?:to )?(?:the )?(.+)",
    ],
    [(match) => ({ filePath: match[1]?.trim(), target: match[2]?.trim() })],
    ["Upload profile.jpg to the avatar field", "Select document.pdf to upload"],
    85,
  ),

  createPattern(
    "download_file",
    "download",
    ["download (?:the )?(.+)", "save (?:the )?(.+?) (?:to )?['\"]?(.+?)['\"]?"],
    [(match) => ({ target: match[1]?.trim(), filePath: match[2]?.trim() })],
    ["Download the report", "Save the image to downloads"],
    80,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// DRAG AND DROP ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const dragDropPatterns: GrammarPattern[] = [
  createPattern(
    "drag_drop",
    "drag",
    [
      "drag (?:the )?(.+?) to (?:the )?(.+)",
      "move (?:the )?(.+?) to (?:the )?(.+)",
      "drag and drop (?:the )?(.+?) (?:on|to) (?:the )?(.+)",
    ],
    [(match) => ({ target: match[1]?.trim(), value: match[2]?.trim() })],
    ["Drag the file to the folder", "Drag and drop the item to the cart"],
    80,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// TAB/FRAME ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const tabPatterns: GrammarPattern[] = [
  createPattern(
    "switch_tab",
    "switchTo",
    ["switch to (?:the )?(.+?) tab", "switch to (?:the )?(.+?) window", "go to (?:the )?(.+?) tab"],
    [(match) => ({ frame: match[1]?.trim() })],
    ["Switch to the second tab", "Go to the popup window"],
    80,
  ),

  createPattern(
    "close_tab",
    "close",
    ["close (?:the )?(.+?) tab", "close (?:the )?current tab", "close (?:the )?window"],
    [(match) => ({ target: match[1]?.trim() || "current tab" })],
    ["Close the current tab", "Close the popup window"],
    80,
  ),
];

// ═══════════════════════════════════════════════════════════════════════════════
// ALL PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

export const allPatterns: GrammarPattern[] = [
  ...clickPatterns,
  ...typePatterns,
  ...selectPatterns,
  ...navigationPatterns,
  ...scrollPatterns,
  ...waitPatterns,
  ...keyboardPatterns,
  ...hoverPatterns,
  ...assertPatterns,
  ...filePatterns,
  ...dragDropPatterns,
  ...tabPatterns,
];

/** Get patterns sorted by priority */
export const getPatternsByPriority = (): GrammarPattern[] => {
  return [...allPatterns].sort((a, b) => b.priority - a.priority);
};

/** Get patterns by action type */
export const getPatternsByType = (actionType: ActionType): GrammarPattern[] => {
  return allPatterns.filter((p) => p.actionType === actionType);
};

/** Get all supported action types */
export const getSupportedActionTypes = (): ActionType[] => {
  return Array.from(new Set(allPatterns.map((p) => p.actionType)));
};

/** Count total patterns */
export const getPatternCount = (): number => allPatterns.length;
