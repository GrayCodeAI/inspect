import { describe, it, expect, vi } from "vitest";
import {
  extractFormStructure,
  findRelatedFields,
  validateFormField,
  type FormStructure,
} from "./form-context.js";

describe("Form Context Extraction", () => {
  describe("extractFormStructure", () => {
    it("should extract basic form structure", async () => {
      const mockStructure: FormStructure = {
        selector: "form",
        id: "login-form",
        method: "POST",
        action: "/login",
        fields: [
          {
            name: "email",
            type: "email",
            selector: "#email",
            label: "Email",
            required: true,
            readonly: false,
            disabled: false,
            ariaRequired: true,
            ariaInvalid: false,
          },
          {
            name: "password",
            type: "password",
            selector: "#password",
            label: "Password",
            required: true,
            readonly: false,
            disabled: false,
            ariaRequired: true,
            ariaInvalid: false,
          },
        ],
        submitButton: {
          selector: "button[type=submit]",
          text: "Login",
        },
        fieldGroups: [],
      };

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([mockStructure]),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await extractFormStructure(mockPage as any, "form");

      expect(result).toHaveLength(1);
      expect(result[0].fields).toHaveLength(2);
      expect(result[0].fields[0].name).toBe("email");
      expect(result[0].submitButton?.text).toBe("Login");
    });

    it("should extract field constraints", async () => {
      const mockStructure: FormStructure = {
        selector: "form",
        fields: [
          {
            name: "username",
            type: "text",
            selector: "#username",
            required: true,
            readonly: false,
            disabled: false,
            minLength: 3,
            maxLength: 20,
            pattern: "^[a-zA-Z0-9_]+$",
            ariaRequired: false,
            ariaInvalid: false,
          },
        ],
        fieldGroups: [],
      };

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([mockStructure]),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await extractFormStructure(mockPage as any, "form");

      expect(result[0].fields[0].minLength).toBe(3);
      expect(result[0].fields[0].maxLength).toBe(20);
      expect(result[0].fields[0].pattern).toBe("^[a-zA-Z0-9_]+$");
    });

    it("should extract select options", async () => {
      const mockStructure: FormStructure = {
        selector: "form",
        fields: [
          {
            name: "country",
            type: "select",
            selector: "#country",
            required: false,
            readonly: false,
            disabled: false,
            options: ["USA", "Canada", "Mexico"],
            ariaRequired: false,
            ariaInvalid: false,
          },
        ],
        fieldGroups: [],
      };

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([mockStructure]),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await extractFormStructure(mockPage as any, "form");

      expect(result[0].fields[0].options).toEqual(["USA", "Canada", "Mexico"]);
    });

    it("should identify field groups", async () => {
      const mockStructure: FormStructure = {
        selector: "form",
        fields: [],
        fieldGroups: [
          {
            name: "Billing Address",
            fields: ["street", "city", "state", "zip"],
          },
          {
            name: "Shipping Address",
            fields: ["ship_street", "ship_city", "ship_state"],
          },
        ],
      };

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([mockStructure]),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await extractFormStructure(mockPage as any, "form");

      expect(result[0].fieldGroups).toHaveLength(2);
      expect(result[0].fieldGroups[0].name).toBe("Billing Address");
    });
  });

  describe("findRelatedFields", () => {
    it("should find fields in same fieldset", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([
          {
            name: "first_name",
            type: "text",
            label: "First Name",
            proximity: "same-group",
          },
          {
            name: "last_name",
            type: "text",
            label: "Last Name",
            proximity: "name-related",
          },
        ]),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await findRelatedFields(mockPage as any, "first_name");

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((f) => f.name === "last_name")).toBe(true);
    });

    it("should find fields by name relationship", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([
          {
            name: "ship_street",
            proximity: "name-related",
          },
          {
            name: "ship_city",
            proximity: "name-related",
          },
        ]),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await findRelatedFields(mockPage as any, "ship_street");

      expect(result.some((f) => f.name === "ship_city")).toBe(true);
    });

    it("should return empty array for non-existent field", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([]),
      };

      const result = await findRelatedFields(mockPage as any, "non_existent");

      expect(result).toEqual([]);
    });
  });

  describe("validateFormField", () => {
    it("should validate required field", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([
          {
            field: "email",
            error: "Field is required",
            constraint: "required",
          },
        ]),
      };

      const result = await validateFormField(mockPage as any, "email", "");

      expect(result).toHaveLength(1);
      expect(result[0].constraint).toBe("required");
    });

    it("should validate field length", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([
          {
            field: "password",
            error: "Minimum length: 8",
            constraint: "minLength",
          },
        ]),
      };

      const result = await validateFormField(mockPage as any, "password", "short");

      expect(result.some((e) => e.constraint === "minLength")).toBe(true);
    });

    it("should validate pattern", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([
          {
            field: "email",
            error: "Invalid format (pattern: ^[\\w\\.-]+@[\\w\\.-]+\\.\\w+$)",
            constraint: "pattern",
          },
        ]),
      };

      const result = await validateFormField(mockPage as any, "email", "invalid-email");

      expect(result.some((e) => e.constraint === "pattern")).toBe(true);
    });

    it("should validate min/max for numbers", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([
          {
            field: "age",
            error: "Minimum value: 18",
            constraint: "min",
          },
        ]),
      };

      const result = await validateFormField(mockPage as any, "age", "15");

      expect(result.some((e) => e.constraint === "min")).toBe(true);
    });

    it("should return empty array for valid field", async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([]),
      };

      const result = await validateFormField(mockPage as any, "email", "valid@example.com");

      expect(result).toEqual([]);
    });
  });
});
