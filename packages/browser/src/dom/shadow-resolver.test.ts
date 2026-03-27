import { describe, it, expect } from "vitest";
import { ShadowDomResolver } from "./shadow-resolver.js";

describe("ShadowDomResolver", () => {
  describe("constructor", () => {
    it("should create resolver with page", () => {
      const mockPage = {};
      const resolver = new ShadowDomResolver(mockPage);
      expect(resolver).toBeDefined();
    });
  });

  describe("resolve", () => {
    it("should resolve elements from page", async () => {
      const mockPage = {
        evaluate: async () => ({
          regular: [
            {
              ref: "s1",
              role: "button",
              name: "Click",
              visible: true,
              interactable: true,
              tagName: "button",
            },
          ],
          shadow: [],
          shadowRoots: [],
        }),
      };
      const resolver = new ShadowDomResolver(mockPage);
      const result = await resolver.resolve();
      expect(result.regularElements.length).toBe(1);
      expect(result.shadowElements.length).toBe(0);
      expect(result.totalElements).toBe(1);
    });

    it("should find shadow DOM elements", async () => {
      const mockPage = {
        evaluate: async () => ({
          regular: [],
          shadow: [
            {
              ref: "s1",
              role: "button",
              name: "Shadow Button",
              visible: true,
              interactable: true,
              inShadowDom: true,
            },
          ],
          shadowRoots: [
            { hostElement: "my-component", hostRef: "s0", mode: "open", childElementCount: 1 },
          ],
        }),
      };
      const resolver = new ShadowDomResolver(mockPage);
      const result = await resolver.resolve();
      expect(result.shadowElements.length).toBe(1);
      expect(result.shadowRoots.length).toBe(1);
    });

    it("should handle page without evaluate method", async () => {
      const mockPage = {};
      const resolver = new ShadowDomResolver(mockPage);
      const result = await resolver.resolve();
      expect(result.regularElements).toEqual([]);
      expect(result.shadowElements).toEqual([]);
      expect(result.shadowRoots).toEqual([]);
      expect(result.totalElements).toBe(0);
    });
  });

  describe("findInShadow", () => {
    it("should find elements in shadow DOM matching predicate", async () => {
      const mockPage = {
        evaluate: async () => ({
          regular: [],
          shadow: [
            { ref: "s1", role: "button", name: "Shadow A", visible: true, interactable: true },
            { ref: "s2", role: "link", name: "Shadow B", visible: true, interactable: true },
          ],
          shadowRoots: [],
        }),
      };
      const resolver = new ShadowDomResolver(mockPage);
      const matches = await resolver.findInShadow((el) => el.role === "button");
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe("Shadow A");
    });
  });

  describe("hasShadowDom", () => {
    it("should return true when shadow DOM exists", async () => {
      const mockPage = {
        evaluate: async () => true,
      };
      const resolver = new ShadowDomResolver(mockPage);
      const hasShadow = await resolver.hasShadowDom();
      expect(hasShadow).toBe(true);
    });

    it("should return false when no shadow DOM", async () => {
      const mockPage = {
        evaluate: async () => false,
      };
      const resolver = new ShadowDomResolver(mockPage);
      const hasShadow = await resolver.hasShadowDom();
      expect(hasShadow).toBe(false);
    });

    it("should return false for page without evaluate", async () => {
      const mockPage = {};
      const resolver = new ShadowDomResolver(mockPage);
      const hasShadow = await resolver.hasShadowDom();
      expect(hasShadow).toBe(false);
    });
  });

  describe("getShadowHosts", () => {
    it("should return shadow root hosts", async () => {
      const mockPage = {
        evaluate: async () => ({
          regular: [],
          shadow: [],
          shadowRoots: [
            { hostElement: "my-widget", hostRef: "s1", mode: "open", childElementCount: 3 },
          ],
        }),
      };
      const resolver = new ShadowDomResolver(mockPage);
      const hosts = await resolver.getShadowHosts();
      expect(hosts.length).toBe(1);
      expect(hosts[0].hostElement).toBe("my-widget");
      expect(hosts[0].childElementCount).toBe(3);
    });
  });
});
