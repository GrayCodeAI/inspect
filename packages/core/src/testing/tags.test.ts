import { describe, it, expect } from "vitest";
import { TagExpression, TestFilter } from "./tags.js";

describe("TagExpression", () => {
  it("matches a simple tag", () => {
    const expr = new TagExpression("critical");
    expect(expr.matches(new Set(["critical", "login"]))).toBe(true);
    expect(expr.matches(new Set(["smoke"]))).toBe(false);
  });

  it("matches NOT expression", () => {
    const expr = new TagExpression("!slow");
    expect(expr.matches(new Set(["fast"]))).toBe(true);
    expect(expr.matches(new Set(["slow"]))).toBe(false);
  });

  it("matches NOT keyword", () => {
    const expr = new TagExpression("NOT slow");
    expect(expr.matches(new Set(["fast"]))).toBe(true);
    expect(expr.matches(new Set(["slow"]))).toBe(false);
  });

  it("matches AND expression", () => {
    const expr = new TagExpression("smoke AND fast");
    expect(expr.matches(new Set(["smoke", "fast"]))).toBe(true);
    expect(expr.matches(new Set(["smoke"]))).toBe(false);
    expect(expr.matches(new Set(["fast"]))).toBe(false);
  });

  it("matches OR expression", () => {
    const expr = new TagExpression("login OR signup");
    expect(expr.matches(new Set(["login"]))).toBe(true);
    expect(expr.matches(new Set(["signup"]))).toBe(true);
    expect(expr.matches(new Set(["checkout"]))).toBe(false);
  });

  it("matches complex expressions", () => {
    const expr = new TagExpression("critical AND !slow");
    expect(expr.matches(new Set(["critical", "fast"]))).toBe(true);
    expect(expr.matches(new Set(["critical", "slow"]))).toBe(false);
    expect(expr.matches(new Set(["slow"]))).toBe(false);
  });

  it("handles parentheses", () => {
    const expr = new TagExpression("(login OR signup) AND critical");
    expect(expr.matches(new Set(["login", "critical"]))).toBe(true);
    expect(expr.matches(new Set(["signup", "critical"]))).toBe(true);
    expect(expr.matches(new Set(["login"]))).toBe(false);
    expect(expr.matches(new Set(["critical"]))).toBe(false);
  });

  it("getReferencedTags returns all tag names", () => {
    const expr = new TagExpression("critical AND !slow OR login");
    const tags = expr.getReferencedTags();
    expect(tags).toContain("critical");
    expect(tags).toContain("slow");
    expect(tags).toContain("login");
  });

  it("accepts string array", () => {
    const expr = new TagExpression("critical");
    expect(expr.matches(["critical", "smoke"])).toBe(true);
    expect(expr.matches(["smoke"])).toBe(false);
  });
});

describe("TestFilter", () => {
  it("filters tests by tag expression", () => {
    const filter = new TestFilter<string>();
    filter.add("login-test", ["critical", "auth", "smoke"]);
    filter.add("signup-test", ["auth", "smoke"]);
    filter.add("perf-test", ["performance", "slow"]);

    expect(filter.filter("critical")).toEqual(["login-test"]);
    expect(filter.filter("auth")).toEqual(["login-test", "signup-test"]);
    expect(filter.filter("smoke AND !critical")).toEqual(["signup-test"]);
    expect(filter.filter("auth OR performance")).toEqual(["login-test", "signup-test", "perf-test"]);
  });

  it("getAllTags returns sorted unique tags", () => {
    const filter = new TestFilter<string>();
    filter.add("a", ["z", "a", "m"]);
    filter.add("b", ["a", "b"]);

    expect(filter.getAllTags()).toEqual(["a", "b", "m", "z"]);
  });

  it("getTagCounts returns counts per tag", () => {
    const filter = new TestFilter<string>();
    filter.add("a", ["smoke", "critical"]);
    filter.add("b", ["smoke"]);
    filter.add("c", ["critical"]);

    const counts = filter.getTagCounts();
    expect(counts.get("smoke")).toBe(2);
    expect(counts.get("critical")).toBe(2);
  });

  it("addAll adds multiple tests", () => {
    const filter = new TestFilter<string>();
    filter.addAll([
      { test: "a", tags: ["x"] },
      { test: "b", tags: ["y"] },
    ]);
    expect(filter.size).toBe(2);
  });

  it("returns empty for no matches", () => {
    const filter = new TestFilter<string>();
    filter.add("a", ["x"]);
    expect(filter.filter("y")).toEqual([]);
  });
});
