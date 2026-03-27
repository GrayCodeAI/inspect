// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Session Recording & HAR Types
// ──────────────────────────────────────────────────────────────────────────────

export interface SessionRecording {
  planId: string;
  startTime: number;
  endTime?: number;
  events: RRWebEvent[];
}

export interface RRWebEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

export interface HARArchive {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HAREntry[];
  };
}

export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    bodySize: number;
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    content: { size: number; mimeType: string; text?: string };
    bodySize: number;
  };
  timings: { send: number; wait: number; receive: number };
}

export type RecordingFormat = 'rrweb' | 'video' | 'gif' | 'har';

export interface RecordingConfig {
  format: RecordingFormat;
  interval?: number;
  fps?: number;
  codec?: string;
  enabled: boolean;
}
