// Playwright Page interface - to be imported from playwright package
interface Page {
  url: () => string;
  on: (event: string, handler: () => void) => () => void;
}

export interface RecordedAction {
  readonly id: string;
  readonly type:
    | "navigate"
    | "click"
    | "fill"
    | "select"
    | "check"
    | "uncheck"
    | "scroll"
    | "hover"
    | "keypress";
  readonly timestamp: number;
  readonly selector: string;
  readonly value?: string;
  readonly options?: Record<string, unknown>;
}

export interface UserSessionRecording {
  readonly id: string;
  readonly url: string;
  readonly startTime: number;
  readonly endTime?: number;
  readonly actions: RecordedAction[];
  readonly generatedCode?: string;
}

export interface RecordingOptions {
  readonly captureScreenshots: boolean;
  readonly captureNetwork: boolean;
  readonly generateSelectors: "css" | "xpath" | "aria";
  readonly waitForStability: boolean;
  readonly stabilityTimeout: number;
}

const DEFAULT_OPTIONS: RecordingOptions = {
  captureScreenshots: false,
  captureNetwork: false,
  generateSelectors: "css",
  waitForStability: true,
  stabilityTimeout: 500,
};

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

interface RecordingState {
  recording: UserSessionRecording;
  options: RecordingOptions;
  page: Page;
  isPaused: boolean;
  listeners: Array<() => void>;
}

export class UserSessionRecorder {
  private recordings: Map<string, RecordingState> = new Map();

  startRecording = async (page: Page, options?: Partial<RecordingOptions>): Promise<string> => {
    const recordingId = generateId();
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

    const recording: UserSessionRecording = {
      id: recordingId,
      url: page.url(),
      startTime: Date.now(),
      actions: [],
    };

    const state: RecordingState = {
      recording,
      options: mergedOptions,
      page,
      isPaused: false,
      listeners: [],
    };

    this.recordings.set(recordingId, state);
    this.attachListeners(state);

    return recordingId;
  };

  stopRecording = async (recordingId: string): Promise<UserSessionRecording> => {
    const state = this.recordings.get(recordingId);
    if (!state) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    this.detachListeners(state);

    const recording = state.recording;
    const completedRecording = {
      ...recording,
      endTime: Date.now(),
    };

    this.recordings.set(recordingId, {
      ...state,
      recording: completedRecording,
    });

    return completedRecording;
  };

  pauseRecording = (recordingId: string): void => {
    const state = this.recordings.get(recordingId);
    if (state) {
      state.isPaused = true;
    }
  };

  resumeRecording = (recordingId: string): void => {
    const state = this.recordings.get(recordingId);
    if (state) {
      state.isPaused = false;
    }
  };

  isRecording = (recordingId: string): boolean => {
    const state = this.recordings.get(recordingId);
    return state !== undefined && !state.recording.endTime;
  };

  getRecording = (recordingId: string): UserSessionRecording | null => {
    return this.recordings.get(recordingId)?.recording ?? null;
  };

  listRecordings = (): UserSessionRecording[] => {
    return Array.from(this.recordings.values()).map((state) => state.recording);
  };

  deleteRecording = (recordingId: string): void => {
    const state = this.recordings.get(recordingId);
    if (state) {
      this.detachListeners(state);
      this.recordings.delete(recordingId);
    }
  };

  exportRecording = (recordingId: string, format: "json" | "typescript"): string => {
    const recording = this.getRecording(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (format === "json") {
      return JSON.stringify(recording, null, 2);
    }

    return this.generateTypeScriptCode(recording);
  };

  private generateTypeScriptCode = (recording: UserSessionRecording): string => {
    const lines: string[] = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('Recorded session', async ({ page }) => {`,
    ];

    for (const action of recording.actions) {
      const comment = `  // ${action.type} at ${new Date(action.timestamp).toISOString()}`;
      lines.push(comment);

      switch (action.type) {
        case "navigate":
          lines.push(`  await page.goto('${action.value}');`);
          break;
        case "click":
          lines.push(`  await page.locator('${action.selector}').click();`);
          break;
        case "fill":
          lines.push(`  await page.locator('${action.selector}').fill('${action.value}');`);
          break;
        case "select":
          lines.push(`  await page.locator('${action.selector}').selectOption('${action.value}');`);
          break;
        case "check":
          lines.push(`  await page.locator('${action.selector}').check();`);
          break;
        case "uncheck":
          lines.push(`  await page.locator('${action.selector}').uncheck();`);
          break;
        case "hover":
          lines.push(`  await page.locator('${action.selector}').hover();`);
          break;
      }
    }

    lines.push(`});`);
    return lines.join("\n");
  };

  private attachListeners = (state: RecordingState): void => {
    const { page } = state;

    const clickHandler = page.on("click", () => {
      if (state.isPaused) return;

      const action: RecordedAction = {
        id: generateId(),
        type: "click",
        timestamp: Date.now(),
        selector: "",
      };

      state.recording.actions.push(action);
    });

    state.listeners.push(clickHandler);
  };

  private detachListeners = (state: RecordingState): void => {
    for (const removeListener of state.listeners) {
      removeListener();
    }
    state.listeners = [];
  };
}
