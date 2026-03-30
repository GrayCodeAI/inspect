import { describe, it, expect } from "vitest";
import { Command } from "commander";

// Import all new command registrations
import { registerTrailCommand } from "../commands/trail.js";
import { registerAutonomyCommand } from "../commands/autonomy.js";
import { registerPermissionsCommand } from "../commands/permissions.js";
import { registerRBACCommand } from "../commands/rbac.js";
import { registerTenantCommand } from "../commands/tenant.js";
import { registerSSOCommand } from "../commands/sso.js";

describe("Governance Commands", () => {
  describe("trail command", () => {
    it("registers with correct name and description", () => {
      const program = new Command();
      registerTrailCommand(program);
      const cmd = program.commands.find((c) => c.name() === "trail");
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toContain("audit trail");
    });

    it("has expected options", () => {
      const program = new Command();
      registerTrailCommand(program);
      const cmd = program.commands.find((c) => c.name() === "trail")!;
      const opts = cmd.options.map((o) => o.flags);
      expect(opts.some((f) => f.includes("--session"))).toBe(true);
      expect(opts.some((f) => f.includes("--limit"))).toBe(true);
      expect(opts.some((f) => f.includes("--compliance"))).toBe(true);
      expect(opts.some((f) => f.includes("--json"))).toBe(true);
    });
  });

  describe("autonomy command", () => {
    it("registers with correct name and description", () => {
      const program = new Command();
      registerAutonomyCommand(program);
      const cmd = program.commands.find((c) => c.name() === "autonomy");
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toContain("autonomy");
    });

    it("has expected options", () => {
      const program = new Command();
      registerAutonomyCommand(program);
      const cmd = program.commands.find((c) => c.name() === "autonomy")!;
      const opts = cmd.options.map((o) => o.flags);
      expect(opts.some((f) => f.includes("--level"))).toBe(true);
      expect(opts.some((f) => f.includes("--max-cost"))).toBe(true);
      expect(opts.some((f) => f.includes("--max-steps"))).toBe(true);
    });
  });

  describe("permissions command", () => {
    it("registers with correct name and description", () => {
      const program = new Command();
      registerPermissionsCommand(program);
      const cmd = program.commands.find((c) => c.name() === "permissions");
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toContain("permissions");
    });

    it("has expected options", () => {
      const program = new Command();
      registerPermissionsCommand(program);
      const cmd = program.commands.find((c) => c.name() === "permissions")!;
      const opts = cmd.options.map((o) => o.flags);
      expect(opts.some((f) => f.includes("--allow-domain"))).toBe(true);
      expect(opts.some((f) => f.includes("--block-domain"))).toBe(true);
      expect(opts.some((f) => f.includes("--allow-action"))).toBe(true);
    });
  });
});

describe("Enterprise Commands", () => {
  describe("rbac command", () => {
    it("registers with correct name and description", () => {
      const program = new Command();
      registerRBACCommand(program);
      const cmd = program.commands.find((c) => c.name() === "rbac");
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toContain("access control");
    });

    it("has --role option", () => {
      const program = new Command();
      registerRBACCommand(program);
      const cmd = program.commands.find((c) => c.name() === "rbac")!;
      const opts = cmd.options.map((o) => o.flags);
      expect(opts.some((f) => f.includes("--role"))).toBe(true);
    });
  });

  describe("tenant command", () => {
    it("registers with correct name and description", () => {
      const program = new Command();
      registerTenantCommand(program);
      const cmd = program.commands.find((c) => c.name() === "tenant");
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toContain("tenant");
    });

    it("has --plan and --name options", () => {
      const program = new Command();
      registerTenantCommand(program);
      const cmd = program.commands.find((c) => c.name() === "tenant")!;
      const opts = cmd.options.map((o) => o.flags);
      expect(opts.some((f) => f.includes("--plan"))).toBe(true);
      expect(opts.some((f) => f.includes("--name"))).toBe(true);
    });
  });

  describe("sso command", () => {
    it("registers with correct name and description", () => {
      const program = new Command();
      registerSSOCommand(program);
      const cmd = program.commands.find((c) => c.name() === "sso");
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toContain("Single Sign-On");
    });

    it("has provider and url options", () => {
      const program = new Command();
      registerSSOCommand(program);
      const cmd = program.commands.find((c) => c.name() === "sso")!;
      const opts = cmd.options.map((o) => o.flags);
      expect(opts.some((f) => f.includes("--provider"))).toBe(true);
      expect(opts.some((f) => f.includes("--sso-url"))).toBe(true);
      expect(opts.some((f) => f.includes("--callback-url"))).toBe(true);
    });
  });
});
