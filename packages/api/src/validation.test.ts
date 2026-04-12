import { describe, it, expect } from "vitest";
import {
  CreateTaskSchema,
  CreateWorkflowSchema,
  SpawnRunSchema,
  CreateCredentialSchema,
  validateBody,
  BrowserError,
  WorkflowError,
  CredentialError,
  NetworkError,
} from "@inspect/shared";

describe("validateBody", () => {
  it("should return success for valid data", () => {
    const result = validateBody(CreateTaskSchema, {
      prompt: "test login",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe("test login");
      expect(result.data.url).toBe("https://example.com");
      expect(result.data.maxSteps).toBe(25);
    }
  });

  it("should return error for missing required fields", () => {
    const result = validateBody(CreateTaskSchema, { prompt: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("prompt");
    }
  });

  it("should return error for invalid URL", () => {
    const result = validateBody(CreateTaskSchema, {
      prompt: "test",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("url");
    }
  });

  it("should reject non-http protocols", () => {
    const result = validateBody(CreateTaskSchema, {
      prompt: "test",
      url: "not-a-valid-url",
    });
    expect(result.success).toBe(false);
  });

  it("should reject maxSteps above 100", () => {
    const result = validateBody(CreateTaskSchema, {
      prompt: "test",
      url: "https://example.com",
      maxSteps: 999,
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateWorkflowSchema", () => {
  it("should accept valid workflow data", () => {
    const result = validateBody(CreateWorkflowSchema, {
      name: "My Workflow",
      status: "active",
      tags: ["test", "ci"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Workflow");
      expect(result.data.status).toBe("active");
    }
  });

  it("should reject invalid status", () => {
    const result = validateBody(CreateWorkflowSchema, {
      name: "Test",
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("should reject non-array tags", () => {
    const result = validateBody(CreateWorkflowSchema, {
      name: "Test",
      tags: "not-an-array",
    });
    expect(result.success).toBe(false);
  });
});

describe("SpawnRunSchema", () => {
  it("should accept valid spawn config", () => {
    const result = validateBody(SpawnRunSchema, {
      instruction: "Run tests",
      devices: ["iPhone 14", "Desktop"],
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty devices array", () => {
    const result = validateBody(SpawnRunSchema, {
      instruction: "Run tests",
      devices: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateCredentialSchema", () => {
  it("should accept valid credential", () => {
    const result = validateBody(CreateCredentialSchema, {
      type: "api-key",
      label: "My API Key",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe("native");
    }
  });

  it("should reject invalid type", () => {
    const result = validateBody(CreateCredentialSchema, {
      type: "invalid",
      label: "Test",
    });
    expect(result.success).toBe(false);
  });
});

describe("Domain Error Classes", () => {
  it("BrowserError should have correct properties", () => {
    const err = new BrowserError({
      _tag: "BrowserError",
      browser: "chromium",
      cause: { code: "BROWSER_LAUNCH_FAILED" },
    });
    expect(err._tag).toBe("BrowserError");
    expect(err.browser).toBe("chromium");
    expect(err).toBeInstanceOf(Error);
  });

  it("WorkflowError should have workflowId", () => {
    const err = new WorkflowError({
      _tag: "WorkflowError",
      workflowId: "wf-123",
      reason: "Block failed",
      cause: { code: "BLOCK_EXECUTION_FAILED" },
    });
    expect(err.workflowId).toBe("wf-123");
    expect(err.reason).toBe("Block failed");
  });

  it("CredentialError should have credentialId", () => {
    const err = new CredentialError({
      _tag: "CredentialError",
      credentialId: "cred-123",
      reason: "Decrypt failed",
      cause: { code: "VAULT_DECRYPT_FAILED" },
    });
    expect(err.credentialId).toBe("cred-123");
    expect(err.reason).toBe("Decrypt failed");
  });

  it("NetworkError should have url", () => {
    const err = new NetworkError({
      _tag: "NetworkError",
      url: "https://example.com",
      cause: { code: "PROXY_ERROR" },
    });
    expect(err.url).toBe("https://example.com");
  });
});
