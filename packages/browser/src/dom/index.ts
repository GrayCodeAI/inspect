/**
 * DOM Module
 *
 * Multi-tree DOM collection (DOM + Accessibility + Snapshot)
 * for comprehensive page understanding.
 */

export {
  MultiTreeCollector,
  type MultiTreeCollection,
  type DOMTreeNode,
  type AXTreeNode,
  type DOMSnapshot,
  type EnhancedElement,
  type MultiTreeConfig,
  DEFAULT_MULTI_TREE_CONFIG,
} from "./multi-tree";

// Visibility checks
export { isElementVisible, type VisibilityOptions, DEFAULT_VISIBILITY_OPTIONS } from "./visibility";

// Interactability checks
export {
  checkElementInteractability,
  checkElementsInteractability,
  getClickableElements,
  getElementState,
  type InteractabilityResult,
  type InteractabilityOptions,
  type ElementState,
  DEFAULT_INTERACTABILITY_OPTIONS,
} from "./interactability";

// Form context extraction
export {
  extractFormStructure,
  findRelatedFields,
  validateFormField,
  type FormField,
  type FormStructure,
  type FieldGroup,
  type ValidationError,
} from "./form-context";
