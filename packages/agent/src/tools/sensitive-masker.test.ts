import { describe, it, expect } from "vitest";
import { SensitiveDataMasker } from "./sensitive-masker.js";

describe("SensitiveDataMasker", () => {
  it("masks sensitive values in text", () => {
    const masker = new SensitiveDataMasker({ password: "MySecret123" });
    const { masked } = masker.mask("Type MySecret123 in the password field");
    expect(masked).not.toContain("MySecret123");
    expect(masked).toContain("<MASKED:password>");
  });

  it("restores masked values", () => {
    const masker = new SensitiveDataMasker({ password: "MySecret123" });
    const { masked } = masker.mask("Type MySecret123");
    const restored = masker.unmask(masked);
    expect(restored).toBe("Type MySecret123");
  });

  it("masks multiple fields", () => {
    const masker = new SensitiveDataMasker({ password: "secret", apiKey: "sk-abc" });
    const { masked } = masker.mask("Password is secret and key is sk-abc");
    expect(masked).not.toContain("secret");
    expect(masked).not.toContain("sk-abc");
    expect(masked).toContain("<MASKED:password>");
    expect(masked).toContain("<MASKED:apiKey>");
  });

  it("masks entire message arrays", () => {
    const masker = new SensitiveDataMasker({ token: "abc123" });
    const messages = [
      { role: "user", content: "Use token abc123" },
      { role: "assistant", content: "I'll use abc123" },
    ];
    const masked = masker.maskMessages(messages);
    expect(masked[0].content).not.toContain("abc123");
    expect(masked[1].content).not.toContain("abc123");
  });

  it("auto-detects sensitive fields", () => {
    const masker = new SensitiveDataMasker();
    masker.autoDetect([
      { name: "password", value: "MyPass!" },
      { name: "username", value: "john" },
      { name: "secret_token", value: "tok123" },
    ]);
    expect(masker.count).toBe(2); // password + secret_token
    expect(masker.isSensitive("MyPass!")).toBe(true);
    expect(masker.isSensitive("john")).toBe(false);
  });

  it("skips empty values", () => {
    const masker = new SensitiveDataMasker({ password: "", token: "abc" });
    expect(masker.count).toBe(1);
  });

  it("handles text without sensitive data", () => {
    const masker = new SensitiveDataMasker({ password: "secret" });
    const { masked } = masker.mask("Hello world");
    expect(masked).toBe("Hello world");
  });
});
