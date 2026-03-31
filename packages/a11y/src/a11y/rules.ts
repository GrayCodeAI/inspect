// ============================================================================
// @inspect/quality - Accessibility Rule Definitions
// ============================================================================

import type { A11yImpact } from "@inspect/shared";

/** Single accessibility rule definition */
export interface A11yRuleDefinition {
  /** axe-core rule id */
  id: string;
  /** Severity impact */
  impact: A11yImpact;
  /** WCAG and category tags */
  tags: string[];
  /** Human-readable description */
  description: string;
}

// ---------------------------------------------------------------------------
// 105 Rule Definitions organized by category
// ---------------------------------------------------------------------------

const aria: A11yRuleDefinition[] = [
  { id: "aria-allowed-attr", impact: "critical", tags: ["wcag2a", "cat.aria"], description: "ARIA attributes must be allowed for the element's role" },
  { id: "aria-allowed-role", impact: "minor", tags: ["wcag2a", "cat.aria"], description: "ARIA role must be allowed for the element" },
  { id: "aria-command-name", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "ARIA commands must have an accessible name" },
  { id: "aria-dialog-name", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "ARIA dialog and alertdialog nodes must have an accessible name" },
  { id: "aria-hidden-body", impact: "critical", tags: ["wcag2a", "cat.aria"], description: "aria-hidden='true' must not be present on the document body" },
  { id: "aria-hidden-focus", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "aria-hidden elements must not contain focusable elements" },
  { id: "aria-input-field-name", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "ARIA input fields must have an accessible name" },
  { id: "aria-meter-name", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "ARIA meter nodes must have an accessible name" },
  { id: "aria-progressbar-name", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "ARIA progressbar nodes must have an accessible name" },
  { id: "aria-required-attr", impact: "critical", tags: ["wcag2a", "cat.aria"], description: "Required ARIA attributes must be provided" },
  { id: "aria-required-children", impact: "critical", tags: ["wcag2a", "cat.aria"], description: "ARIA roles must contain required child roles" },
  { id: "aria-required-parent", impact: "critical", tags: ["wcag2a", "cat.aria"], description: "ARIA roles must be contained by required parent roles" },
  { id: "aria-roledescription", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "aria-roledescription must be on semantic roles" },
  { id: "aria-roles", impact: "critical", tags: ["wcag2a", "cat.aria"], description: "ARIA roles used must conform to valid values" },
  { id: "aria-toggle-field-name", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "ARIA toggle fields must have an accessible name" },
  { id: "aria-tooltip-name", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "ARIA tooltip nodes must have an accessible name" },
  { id: "aria-treeitem-name", impact: "serious", tags: ["wcag2a", "cat.aria"], description: "ARIA treeitem nodes must have an accessible name" },
  { id: "aria-valid-attr", impact: "critical", tags: ["wcag2a", "cat.aria"], description: "ARIA attributes must conform to valid names" },
  { id: "aria-valid-attr-value", impact: "critical", tags: ["wcag2a", "cat.aria"], description: "ARIA attributes must conform to valid values" },
];

const color: A11yRuleDefinition[] = [
  { id: "color-contrast", impact: "serious", tags: ["wcag2aa", "cat.color"], description: "Elements must meet minimum color contrast ratio thresholds" },
  { id: "color-contrast-enhanced", impact: "serious", tags: ["wcag2aaa", "cat.color"], description: "Elements must meet enhanced color contrast ratio thresholds" },
  { id: "link-in-text-block", impact: "serious", tags: ["wcag2a", "cat.color"], description: "Links within text blocks must be distinguishable without color" },
];

const forms: A11yRuleDefinition[] = [
  { id: "autocomplete-valid", impact: "serious", tags: ["wcag21aa", "cat.forms"], description: "autocomplete attribute must be used correctly" },
  { id: "form-field-multiple-labels", impact: "moderate", tags: ["wcag2a", "cat.forms"], description: "Form fields must not have multiple label elements" },
  { id: "input-button-name", impact: "critical", tags: ["wcag2a", "cat.forms"], description: "Input buttons must have discernible text" },
  { id: "input-image-alt", impact: "critical", tags: ["wcag2a", "cat.forms"], description: "Image buttons must have alternate text" },
  { id: "label", impact: "critical", tags: ["wcag2a", "cat.forms"], description: "Form elements must have labels" },
  { id: "label-content-name-mismatch", impact: "serious", tags: ["wcag21a", "cat.forms"], description: "Label and name from content must match" },
  { id: "label-title-only", impact: "serious", tags: ["wcag2a", "cat.forms"], description: "Form elements should not have title attribute as their only label" },
  { id: "select-name", impact: "critical", tags: ["wcag2a", "cat.forms"], description: "Select elements must have an accessible name" },
];

const keyboard: A11yRuleDefinition[] = [
  { id: "accesskeys", impact: "serious", tags: ["wcag2a", "cat.keyboard"], description: "accesskey attribute value must be unique" },
  { id: "focus-order-semantics", impact: "minor", tags: ["wcag2a", "cat.keyboard"], description: "Elements in the focus order need a role appropriate for interactive content" },
  { id: "focusable-disabled", impact: "serious", tags: ["wcag2a", "cat.keyboard"], description: "Disabled elements should not be in tab order" },
  { id: "focusable-modal-open", impact: "serious", tags: ["wcag2a", "cat.keyboard"], description: "Focus must be managed when a modal dialog opens" },
  { id: "focusable-no-name", impact: "serious", tags: ["wcag2a", "cat.keyboard"], description: "Focusable elements must have an accessible name" },
  { id: "frame-focusable-content", impact: "serious", tags: ["wcag2a", "cat.keyboard"], description: "Frames with focusable content must not have tabindex=-1" },
  { id: "logical-tab-order", impact: "minor", tags: ["wcag2a", "cat.keyboard"], description: "Focus order should be logical and intuitive" },
  { id: "no-positive-tabindex", impact: "serious", tags: ["wcag2a", "cat.keyboard"], description: "Tabindex should not be greater than zero" },
  { id: "page-has-heading-one", impact: "moderate", tags: ["wcag2a", "cat.keyboard"], description: "Page must contain a level-one heading" },
  { id: "scope-attr-valid", impact: "moderate", tags: ["wcag2a", "cat.keyboard"], description: "Scope attribute should be used correctly" },
  { id: "skip-link", impact: "moderate", tags: ["wcag2a", "cat.keyboard"], description: "Page must have means to bypass repeated blocks" },
  { id: "tabindex", impact: "serious", tags: ["wcag2a", "cat.keyboard"], description: "tabindex value must not be greater than 0" },
];

const language: A11yRuleDefinition[] = [
  { id: "html-has-lang", impact: "serious", tags: ["wcag2a", "cat.language"], description: "html element must have a lang attribute" },
  { id: "html-lang-valid", impact: "serious", tags: ["wcag2a", "cat.language"], description: "html element lang attribute must have a valid value" },
  { id: "html-xml-lang-mismatch", impact: "moderate", tags: ["wcag2a", "cat.language"], description: "HTML xml:lang and lang must match" },
  { id: "valid-lang", impact: "serious", tags: ["wcag2aa", "cat.language"], description: "lang attribute must have a valid value" },
];

const nameRoleValue: A11yRuleDefinition[] = [
  { id: "area-alt", impact: "critical", tags: ["wcag2a", "cat.name-role-value"], description: "Active area elements must have alternate text" },
  { id: "button-name", impact: "critical", tags: ["wcag2a", "cat.name-role-value"], description: "Buttons must have discernible text" },
  { id: "document-title", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "Documents must have title element to aid navigation" },
  { id: "duplicate-id", impact: "minor", tags: ["wcag2a", "cat.name-role-value"], description: "id attribute values must be unique" },
  { id: "duplicate-id-active", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "Active element IDs must be unique" },
  { id: "duplicate-id-aria", impact: "critical", tags: ["wcag2a", "cat.name-role-value"], description: "ARIA IDs must be unique" },
  { id: "frame-title", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "Frames must have an accessible name" },
  { id: "frame-title-unique", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "Frames must have a unique title attribute" },
  { id: "image-alt", impact: "critical", tags: ["wcag2a", "cat.name-role-value"], description: "Images must have alternate text" },
  { id: "image-redundant-alt", impact: "minor", tags: ["wcag2a", "cat.name-role-value"], description: "Image alt text must not duplicate adjacent text" },
  { id: "link-name", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "Links must have discernible text" },
  { id: "object-alt", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "Object elements must have alternate text" },
  { id: "role-img-alt", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "Elements with role='img' must have alt text" },
  { id: "scrollable-region-focusable", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "Scrollable region must have keyboard access" },
  { id: "svg-img-alt", impact: "serious", tags: ["wcag2a", "cat.name-role-value"], description: "SVG elements with img role must have alt text" },
];

const semantics: A11yRuleDefinition[] = [
  { id: "definition-list", impact: "serious", tags: ["wcag2a", "cat.semantics"], description: "dl elements must only contain dt and dd groups, div, script, or template" },
  { id: "dlitem", impact: "serious", tags: ["wcag2a", "cat.semantics"], description: "dt and dd elements must be in a dl" },
  { id: "landmark-banner-is-top-level", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Banner landmark must be top level" },
  { id: "landmark-complementary-is-top-level", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Aside must not be within another landmark" },
  { id: "landmark-contentinfo-is-top-level", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Contentinfo landmark must be top level" },
  { id: "landmark-main-is-top-level", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Main landmark must be top level" },
  { id: "landmark-no-duplicate-banner", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Page must not have more than one banner landmark" },
  { id: "landmark-no-duplicate-contentinfo", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Page must not have more than one contentinfo landmark" },
  { id: "landmark-no-duplicate-main", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Page must not have more than one main landmark" },
  { id: "landmark-one-main", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Page must have one main landmark" },
  { id: "landmark-unique", impact: "moderate", tags: ["wcag2a", "cat.semantics"], description: "Landmarks must have a unique role or accessible name" },
  { id: "list", impact: "serious", tags: ["wcag2a", "cat.semantics"], description: "ul and ol must only directly contain li, script, or template elements" },
  { id: "listitem", impact: "serious", tags: ["wcag2a", "cat.semantics"], description: "li elements must be in a ul or ol" },
  { id: "p-as-heading", impact: "serious", tags: ["wcag2a", "cat.semantics"], description: "Bold styled text must not be used as headings" },
];

const structure: A11yRuleDefinition[] = [
  { id: "bypass", impact: "serious", tags: ["wcag2a", "cat.structure"], description: "Page must have means to bypass repeated blocks of content" },
  { id: "heading-order", impact: "moderate", tags: ["wcag2a", "cat.structure"], description: "Heading levels should only increase by one" },
  { id: "identical-links-same-purpose", impact: "minor", tags: ["wcag2aaa", "cat.structure"], description: "Links with the same name must have the same purpose" },
  { id: "meta-refresh", impact: "critical", tags: ["wcag2a", "cat.structure"], description: "Timed refresh must not exist" },
  { id: "meta-viewport", impact: "critical", tags: ["wcag2aa", "cat.structure"], description: "Zooming and scaling must not be disabled" },
  { id: "meta-viewport-large", impact: "minor", tags: ["wcag2aaa", "cat.structure"], description: "Users should be able to zoom and scale the text up to 500%" },
  { id: "region", impact: "moderate", tags: ["wcag2a", "cat.structure"], description: "All page content must be contained by landmarks" },
];

const tables: A11yRuleDefinition[] = [
  { id: "table-duplicate-name", impact: "minor", tags: ["wcag2a", "cat.tables"], description: "Table caption and summary must not be the same" },
  { id: "table-fake-caption", impact: "serious", tags: ["wcag2a", "cat.tables"], description: "Data table caption must use caption element" },
  { id: "td-has-header", impact: "critical", tags: ["wcag2a", "cat.tables"], description: "Data cells in large tables must have associated header" },
  { id: "td-headers-attr", impact: "serious", tags: ["wcag2a", "cat.tables"], description: "Cells using headers attribute must refer to valid headers" },
  { id: "th-has-data-cells", impact: "serious", tags: ["wcag2a", "cat.tables"], description: "Table headers must refer to data cells" },
];

const textAlternatives: A11yRuleDefinition[] = [
  { id: "empty-heading", impact: "minor", tags: ["wcag2a", "cat.text-alternatives"], description: "Headings must not be empty" },
  { id: "empty-table-header", impact: "minor", tags: ["wcag2a", "cat.text-alternatives"], description: "Table header text must not be empty" },
  { id: "frame-tested", impact: "critical", tags: ["wcag2a", "cat.text-alternatives"], description: "iframes must be tested with axe-core" },
  { id: "nested-interactive", impact: "serious", tags: ["wcag2a", "cat.text-alternatives"], description: "Nested interactive controls are not announced by screen readers" },
  { id: "no-autoplay-audio", impact: "moderate", tags: ["wcag2a", "cat.text-alternatives"], description: "Video or audio elements must not autoplay audio" },
  { id: "presentation-role-conflict", impact: "minor", tags: ["wcag2a", "cat.text-alternatives"], description: "Elements with role=none/presentation must not have global ARIA attributes" },
  { id: "server-side-image-map", impact: "minor", tags: ["wcag2a", "cat.text-alternatives"], description: "Server-side image maps should not be used" },
  { id: "video-caption", impact: "critical", tags: ["wcag2a", "cat.text-alternatives"], description: "Video elements must have captions" },
];

const timeAndMedia: A11yRuleDefinition[] = [
  { id: "audio-caption", impact: "critical", tags: ["wcag2a", "cat.time-and-media"], description: "Audio elements must have a captions track" },
  { id: "blink", impact: "serious", tags: ["wcag2a", "cat.time-and-media"], description: "blink element must not be used" },
  { id: "marquee", impact: "serious", tags: ["wcag2a", "cat.time-and-media"], description: "marquee element must not be used" },
  { id: "video-description", impact: "critical", tags: ["wcag2a", "cat.time-and-media"], description: "Video elements must have audio description" },
];

/** All 105 a11y rules organized by category */
export const A11Y_RULES: Record<string, A11yRuleDefinition[]> = {
  aria,
  color,
  forms,
  keyboard,
  language,
  "name-role-value": nameRoleValue,
  semantics,
  structure,
  tables,
  "text-alternatives": textAlternatives,
  "time-and-media": timeAndMedia,
};

/** Flat array of all rules */
export const ALL_A11Y_RULES: A11yRuleDefinition[] = Object.values(A11Y_RULES).flat();

/** Get rules filtered by tag (e.g., "wcag2aa") */
export function getRulesByTag(tag: string): A11yRuleDefinition[] {
  return ALL_A11Y_RULES.filter((rule) => rule.tags.includes(tag));
}

/** Get rules filtered by impact level */
export function getRulesByImpact(impact: A11yImpact): A11yRuleDefinition[] {
  return ALL_A11Y_RULES.filter((rule) => rule.impact === impact);
}

/** Get rules filtered by category */
export function getRulesByCategory(category: string): A11yRuleDefinition[] {
  return A11Y_RULES[category] ?? [];
}

/** Get a single rule by ID */
export function getRuleById(id: string): A11yRuleDefinition | undefined {
  return ALL_A11Y_RULES.find((rule) => rule.id === id);
}
