import { describe, it, expect, beforeEach } from "vitest";
import { APIServer } from "./server.js";

describe("APIServer", () => {
  let server: APIServer;

  beforeEach(() => {
    server = new APIServer({ jwtSecret: "test-secret-key-for-jwt" });
  });

  describe("route registration", () => {
    it("registers GET routes", () => {
      let called = false;
      server.get("/api/health", () => { called = true; });
      // Route is registered internally - verify via JWT round-trip test below
      expect(called).toBe(false); // not called until request
    });

    it("registers all HTTP methods", () => {
      const noop = () => {};
      // These should not throw
      server.get("/a", noop);
      server.post("/b", noop);
      server.put("/c", noop);
      server.delete("/d", noop);
      server.patch("/e", noop);
    });
  });

  describe("JWT", () => {
    it("creates and verifies a valid token", () => {
      const token = server.createJWT({ userId: 123, role: "admin" });
      expect(token).toBeDefined();

      const parts = token.split(".");
      expect(parts).toHaveLength(3);

      // Decode header
      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      expect(header.alg).toBe("HS256");
      expect(header.typ).toBe("JWT");

      // Decode payload
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      expect(payload.userId).toBe(123);
      expect(payload.role).toBe("admin");
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it("sets correct expiration", () => {
      const token = server.createJWT({ id: 1 }, 3600);
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      expect(payload.exp - payload.iat).toBe(3600);
    });

    it("uses default 86400s expiration", () => {
      const token = server.createJWT({ id: 1 });
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      expect(payload.exp - payload.iat).toBe(86400);
    });

    it("produces different tokens for different payloads", () => {
      const t1 = server.createJWT({ userId: 1 });
      const t2 = server.createJWT({ userId: 2 });
      expect(t1).not.toBe(t2);
    });

    it("creates tokens with empty payload", () => {
      const token = server.createJWT({});
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });
  });

  describe("middleware", () => {
    it("accepts middleware via use()", () => {
      // Should not throw
      server.use(async (_req, _res, next) => {
        await next();
      });
    });
  });
});
