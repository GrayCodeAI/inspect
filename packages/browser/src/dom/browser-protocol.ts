// ============================================================================
// @inspect/browser - Browser Messaging Protocol
// ============================================================================
// Protocol types for browser-to-agent communication

export interface FrameMessage {
  type: "frame";
  data: string;
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp: number;
  };
}

export interface StatusMessage {
  type: "status";
  connected: boolean;
  screencasting: boolean;
  viewportWidth: number;
  viewportHeight: number;
  engine?: string;
  recording?: boolean;
}

export interface CommandMessage {
  type: "command";
  action: string;
  id: string;
  params: Record<string, unknown>;
  timestamp: number;
}

export interface ResultMessage {
  type: "result";
  id: string;
  action: string;
  success: boolean;
  data: unknown;
  duration_ms: number;
  timestamp: number;
}

export type BrowserMessage = FrameMessage | StatusMessage | CommandMessage | ResultMessage;

export function createCommandMessage(
  action: string,
  params: Record<string, unknown> = {},
): CommandMessage {
  return {
    type: "command",
    action,
    id: crypto.randomUUID(),
    params,
    timestamp: Date.now(),
  };
}

export function createResultMessage(
  id: string,
  action: string,
  success: boolean,
  data: unknown,
  duration_ms: number,
): ResultMessage {
  return {
    type: "result",
    id,
    action,
    success,
    data,
    duration_ms,
    timestamp: Date.now(),
  };
}
