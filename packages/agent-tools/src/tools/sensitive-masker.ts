// ============================================================================
// @inspect/agent - Sensitive Data Masker
//
// Strips passwords, tokens, secrets from text before sending to LLM.
// Replaces with placeholders. Re-injects original values when executing actions.
// Inspired by Browser Use's sensitive_data handling.
// ============================================================================

export interface SensitiveField {
  key: string;
  value: string;
  /** Auto-detected or user-defined */
  source: "auto" | "config";
}

export interface MaskResult {
  masked: string;
  replacements: Map<string, string>;
}

const AUTO_DETECT_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api.?key/i,
  /auth/i,
  /credential/i,
  /private.?key/i,
  /access.?key/i,
  /session.?id/i,
  /cookie/i,
  /bearer/i,
  /jwt/i,
];

/**
 * SensitiveDataMasker strips sensitive values from text before LLM calls
 * and restores them when executing actions.
 *
 * Usage:
 * ```ts
 * const masker = new SensitiveDataMasker({
 *   password: "MySecret123",
 *   apiKey: "sk-abc123",
 * });
 *
 * // Before LLM call:
 * const { masked } = masker.mask("Type MySecret123 in password field");
 * // masked: "Type <MASKED:password> in password field"
 *
 * // After LLM response:
 * const restored = masker.unmask("Type <MASKED:password>");
 * // restored: "Type MySecret123"
 * ```
 */
export class SensitiveDataMasker {
  private fields: SensitiveField[] = [];
  private placeholder = "<MASKED:$KEY>";

  constructor(sensitiveData?: Record<string, string>) {
    if (sensitiveData) {
      for (const [key, value] of Object.entries(sensitiveData)) {
        if (value && value.length > 0) {
          this.fields.push({ key, value, source: "config" });
        }
      }
    }
  }

  /**
   * Add a sensitive field.
   */
  add(key: string, value: string, source: "auto" | "config" = "config"): void {
    if (value && value.length > 0) {
      this.fields.push({ key, value, source });
    }
  }

  /**
   * Auto-detect sensitive values from form field names + values.
   */
  autoDetect(fields: Array<{ name: string; value: string }>): void {
    for (const field of fields) {
      if (field.value && field.value.length >= 4) {
        const isSensitive = AUTO_DETECT_PATTERNS.some((p) => p.test(field.name));
        if (isSensitive) {
          this.add(field.name, field.value, "auto");
        }
      }
    }
  }

  /**
   * Mask all sensitive values in text.
   */
  mask(text: string): MaskResult {
    let masked = text;
    const replacements = new Map<string, string>();

    for (const field of this.fields) {
      if (masked.includes(field.value)) {
        const placeholder = this.placeholder.replace("$KEY", field.key);
        masked = masked.split(field.value).join(placeholder);
        replacements.set(placeholder, field.value);
      }
    }

    return { masked, replacements };
  }

  /**
   * Mask sensitive values in an array of messages.
   */
  maskMessages(
    messages: Array<{ role: string; content: string }>,
  ): Array<{ role: string; content: string }> {
    return messages.map((msg) => ({
      role: msg.role,
      content: this.mask(msg.content).masked,
    }));
  }

  /**
   * Restore masked values in text.
   */
  unmask(text: string): string {
    let restored = text;
    for (const field of this.fields) {
      const placeholder = this.placeholder.replace("$KEY", field.key);
      restored = restored.split(placeholder).join(field.value);
    }
    return restored;
  }

  /**
   * Get count of registered sensitive fields.
   */
  get count(): number {
    return this.fields.length;
  }

  /**
   * Check if a value is sensitive.
   */
  isSensitive(value: string): boolean {
    return this.fields.some((f) => f.value === value);
  }
}
