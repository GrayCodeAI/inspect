// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Accessibility (a11y) Specialist Prompt
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Accessibility specialist system prompt supplement.
 * When active, the agent evaluates WCAG compliance and accessibility best practices.
 */
export const A11Y_SPECIALIST_PROMPT = `## Accessibility Specialist Mode

You are also acting as an accessibility testing specialist. Evaluate against WCAG 2.2 AA criteria:

### Perceivable (WCAG 1.x)
- **1.1.1 Non-text Content**: All images must have alt text. Decorative images should have empty alt=""
- **1.2.x Audio/Video**: Check for captions, transcripts, audio descriptions
- **1.3.1 Info and Relationships**: Headings use proper hierarchy (h1 > h2 > h3). Lists use ul/ol/dl. Tables have proper headers
- **1.3.2 Meaningful Sequence**: Reading order matches visual order
- **1.3.5 Identify Input Purpose**: Form fields use autocomplete attributes
- **1.4.1 Use of Color**: Information is not conveyed by color alone
- **1.4.3 Contrast**: Text has 4.5:1 contrast ratio (3:1 for large text)
- **1.4.4 Resize Text**: Page is usable at 200% zoom
- **1.4.10 Reflow**: Content reflows without horizontal scroll at 320px width
- **1.4.11 Non-text Contrast**: UI components and graphics have 3:1 contrast
- **1.4.12 Text Spacing**: Content adapts to modified text spacing

### Operable (WCAG 2.x)
- **2.1.1 Keyboard**: All functionality is available via keyboard
- **2.1.2 No Keyboard Trap**: Focus can be moved away from all elements
- **2.4.1 Bypass Blocks**: Skip navigation link is present
- **2.4.2 Page Titled**: Descriptive page titles
- **2.4.3 Focus Order**: Tab order is logical
- **2.4.4 Link Purpose**: Link text describes the destination
- **2.4.6 Headings and Labels**: Descriptive headings and form labels
- **2.4.7 Focus Visible**: Keyboard focus indicator is clearly visible
- **2.4.11 Focus Not Obscured**: Focused element is not fully hidden by other content
- **2.5.3 Label in Name**: Visible label matches accessible name
- **2.5.8 Target Size**: Clickable targets are at least 24x24px

### Understandable (WCAG 3.x)
- **3.1.1 Language of Page**: html lang attribute is set
- **3.1.2 Language of Parts**: Content in different languages is marked
- **3.2.1 On Focus**: No unexpected context change on focus
- **3.2.2 On Input**: No unexpected context change on input (without warning)
- **3.3.1 Error Identification**: Errors are clearly described in text
- **3.3.2 Labels or Instructions**: Form fields have labels
- **3.3.3 Error Suggestion**: Corrections are suggested when possible
- **3.3.4 Error Prevention**: Reversible submissions for legal/financial data

### Robust (WCAG 4.x)
- **4.1.2 Name, Role, Value**: Custom controls have proper ARIA
- **4.1.3 Status Messages**: Status updates use ARIA live regions

### ARIA Best Practices
- ARIA roles match the element's actual purpose
- Required ARIA attributes are present
- ARIA states reflect actual component state
- No duplicate IDs on the page
- ARIA landmarks are used (main, nav, banner, contentinfo)

### Reporting
For each accessibility finding:
- **WCAG Criterion**: e.g., 1.1.1 Non-text Content
- **Level**: A / AA / AAA
- **Impact**: who is affected (screen reader users, keyboard users, low vision, etc.)
- **Element**: specific element reference
- **Issue**: what is wrong
- **Fix**: how to resolve it`;

/**
 * WCAG success criteria quick reference for automated checks.
 */
export const WCAG_CHECKS = {
  /** Elements that require alt text */
  requiresAltText: ["img", "area", "input[type=image]"],
  /** Required document landmarks */
  requiredLandmarks: ["main", "navigation", "banner", "contentinfo"],
  /** Minimum contrast ratios */
  contrastRatios: {
    normalText: 4.5,
    largeText: 3.0,
    uiComponents: 3.0,
  },
  /** Minimum target size in pixels (WCAG 2.5.8) */
  minTargetSize: 24,
  /** Enhanced target size (WCAG 2.5.5 AAA) */
  enhancedTargetSize: 44,
  /** Required form input attributes */
  requiredFormAttributes: ["label", "aria-label", "aria-labelledby"],
  /** Interactive elements that must be keyboard accessible */
  keyboardRequired: [
    "a[href]", "button", "input", "select", "textarea",
    "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]",
    "[role=checkbox]", "[role=radio]", "[role=switch]",
  ],
} as const;

/**
 * Build an accessibility-focused test instruction.
 */
export function buildA11yInstruction(
  baseInstruction: string,
  wcagLevel: "A" | "AA" | "AAA" = "AA",
): string {
  return `${baseInstruction}

Additionally, while performing this test, evaluate accessibility at WCAG 2.2 Level ${wcagLevel}:
1. Tab through all interactive elements and verify keyboard accessibility
2. Check that all images have appropriate alt text
3. Verify heading hierarchy is correct
4. Ensure form fields have visible labels
5. Check color contrast of text against backgrounds
6. Verify focus indicators are visible
7. Check that ARIA roles and properties are correctly used
8. Verify page has proper landmark structure`;
}

/**
 * Common ARIA role expectations.
 */
export const ARIA_ROLE_REQUIREMENTS: Record<string, string[]> = {
  alertdialog: ["aria-label or aria-labelledby"],
  checkbox: ["aria-checked"],
  combobox: ["aria-expanded"],
  dialog: ["aria-label or aria-labelledby"],
  listbox: ["aria-label or aria-labelledby"],
  menu: ["aria-label or aria-labelledby"],
  menuitemcheckbox: ["aria-checked"],
  menuitemradio: ["aria-checked"],
  progressbar: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
  radio: ["aria-checked"],
  scrollbar: ["aria-controls", "aria-valuenow", "aria-valuemin", "aria-valuemax"],
  slider: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
  spinbutton: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
  switch: ["aria-checked"],
  tab: ["aria-selected"],
  tabpanel: ["aria-labelledby"],
  tree: ["aria-label or aria-labelledby"],
  treeitem: ["aria-expanded (if expandable)"],
};
