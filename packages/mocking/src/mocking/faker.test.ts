import { describe, it, expect } from "vitest";
import { FakeData } from "./faker.js";

describe("FakeData", () => {
  describe("name", () => {
    it("returns a non-empty string", () => {
      const name = FakeData.name();
      expect(name.length).toBeGreaterThan(0);
    });

    it("returns a first and last name separated by space", () => {
      const name = FakeData.name();
      const parts = name.split(" ");
      expect(parts.length).toBe(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    });
  });

  describe("firstName", () => {
    it("returns a non-empty string", () => {
      expect(FakeData.firstName().length).toBeGreaterThan(0);
    });
  });

  describe("lastName", () => {
    it("returns a non-empty string", () => {
      expect(FakeData.lastName().length).toBeGreaterThan(0);
    });
  });

  describe("email", () => {
    it("contains @ symbol", () => {
      const email = FakeData.email();
      expect(email).toContain("@");
    });

    it("has a valid basic email structure", () => {
      const email = FakeData.email();
      expect(email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
    });

    it("is all lowercase", () => {
      const email = FakeData.email();
      // The local part before @ should be lowercase
      const localPart = email.split("@")[0];
      expect(localPart).toBe(localPart.toLowerCase());
    });
  });

  describe("phone", () => {
    it("matches a US phone pattern", () => {
      const phone = FakeData.phone();
      // Expected format: +1 (XXX) XXX-XXXX
      expect(phone).toMatch(/^\+1 \(\d{3}\) \d{3}-\d{4}$/);
    });

    it("returns different values on multiple calls", () => {
      const phones = new Set(Array.from({ length: 20 }, () => FakeData.phone()));
      // With random generation, should get more than 1 unique value in 20 tries
      expect(phones.size).toBeGreaterThan(1);
    });
  });

  describe("uuid", () => {
    it("matches UUID v4 format", () => {
      const uuid = FakeData.uuid();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("generates unique UUIDs", () => {
      const uuids = new Set(Array.from({ length: 50 }, () => FakeData.uuid()));
      expect(uuids.size).toBe(50);
    });
  });

  describe("url", () => {
    it("starts with https://", () => {
      const url = FakeData.url();
      expect(url).toMatch(/^https:\/\//);
    });

    it("is a valid URL", () => {
      const url = FakeData.url();
      expect(() => new URL(url)).not.toThrow();
    });
  });

  describe("address", () => {
    it("returns a non-empty string with comma-separated parts", () => {
      const addr = FakeData.address();
      expect(addr.length).toBeGreaterThan(0);
      expect(addr.split(",").length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("lorem", () => {
    it("returns a sentence ending with a period", () => {
      const text = FakeData.lorem(10);
      expect(text.endsWith(".")).toBe(true);
    });

    it("starts with an uppercase letter", () => {
      const text = FakeData.lorem(5);
      expect(text[0]).toBe(text[0].toUpperCase());
    });

    it("has approximately the requested word count", () => {
      const text = FakeData.lorem(15);
      // Remove trailing period and count words
      const words = text.replace(/\.$/, "").split(" ");
      expect(words.length).toBe(15);
    });
  });

  describe("number", () => {
    it("returns a number within the default range", () => {
      const num = FakeData.number();
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(1000);
    });

    it("respects min and max", () => {
      const num = FakeData.number(10, 20);
      expect(num).toBeGreaterThanOrEqual(10);
      expect(num).toBeLessThanOrEqual(20);
    });
  });

  describe("float", () => {
    it("returns a number within the specified range", () => {
      const f = FakeData.float(0, 1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    });
  });

  describe("boolean", () => {
    it("returns a boolean", () => {
      expect(typeof FakeData.boolean()).toBe("boolean");
    });
  });

  describe("date", () => {
    it("returns a Date object within the past year", () => {
      const d = FakeData.date();
      expect(d).toBeInstanceOf(Date);
      const now = Date.now();
      const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
      expect(d.getTime()).toBeGreaterThanOrEqual(oneYearAgo);
      expect(d.getTime()).toBeLessThanOrEqual(now);
    });
  });

  describe("dateString", () => {
    it("returns a valid ISO date string", () => {
      const ds = FakeData.dateString();
      expect(new Date(ds).toISOString()).toBe(ds);
    });
  });

  describe("company", () => {
    it("returns a non-empty string", () => {
      expect(FakeData.company().length).toBeGreaterThan(0);
    });
  });

  describe("color", () => {
    it("returns a valid hex color", () => {
      const color = FakeData.color();
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe("ip", () => {
    it("returns a valid IPv4 address", () => {
      const ip = FakeData.ip();
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    });
  });

  describe("hex", () => {
    it("returns a hex string of requested length", () => {
      const h = FakeData.hex(32);
      expect(h).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe("alphanumeric", () => {
    it("returns a string of requested length", () => {
      const s = FakeData.alphanumeric(12);
      expect(s.length).toBe(12);
      expect(s).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe("pick", () => {
    it("returns an item from the array", () => {
      const items = ["a", "b", "c"];
      const picked = FakeData.pick(items);
      expect(items).toContain(picked);
    });
  });

  describe("array", () => {
    it("generates an array of the specified count", () => {
      const arr = FakeData.array(() => FakeData.number(), 7);
      expect(arr.length).toBe(7);
      arr.forEach((item) => expect(typeof item).toBe("number"));
    });
  });
});
