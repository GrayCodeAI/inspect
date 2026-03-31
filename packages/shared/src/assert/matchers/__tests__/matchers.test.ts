import { describe, it, expect } from "vitest";
import { expect as inspectExpect, AssertionError } from "../../index.js";

describe("expect", () => {
  describe("equality matchers", () => {
    describe("toBe", () => {
      it("passes for same reference", () => {
        const obj = {};
        expect(inspectExpect(obj).toBe(obj)).toBeDefined();
      });

      it("passes for primitives", () => {
        expect(inspectExpect(5).toBe(5)).toBeDefined();
        expect(inspectExpect("hello").toBe("hello")).toBeDefined();
      });

      it("fails for different values", () => {
        expect(() => inspectExpect(5).toBe(6)).toThrow(AssertionError);
      });

      it("fails for different object references", () => {
        expect(() => inspectExpect({}).toBe({})).toThrow(AssertionError);
      });
    });

    describe("toEqual", () => {
      it("passes for equal objects", () => {
        expect(inspectExpect({ a: 1 }).toEqual({ a: 1 })).toBeDefined();
      });

      it("passes for equal arrays", () => {
        expect(inspectExpect([1, 2, 3]).toEqual([1, 2, 3])).toBeDefined();
      });

      it("passes for nested objects", () => {
        expect(inspectExpect({ a: { b: 1 } }).toEqual({ a: { b: 1 } })).toBeDefined();
      });

      it("fails for different objects", () => {
        expect(() => inspectExpect({ a: 1 }).toEqual({ a: 2 })).toThrow(AssertionError);
      });
    });

    describe("toStrictEqual", () => {
      it("passes for identical objects", () => {
        expect(inspectExpect({ a: 1 }).toStrictEqual({ a: 1 })).toBeDefined();
      });

      it("fails for different types", () => {
        expect(() => inspectExpect("5").toStrictEqual(5)).toThrow(AssertionError);
      });
    });
  });

  describe("truthiness matchers", () => {
    describe("toBeNull", () => {
      it("passes for null", () => {
        expect(inspectExpect(null).toBeNull()).toBeDefined();
      });

      it("fails for undefined", () => {
        expect(() => inspectExpect(undefined).toBeNull()).toThrow(AssertionError);
      });
    });

    describe("toBeUndefined", () => {
      it("passes for undefined", () => {
        expect(inspectExpect(undefined).toBeUndefined()).toBeDefined();
      });

      it("fails for null", () => {
        expect(() => inspectExpect(null).toBeUndefined()).toThrow(AssertionError);
      });
    });

    describe("toBeDefined", () => {
      it("passes for defined values", () => {
        expect(inspectExpect(0).toBeDefined()).toBeDefined();
        expect(inspectExpect("").toBeDefined()).toBeDefined();
        expect(inspectExpect(null).toBeDefined()).toBeDefined();
      });

      it("fails for undefined", () => {
        expect(() => inspectExpect(undefined).toBeDefined()).toThrow(AssertionError);
      });
    });

    describe("toBeTruthy", () => {
      it("passes for truthy values", () => {
        expect(inspectExpect(1).toBeTruthy()).toBeDefined();
        expect(inspectExpect("hello").toBeTruthy()).toBeDefined();
        expect(inspectExpect({}).toBeTruthy()).toBeDefined();
      });

      it("fails for falsy values", () => {
        expect(() => inspectExpect(0).toBeTruthy()).toThrow(AssertionError);
        expect(() => inspectExpect("").toBeTruthy()).toThrow(AssertionError);
      });
    });

    describe("toBeFalsy", () => {
      it("passes for falsy values", () => {
        expect(inspectExpect(0).toBeFalsy()).toBeDefined();
        expect(inspectExpect("").toBeFalsy()).toBeDefined();
        expect(inspectExpect(null).toBeFalsy()).toBeDefined();
        expect(inspectExpect(undefined).toBeFalsy()).toBeDefined();
      });

      it("fails for truthy values", () => {
        expect(() => inspectExpect(1).toBeFalsy()).toThrow(AssertionError);
      });
    });
  });

  describe("comparison matchers", () => {
    describe("toBeGreaterThan", () => {
      it("passes when greater", () => {
        expect(inspectExpect(5).toBeGreaterThan(3)).toBeDefined();
      });

      it("fails when not greater", () => {
        expect(() => inspectExpect(3).toBeGreaterThan(5)).toThrow(AssertionError);
      });
    });

    describe("toBeGreaterThanOrEqual", () => {
      it("passes when greater", () => {
        expect(inspectExpect(5).toBeGreaterThanOrEqual(3)).toBeDefined();
      });

      it("passes when equal", () => {
        expect(inspectExpect(5).toBeGreaterThanOrEqual(5)).toBeDefined();
      });

      it("fails when less", () => {
        expect(() => inspectExpect(3).toBeGreaterThanOrEqual(5)).toThrow(AssertionError);
      });
    });

    describe("toBeLessThan", () => {
      it("passes when less", () => {
        expect(inspectExpect(3).toBeLessThan(5)).toBeDefined();
      });

      it("fails when not less", () => {
        expect(() => inspectExpect(5).toBeLessThan(3)).toThrow(AssertionError);
      });
    });

    describe("toBeLessThanOrEqual", () => {
      it("passes when less", () => {
        expect(inspectExpect(3).toBeLessThanOrEqual(5)).toBeDefined();
      });

      it("passes when equal", () => {
        expect(inspectExpect(5).toBeLessThanOrEqual(5)).toBeDefined();
      });

      it("fails when greater", () => {
        expect(() => inspectExpect(5).toBeLessThanOrEqual(3)).toThrow(AssertionError);
      });
    });

    describe("toBeCloseTo", () => {
      it("passes for close numbers", () => {
        expect(inspectExpect(1.001).toBeCloseTo(1, 2)).toBeDefined();
      });

      it("fails for distant numbers", () => {
        expect(() => inspectExpect(1.1).toBeCloseTo(1, 1)).toThrow(AssertionError);
      });
    });
  });

  describe("string matchers", () => {
    describe("toMatch", () => {
      it("passes for matching string", () => {
        expect(inspectExpect("hello world").toMatch("world")).toBeDefined();
      });

      it("passes for matching regex", () => {
        expect(inspectExpect("hello world").toMatch(/world/)).toBeDefined();
      });

      it("fails for non-matching", () => {
        expect(() => inspectExpect("hello world").toMatch("foo")).toThrow(AssertionError);
      });
    });

    describe("toStartWith", () => {
      it("passes when starts with", () => {
        expect(inspectExpect("hello world").toStartWith("hello")).toBeDefined();
      });

      it("fails when not starts with", () => {
        expect(() => inspectExpect("hello world").toStartWith("world")).toThrow(AssertionError);
      });
    });

    describe("toEndWith", () => {
      it("passes when ends with", () => {
        expect(inspectExpect("hello world").toEndWith("world")).toBeDefined();
      });

      it("fails when not ends with", () => {
        expect(() => inspectExpect("hello world").toEndWith("hello")).toThrow(AssertionError);
      });
    });
  });

  describe("collection matchers", () => {
    describe("toContain", () => {
      it("passes for string containing substring", () => {
        expect(inspectExpect("hello world").toContain("world")).toBeDefined();
      });

      it("passes for array containing item", () => {
        expect(inspectExpect([1, 2, 3]).toContain(2)).toBeDefined();
      });

      it("fails for missing item", () => {
        expect(() => inspectExpect([1, 2, 3]).toContain(4)).toThrow(AssertionError);
      });
    });

    describe("toHaveLength", () => {
      it("passes for correct length", () => {
        expect(inspectExpect([1, 2, 3]).toHaveLength(3)).toBeDefined();
        expect(inspectExpect("hello").toHaveLength(5)).toBeDefined();
      });

      it("fails for wrong length", () => {
        expect(() => inspectExpect([1, 2]).toHaveLength(3)).toThrow(AssertionError);
      });
    });

    describe("toHaveProperty", () => {
      it("passes for existing property", () => {
        expect(inspectExpect({ a: 1, b: 2 }).toHaveProperty("a")).toBeDefined();
      });

      it("passes for nested property", () => {
        expect(inspectExpect({ a: { b: 1 } }).toHaveProperty("a.b")).toBeDefined();
      });

      it("passes for property with value", () => {
        expect(inspectExpect({ a: 1 }).toHaveProperty("a", 1)).toBeDefined();
      });

      it("fails for missing property", () => {
        expect(() => inspectExpect({ a: 1 }).toHaveProperty("b")).toThrow(AssertionError);
      });
    });
  });

  describe("type matchers", () => {
    describe("toBeInstanceOf", () => {
      it("passes for correct instance", () => {
        expect(inspectExpect([]).toBeInstanceOf(Array)).toBeDefined();
        expect(inspectExpect(new Date()).toBeInstanceOf(Date)).toBeDefined();
      });

      it("fails for wrong instance", () => {
        expect(() => inspectExpect({}).toBeInstanceOf(Array)).toThrow(AssertionError);
      });
    });

    describe("toBeTypeOf", () => {
      it("passes for correct type", () => {
        expect(inspectExpect("hello").toBeTypeOf("string")).toBeDefined();
        expect(inspectExpect(42).toBeTypeOf("number")).toBeDefined();
        expect(inspectExpect(true).toBeTypeOf("boolean")).toBeDefined();
      });

      it("fails for wrong type", () => {
        expect(() => inspectExpect(42).toBeTypeOf("string")).toThrow(AssertionError);
      });
    });
  });

  describe("error matcher", () => {
    describe("toThrow", () => {
      it("passes when function throws", () => {
        expect(
          inspectExpect(() => {
            throw new Error("boom");
          }).toThrow(),
        ).toBeDefined();
      });

      it("passes when message matches", () => {
        expect(
          inspectExpect(() => {
            throw new Error("boom");
          }).toThrow("boom"),
        ).toBeDefined();
      });

      it("passes when regex matches", () => {
        expect(
          inspectExpect(() => {
            throw new Error("boom");
          }).toThrow(/boom/),
        ).toBeDefined();
      });

      it("fails when function does not throw", () => {
        expect(() => inspectExpect(() => {}).toThrow()).toThrow(AssertionError);
      });
    });
  });

  describe("negation (.not)", () => {
    it("not.toBe works", () => {
      expect(inspectExpect(5).not.toBe(6)).toBeDefined();
    });

    it("not.toEqual works", () => {
      expect(inspectExpect({ a: 1 }).not.toEqual({ a: 2 })).toBeDefined();
    });

    it("not.toBeNull works", () => {
      expect(inspectExpect(1).not.toBeNull()).toBeDefined();
    });

    it("not.toBeDefined works", () => {
      expect(inspectExpect(undefined).not.toBeDefined()).toBeDefined();
    });

    it("not.toBeTruthy works", () => {
      expect(inspectExpect(0).not.toBeTruthy()).toBeDefined();
    });

    it("not.toBeFalsy works", () => {
      expect(inspectExpect(1).not.toBeFalsy()).toBeDefined();
    });

    it("not.toContain works", () => {
      expect(inspectExpect([1, 2, 3]).not.toContain(4)).toBeDefined();
    });

    it("not.toHaveLength works", () => {
      expect(inspectExpect([1, 2]).not.toHaveLength(3)).toBeDefined();
    });

    it("not.toMatch works", () => {
      expect(inspectExpect("hello").not.toMatch(/world/)).toBeDefined();
    });

    it("not.toThrow works", () => {
      expect(inspectExpect(() => {}).not.toThrow()).toBeDefined();
    });
  });

  describe("async matchers", () => {
    describe("resolves", () => {
      it("resolves.toBe works", async () => {
        await expect(inspectExpect(Promise.resolve(5)).resolves.toBe(5)).toBeDefined();
      });

      it("resolves.toEqual works", async () => {
        await expect(
          inspectExpect(Promise.resolve({ a: 1 })).resolves.toEqual({ a: 1 }),
        ).toBeDefined();
      });

      it("resolves.toContain works", async () => {
        await expect(inspectExpect(Promise.resolve([1, 2, 3])).resolves.toContain(2)).toBeDefined();
      });

      it("resolves fails when promise rejects", async () => {
        await expect(
          inspectExpect(Promise.reject(new Error("boom"))).resolves.toBe(5),
        ).rejects.toThrow();
      });
    });

    describe("rejects", () => {
      it("rejects.toMatch works", async () => {
        await expect(inspectExpect(Promise.reject("boom")).rejects.toMatch(/boom/)).toBeDefined();
      });

      it("rejects.toEqual works", async () => {
        await expect(
          inspectExpect(Promise.reject(new Error("boom"))).rejects.toEqual(new Error("boom")),
        ).toBeDefined();
      });

      it("rejects fails when promise resolves", async () => {
        await expect(inspectExpect(Promise.resolve(5)).rejects.toBe(5)).rejects.toThrow(
          AssertionError,
        );
      });
    });
  });
});
