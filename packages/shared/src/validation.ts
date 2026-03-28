// ============================================================================
// @inspect/shared - Zod Validation Schemas for API Routes
// ============================================================================

import { z } from "zod";

// ── Task Schemas ────────────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  prompt: z.string().trim().min(1, "prompt is required"),
  url: z
    .string()
    .url("url must be a valid URL")
    .refine(
      (u) => {
        try {
          const p = new URL(u);
          return p.protocol === "http:" || p.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "url must use http or https protocol" },
    ),
  maxSteps: z
    .number()
    .int()
    .default(25)
    .transform((v) => Math.min(Math.max(v, 1), 100)),
  maxIterations: z
    .number()
    .int()
    .default(10)
    .transform((v) => Math.min(Math.max(v, 1), 50)),
  webhookCallbackUrl: z.string().url().optional(),
  errorCodes: z.record(z.string()).optional(),
  extractionSchema: z.record(z.unknown()).optional(),
  navigationPayload: z.record(z.unknown()).optional(),
  totpCredentialId: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

// ── Workflow Schemas ────────────────────────────────────────────────────────

const WorkflowStatusSchema = z.enum(["draft", "active", "paused", "archived"]);

export const CreateWorkflowSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  description: z.string().optional(),
  status: WorkflowStatusSchema.default("draft"),
  blocks: z.array(z.unknown()).default([]),
  parameters: z.record(z.unknown()).optional(),
  cronSchedule: z.string().optional(),
  strictMode: z.boolean().default(false),
  tags: z.array(z.string()).optional(),
});

export const UpdateWorkflowSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  status: WorkflowStatusSchema.optional(),
  blocks: z.array(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional(),
  cronSchedule: z.string().optional(),
  strictMode: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;

// ── Dashboard Schemas ───────────────────────────────────────────────────────

export const SpawnRunSchema = z.object({
  instruction: z.string().trim().min(1, "instruction is required"),
  url: z.string().url().optional(),
  agent: z.string().optional(),
  mode: z.enum(["dom", "hybrid", "cua"]).optional(),
  browser: z.enum(["chromium", "firefox", "webkit"]).optional(),
  devices: z.array(z.string()).min(1, "devices must be a non-empty array"),
  headed: z.boolean().default(false),
  a11y: z.boolean().default(false),
  lighthouse: z.boolean().default(false),
});

export type SpawnRunInput = z.infer<typeof SpawnRunSchema>;

// ── Credential Schemas ──────────────────────────────────────────────────────

const CredentialTypeSchema = z.enum(["password", "api-key", "oauth", "totp", "certificate"]);
const CredentialProviderSchema = z.enum([
  "native",
  "bitwarden",
  "1password",
  "azure-key-vault",
  "custom-http",
]);

export const CreateCredentialSchema = z.object({
  type: CredentialTypeSchema,
  label: z.string().trim().min(1, "label is required"),
  provider: CredentialProviderSchema.default("native"),
  data: z.record(z.unknown()).optional(),
  domain: z.string().optional(),
});

export type CreateCredentialInput = z.infer<typeof CreateCredentialSchema>;

// ── Validation Helper ───────────────────────────────────────────────────────

/**
 * Validate request body against a Zod schema.
 * Returns parsed data or sends a 400 error response.
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const messages = result.error.issues.map((i) => {
    const path = i.path.length > 0 ? `${i.path.join(".")}: ` : "";
    return `${path}${i.message}`;
  });
  return { success: false, error: messages.join("; ") };
}
