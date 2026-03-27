import { describe, it, expect } from "vitest";
import { FrameTraverser } from "./frame-traverser.js";

describe("FrameTraverser", () => {
  describe("constructor", () => {
    it("should create traverser with page", () => {
      const mockPage = { url: () => "https://example.com" };
      const traverser = new FrameTraverser(mockPage);
      expect(traverser).toBeDefined();
    });
  });

  describe("traverse", () => {
    it("should traverse root frame and collect elements", async () => {
      const mockPage = {
        url: () => "https://example.com",
        frames: () => [],
        evaluate: async () => [
          {
            ref: "f1",
            role: "button",
            name: "Click me",
            bounds: { x: 0, y: 0, width: 100, height: 30 },
            visible: true,
            interactable: true,
            tagName: "button",
          },
        ],
      };
      const traverser = new FrameTraverser(mockPage);
      const result = await traverser.traverse();
      expect(result.frames.length).toBeGreaterThan(0);
      expect(result.frames[0].url).toBe("https://example.com");
    });

    it("should accept custom options", async () => {
      const mockPage = {
        url: () => "https://example.com",
        frames: () => [],
        evaluate: async () => [],
      };
      const traverser = new FrameTraverser(mockPage);
      const result = await traverser.traverse({
        maxDepth: 3,
        includeCrossOrigin: true,
        timeout: 5000,
      });
      expect(result).toBeDefined();
    });

    it("should handle page without evaluate method", async () => {
      const mockPage = { url: () => "https://example.com" };
      const traverser = new FrameTraverser(mockPage);
      const result = await traverser.traverse();
      expect(result.rootElements).toEqual([]);
    });
  });

  describe("findInAllFrames", () => {
    it("should find elements matching predicate", async () => {
      const mockPage = {
        url: () => "https://example.com",
        frames: () => [],
        evaluate: async () => [
          {
            ref: "f1",
            role: "button",
            name: "Submit",
            bounds: { x: 0, y: 0, width: 100, height: 30 },
            visible: true,
            interactable: true,
            tagName: "button",
          },
          {
            ref: "f2",
            role: "link",
            name: "Home",
            bounds: { x: 0, y: 40, width: 50, height: 20 },
            visible: true,
            interactable: true,
            tagName: "a",
          },
        ],
      };
      const traverser = new FrameTraverser(mockPage);
      const matches = await traverser.findInAllFrames((el) => el.role === "button");
      expect(matches.length).toBe(1);
      expect(matches[0].element.role).toBe("button");
    });
  });
});
