import { describe, it, expect } from "vitest";
import { GenerationError, ValidationError } from "./test-generator.js";
import { CodegenFromRecording } from "./codegen-from-recording.js";
import { UserSessionRecorder, type RecordingOptions } from "./user-session-recorder.js";

describe("GenerationError", () => {
  it("should have correct _tag", () => {
    const error = new GenerationError({ spec: "login test", cause: "missing import" });
    expect(error._tag).toBe("GenerationError");
  });

  it("should include spec in message", () => {
    const error = new GenerationError({ spec: "login test", cause: "missing import" });
    expect(error.message).toContain("login test");
  });
});

describe("ValidationError", () => {
  it("should have correct _tag", () => {
    const error = new ValidationError({ code: "test()", cause: "syntax error" });
    expect(error._tag).toBe("ValidationError");
  });

  it("should have default message", () => {
    const error = new ValidationError({ code: "test()", cause: "syntax error" });
    expect(error.message).toBe("Generated test validation failed");
  });
});

describe("CodegenFromRecording", () => {
  const recorder = new CodegenFromRecording();

  it("should generate a playwright test from a recording", () => {
    const recording = {
      id: "rec-1",
      url: "https://example.com",
      startTime: Date.now(),
      actions: [
        {
          id: "act-1",
          type: "navigate" as const,
          timestamp: Date.now(),
          selector: "",
          value: "https://example.com/login",
        },
        {
          id: "act-2",
          type: "click" as const,
          timestamp: Date.now(),
          selector: "#submit",
        },
      ],
    };

    const code = recorder.generatePlaywrightTest(recording);

    expect(code).toContain("import { test, expect }");
    expect(code).toContain("page.goto('https://example.com')");
    expect(code).toContain("page.locator('#submit').click()");
    expect(code).toContain("});");
  });

  it("should use custom test name when provided", () => {
    const recording = {
      id: "rec-2",
      url: "https://example.com",
      startTime: Date.now(),
      actions: [],
    };

    const code = recorder.generatePlaywrightTest(recording, { testName: "Custom name" });

    expect(code).toContain("test('Custom name'");
  });

  it("should generate a page object from a recording", () => {
    const recording = {
      id: "rec-3",
      url: "https://example.com",
      startTime: Date.now(),
      actions: [
        {
          id: "act-1",
          type: "click" as const,
          timestamp: Date.now(),
          selector: "#login-btn",
        },
        {
          id: "act-2",
          type: "fill" as const,
          timestamp: Date.now(),
          selector: "#username",
          value: "test",
        },
      ],
    };

    const code = recorder.generatePageObject(recording, "login");

    expect(code).toContain("export class LoginPage");
    expect(code).toContain("readonly page: Page");
    expect(code).toContain("page.locator('#login-btn')");
  });

  it("should throw when generating inspect test plan (not implemented)", () => {
    const recording = {
      id: "rec-4",
      url: "https://example.com",
      startTime: Date.now(),
      actions: [],
    };

    expect(() => recorder.generateInspectTestPlan(recording)).toThrow("Not implemented");
  });

  it("should throw when refining selectors (not implemented)", async () => {
    const recording = {
      id: "rec-5",
      url: "https://example.com",
      startTime: Date.now(),
      actions: [],
    };

    await expect(recorder.refineSelectors(recording)).rejects.toThrow("Not implemented");
  });
});

describe("UserSessionRecorder", () => {
  const recorder = new UserSessionRecorder();

  const mockPage = {
    url: () => "https://example.com",
    on: () => () => {},
  };

  it("should start a recording and return an id", async () => {
    const id = await recorder.startRecording(mockPage as any);
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
  });

  it("should return a recording when stopped", async () => {
    const id = await recorder.startRecording(mockPage as any);
    const recording = await recorder.stopRecording(id);
    expect(recording.id).toBe(id);
    expect(recording.endTime).toBeDefined();
  });

  it("should throw when stopping a nonexistent recording", async () => {
    await expect(recorder.stopRecording("nonexistent")).rejects.toThrow("Recording not found");
  });

  it("should pause and resume a recording", async () => {
    const id = await recorder.startRecording(mockPage as any);
    recorder.pauseRecording(id);
    recorder.resumeRecording(id);
    expect(recorder.isRecording(id)).toBe(true);
    await recorder.stopRecording(id);
  });

  it("should report isRecording correctly", async () => {
    const id = await recorder.startRecording(mockPage as any);
    expect(recorder.isRecording(id)).toBe(true);
    await recorder.stopRecording(id);
    expect(recorder.isRecording(id)).toBe(false);
  });

  it("should return null for nonexistent recording", () => {
    expect(recorder.getRecording("nonexistent")).toBeNull();
  });

  it("should list recordings", async () => {
    const id = await recorder.startRecording(mockPage as any);
    await recorder.stopRecording(id);
    const recordings = recorder.listRecordings();
    expect(recordings.length).toBeGreaterThan(0);
  });

  it("should delete a recording", async () => {
    const id = await recorder.startRecording(mockPage as any);
    await recorder.stopRecording(id);
    recorder.deleteRecording(id);
    expect(recorder.getRecording(id)).toBeNull();
  });

  it("should export recording as JSON", async () => {
    const id = await recorder.startRecording(mockPage as any);
    await recorder.stopRecording(id);
    const json = recorder.exportRecording(id, "json");
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(id);
  });

  it("should throw when exporting nonexistent recording", () => {
    expect(() => recorder.exportRecording("nonexistent", "json")).toThrow("Recording not found");
  });
});
