// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Element & Page Snapshot Types
// ──────────────────────────────────────────────────────────────────────────────

/** Tool/interaction mode for the agent */
export type AgentMode = 'dom' | 'hybrid' | 'cua';

/** Vision mode setting */
export type VisionMode = 'enabled' | 'disabled' | 'auto';

/** Vision detail level */
export type VisionDetail = 'auto' | 'low' | 'high';

/** Snapshot capture mode */
export type SnapshotMode = 'screenshot' | 'snapshot' | 'annotated';

/** Bounding rectangle for an element */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Combined ARIA + DOM snapshot of a single element.
 */
export interface ElementSnapshot {
  ref: string;
  role: string;
  name: string;
  xpath: string;
  cssSelector?: string;
  skyvernId?: string;
  bounds: BoundingBox;
  visible: boolean;
  interactable: boolean;
  tagName?: string;
  textContent?: string;
  value?: string;
  attributes?: Record<string, string>;
  ariaProperties?: Record<string, string>;
  children?: ElementSnapshot[];
  parentRef?: string;
  frameId?: string;
  inShadowDom?: boolean;
}

/** Vision-based action produced when DOM/ARIA snapshots fail */
export interface VisionAction {
  type: 'click' | 'type' | 'scroll' | 'drag' | 'hover' | 'doubleClick' | 'rightClick' | 'select';
  coordinates: { x: number; y: number };
  endCoordinates?: { x: number; y: number };
  confidence: number;
  description: string;
  text?: string;
  scrollDelta?: { x: number; y: number };
  elementLabel?: string;
}

/** Request for vision-based element detection */
export interface VisionDetectionRequest {
  screenshot: string;
  instruction: string;
  provider: 'openai' | 'google' | 'anthropic';
  model?: string;
}

/** Console message captured from the page */
export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  text: string;
  timestamp: number;
  location?: { url: string; lineNumber: number; columnNumber?: number };
}

/** Network request captured from the page */
export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  resourceType: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  timing?: { startTime: number; endTime: number; duration: number };
  bodySize?: number;
  failed?: boolean;
  failureText?: string;
}

/** Information about a frame (iframe) on the page */
export interface FrameInfo {
  id: string;
  name: string;
  url: string;
  parentId?: string;
  isOOPIF?: boolean;
  bounds?: BoundingBox;
  children: FrameInfo[];
}

/** Full page snapshot combining DOM, ARIA, and metadata */
export interface PageSnapshot {
  url: string;
  title: string;
  elements: ElementSnapshot[];
  timestamp: number;
  viewport?: { width: number; height: number };
  screenshot?: string;
  consoleMessages?: ConsoleMessage[];
  networkRequests?: NetworkRequest[];
  fingerprint?: string;
  frames?: FrameInfo[];
}

/** Stats about an ARIA snapshot */
export interface SnapshotStats {
  lineCount: number;
  charCount: number;
  tokenEstimate: number;
  refCount: number;
  interactiveCount: number;
}

/** DOM node for hybrid tree merging */
export interface DOMNode {
  nodeType: number;
  tagName?: string;
  attributes?: Record<string, string>;
  textContent?: string;
  bounds?: BoundingBox;
  visible?: boolean;
  children?: DOMNode[];
}

/** Hybrid ARIA+DOM node */
export interface HybridNode {
  ref: string;
  role: string;
  name: string;
  tagName: string;
  xpath: string;
  cssSelector: string;
  bounds?: BoundingBox;
  interactive: boolean;
  visible: boolean;
  textContent?: string;
  attributes?: Record<string, string>;
  ariaProperties?: Record<string, string>;
  children?: HybridNode[];
  frameId?: string;
}

/** Screenshot capture options */
export interface ScreenshotOptions {
  fullPage?: boolean;
  path?: string;
  type?: 'png' | 'jpeg';
  quality?: number;
  clip?: { x: number; y: number; width: number; height: number };
  omitBackground?: boolean;
}

/** PDF save options */
export interface PDFOptions {
  path?: string;
  format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
  landscape?: boolean;
  printBackground?: boolean;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  scale?: number;
  headerTemplate?: string;
  footerTemplate?: string;
  pageRanges?: string;
  width?: string | number;
  height?: string | number;
}
