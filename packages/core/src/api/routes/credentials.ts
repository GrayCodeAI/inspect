// ============================================================================
// @inspect/api - Credential Routes
// ============================================================================

import type { CredentialProviderType, CredentialType } from "@inspect/core";
import type { APIServer, APIRequest, APIResponse } from "../server.js";

/** Credential vault interface for the API */
export interface CredentialVaultAPI {
  create(options: {
    provider?: CredentialProviderType;
    type: CredentialType;
    label: string;
    domain?: string;
    data: Record<string, unknown>;
    totpSecret?: string;
  }): { id: string; [key: string]: unknown };
  getSafe(id: string): Record<string, unknown> | null;
  update(id: string, options: Record<string, unknown>): Record<string, unknown> | null;
  delete(id: string): boolean;
  list(filter?: Record<string, unknown>): Array<Record<string, unknown>>;
  test(id: string): Promise<{ success: boolean; message: string; testedAt: number }>;
}

/**
 * Register credential routes on the API server.
 *
 * POST   /api/credentials          - Create credential
 * GET    /api/credentials          - List credentials
 * GET    /api/credentials/:id      - Get credential
 * PUT    /api/credentials/:id      - Update credential
 * DELETE /api/credentials/:id      - Delete credential
 * POST   /api/credentials/:id/test - Test credential
 */
export function registerCredentialRoutes(
  server: APIServer,
  vault: CredentialVaultAPI,
): void {
  // POST /api/credentials
  server.post(
    "/api/credentials",
    (req: APIRequest, res: APIResponse) => {
      const body = req.body as Record<string, unknown> | null;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "Request body must be a JSON object" });
        return;
      }

      if (!body.type || typeof body.type !== "string") {
        res.status(400).json({ error: "Missing or invalid required field: type" });
        return;
      }

      if (!body.label || typeof body.label !== "string" || !body.label.toString().trim()) {
        res.status(400).json({ error: "Missing or empty required field: label" });
        return;
      }

      // Validate type
      const validTypes = ["password", "api-key", "oauth", "totp", "certificate"];
      if (!validTypes.includes(String(body.type))) {
        res.status(400).json({
          error: `Invalid credential type. Must be one of: ${validTypes.join(", ")}`,
        });
        return;
      }

      // Validate provider if given
      const validProviders = ["native", "bitwarden", "1password", "azure-key-vault", "custom-http"];
      if (body.provider && !validProviders.includes(String(body.provider))) {
        res.status(400).json({
          error: `Invalid provider. Must be one of: ${validProviders.join(", ")}`,
        });
        return;
      }

      // Validate data is an object if given
      if (body.data !== undefined && (typeof body.data !== "object" || body.data === null || Array.isArray(body.data))) {
        res.status(400).json({ error: "data must be a JSON object" });
        return;
      }

      // Validate data size and depth to prevent DoS
      if (body.data !== undefined) {
        const dataStr = JSON.stringify(body.data);
        if (dataStr.length > 65_536) {
          res.status(400).json({ error: "Credential data exceeds maximum size (64KB)" });
          return;
        }
      }

      try {
        const credential = vault.create({
          provider: (body.provider as CredentialProviderType) ?? "native",
          type: body.type as CredentialType,
          label: String(body.label).trim(),
          domain: body.domain ? String(body.domain) : undefined,
          data: (body.data as Record<string, unknown>) ?? {},
          totpSecret: body.totpSecret ? String(body.totpSecret) : undefined,
        });

        res.status(201).json(credential);
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : "Failed to create credential",
        });
      }
    },
  );

  // GET /api/credentials
  server.get(
    "/api/credentials",
    (req: APIRequest, res: APIResponse) => {
      const filter: Record<string, unknown> = {};
      if (req.query.provider) filter.provider = req.query.provider;
      if (req.query.type) filter.type = req.query.type;
      if (req.query.domain) filter.domain = req.query.domain;

      const credentials = vault.list(
        Object.keys(filter).length > 0 ? filter : undefined,
      );
      res.json({ credentials });
    },
  );

  // GET /api/credentials/:id
  server.get(
    "/api/credentials/:id",
    (req: APIRequest, res: APIResponse) => {
      const credential = vault.getSafe(req.params.id);
      if (!credential) {
        res.status(404).json({ error: "Credential not found" });
        return;
      }
      res.json(credential);
    },
  );

  // PUT /api/credentials/:id
  server.put(
    "/api/credentials/:id",
    (req: APIRequest, res: APIResponse) => {
      const body = req.body as Record<string, unknown> | null;
      if (!body) {
        res.status(400).json({ error: "Request body required" });
        return;
      }

      const updated = vault.update(req.params.id, body);
      if (!updated) {
        res.status(404).json({ error: "Credential not found" });
        return;
      }

      res.json(updated);
    },
  );

  // DELETE /api/credentials/:id
  server.delete(
    "/api/credentials/:id",
    (req: APIRequest, res: APIResponse) => {
      const deleted = vault.delete(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: "Credential not found" });
        return;
      }
      res.json({ deleted: true, id: req.params.id });
    },
  );

  // POST /api/credentials/:id/test
  server.post(
    "/api/credentials/:id/test",
    async (req: APIRequest, res: APIResponse) => {
      try {
        const result = await vault.test(req.params.id);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Test failed",
          testedAt: Date.now(),
        });
      }
    },
  );
}
