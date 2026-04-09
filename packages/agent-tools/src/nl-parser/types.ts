// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent-tools - Natural Language Parser Types
// ──────────────────────────────────────────────────────────────────────────────

/** Parsed action from natural language instruction */
export interface ParsedAction {
  /** Action type */
  type: ActionType;
  /** Action parameters */
  params: ActionParams;
  /** Confidence score (0-1) */
  confidence: number;
  /** Original instruction */
  originalInstruction: string;
  /** Matched pattern */
  matchedPattern: string;
  /** Extracted entities */
  entities: ExtractedEntity[];
}

/** Supported action types */
export type ActionType =
  | "click"
  | "doubleClick"
  | "rightClick"
  | "type"
  | "fill"
  | "clear"
  | "select"
  | "check"
  | "uncheck"
  | "hover"
  | "focus"
  | "blur"
  | "scroll"
  | "scrollTo"
  | "navigate"
  | "goBack"
  | "goForward"
  | "refresh"
  | "wait"
  | "pause"
  | "upload"
  | "download"
  | "drag"
  | "drop"
  | "swipe"
  | "pinch"
  | "tap"
  | "press"
  | "keyCombo"
  | "screenshot"
  | "assert"
  | "verify"
  | "extract"
  | "search"
  | "find"
  | "close"
  | "open"
  | "switchTo"
  | "accept"
  | "dismiss"
  | "custom";

/** Action parameters */
export interface ActionParams {
  /** Target element description */
  target?: string;
  /** CSS selector if available */
  selector?: string;
  /** Text value to type/select */
  value?: string;
  /** Numeric value (scroll amount, wait time, etc.) */
  numericValue?: number;
  /** URL for navigation */
  url?: string;
  /** Direction for scroll/swipe */
  direction?: "up" | "down" | "left" | "right" | "top" | "bottom";
  /** Key or key combination */
  key?: string;
  /** File path for upload/download */
  filePath?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Assertion type */
  assertion?: AssertionType;
  /** Expected value for assertion */
  expectedValue?: string;
  /** Frame or tab identifier */
  frame?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Assertion types */
export type AssertionType =
  | "visible"
  | "hidden"
  | "enabled"
  | "disabled"
  | "checked"
  | "unchecked"
  | "containsText"
  | "hasText"
  | "equals"
  | "exists"
  | "notExists"
  | "urlContains"
  | "urlEquals"
  | "titleContains"
  | "titleEquals";

/** Extracted entity from instruction */
export interface ExtractedEntity {
  /** Entity type */
  type: EntityType;
  /** Entity value */
  value: string;
  /** Position in original text */
  position: { start: number; end: number };
  /** Confidence score */
  confidence: number;
}

/** Entity types */
export type EntityType =
  | "element"
  | "button"
  | "link"
  | "input"
  | "dropdown"
  | "checkbox"
  | "radio"
  | "text"
  | "number"
  | "url"
  | "email"
  | "selector"
  | "key"
  | "file"
  | "time"
  | "direction"
  | "tab"
  | "frame";

/** Grammar pattern for matching instructions */
export interface GrammarPattern {
  /** Pattern name */
  name: string;
  /** Regex patterns to match */
  patterns: RegExp[];
  /** Action type produced */
  actionType: ActionType;
  /** Parameter extractors */
  extractors: ParameterExtractor[];
  /** Pattern priority (higher = checked first) */
  priority: number;
  /** Example phrases that match */
  examples: string[];
}

/** Parameter extractor function */
export type ParameterExtractor = (
  match: RegExpMatchArray,
  instruction: string,
) => Partial<ActionParams>;

/** Parser configuration */
export interface ParserConfig {
  /** Enable fuzzy matching */
  fuzzyMatching: boolean;
  /** Minimum confidence threshold */
  minConfidence: number;
  /** Custom patterns to add */
  customPatterns?: GrammarPattern[];
  /** Maximum parsing time in ms */
  maxParseTime: number;
  /** Enable entity recognition */
  entityRecognition: boolean;
  /** Case sensitive matching */
  caseSensitive: boolean;
}

export const DEFAULT_PARSER_CONFIG: ParserConfig = {
  fuzzyMatching: true,
  minConfidence: 0.6,
  maxParseTime: 100,
  entityRecognition: true,
  caseSensitive: false,
};

/** Parse result with alternatives */
export interface ParseResult {
  /** Best parsed action */
  bestMatch: ParsedAction | null;
  /** Alternative parses */
  alternatives: ParsedAction[];
  /** Whether parsing succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Parse time in ms */
  parseTime: number;
}

/** Element descriptor extracted from text */
export interface ElementDescriptor {
  /** Element type */
  type?: string;
  /** Element text/content */
  text?: string;
  /** ARIA role */
  role?: string;
  /** Partial text match */
  partialText?: string;
  /** Index if multiple ("first", "second", "last", number) */
  index?: string | number;
  /** Attributes (id, class, etc.) */
  attributes?: Record<string, string>;
}
