import { describe, it, expect } from "vitest";
import {
  ClickerGremlin,
  TyperGremlin,
  ScrollerGremlin,
  FormFillerGremlin,
  ToucherGremlin,
  GREMLIN_REGISTRY,
  createGremlin,
  type GremlinInjectionOptions,
} from "./species.js";

const defaultOptions: GremlinInjectionOptions = {
  maxX: 1280,
  maxY: 720,
  showMarkers: true,
};

describe("Gremlin Species", () => {
  describe("ClickerGremlin", () => {
    it("should have correct species identifier", () => {
      const gremlin = new ClickerGremlin();
      expect(gremlin.species).toBe("clicker");
    });

    it("should generate a valid injection script", () => {
      const gremlin = new ClickerGremlin();
      const script = gremlin.getInjectionScript(defaultOptions);
      expect(typeof script).toBe("string");
      expect(script.length).toBeGreaterThan(0);
      expect(script).toContain("elementFromPoint");
      expect(script).toContain("MouseEvent");
      expect(script).toContain("click");
    });

    it("should include marker script when showMarkers is true", () => {
      const gremlin = new ClickerGremlin();
      const script = gremlin.getInjectionScript({ ...defaultOptions, showMarkers: true });
      expect(script).toContain("marker");
    });

    it("should exclude marker script when showMarkers is false", () => {
      const gremlin = new ClickerGremlin();
      const script = gremlin.getInjectionScript({ ...defaultOptions, showMarkers: false });
      expect(script).not.toContain("marker");
    });
  });

  describe("TyperGremlin", () => {
    it("should have correct species identifier", () => {
      const gremlin = new TyperGremlin();
      expect(gremlin.species).toBe("typer");
    });

    it("should generate a valid injection script", () => {
      const gremlin = new TyperGremlin();
      const script = gremlin.getInjectionScript(defaultOptions);
      expect(typeof script).toBe("string");
      expect(script).toContain("KeyboardEvent");
      expect(script).toContain("keydown");
      expect(script).toContain("keyup");
    });

    it("should include special keys in script", () => {
      const gremlin = new TyperGremlin();
      const script = gremlin.getInjectionScript(defaultOptions);
      expect(script).toContain("Enter");
      expect(script).toContain("Tab");
      expect(script).toContain("Escape");
    });
  });

  describe("ScrollerGremlin", () => {
    it("should have correct species identifier", () => {
      const gremlin = new ScrollerGremlin();
      expect(gremlin.species).toBe("scroller");
    });

    it("should generate a valid injection script", () => {
      const gremlin = new ScrollerGremlin();
      const script = gremlin.getInjectionScript(defaultOptions);
      expect(typeof script).toBe("string");
      expect(script).toContain("scrollBy");
    });
  });

  describe("FormFillerGremlin", () => {
    it("should have correct species identifier", () => {
      const gremlin = new FormFillerGremlin();
      expect(gremlin.species).toBe("formFiller");
    });

    it("should generate a valid injection script", () => {
      const gremlin = new FormFillerGremlin();
      const script = gremlin.getInjectionScript(defaultOptions);
      expect(typeof script).toBe("string");
      expect(script).toContain("querySelectorAll");
      expect(script).toContain("email");
      expect(script).toContain("tel");
    });
  });

  describe("ToucherGremlin", () => {
    it("should have correct species identifier", () => {
      const gremlin = new ToucherGremlin();
      expect(gremlin.species).toBe("toucher");
    });

    it("should generate a valid injection script", () => {
      const gremlin = new ToucherGremlin();
      const script = gremlin.getInjectionScript(defaultOptions);
      expect(typeof script).toBe("string");
      expect(script).toContain("TouchEvent");
      expect(script).toContain("touchstart");
      expect(script).toContain("touchend");
    });
  });
});

describe("GREMLIN_REGISTRY", () => {
  it("should contain all species", () => {
    expect(Object.keys(GREMLIN_REGISTRY)).toContain("clicker");
    expect(Object.keys(GREMLIN_REGISTRY)).toContain("typer");
    expect(Object.keys(GREMLIN_REGISTRY)).toContain("scroller");
    expect(Object.keys(GREMLIN_REGISTRY)).toContain("formFiller");
    expect(Object.keys(GREMLIN_REGISTRY)).toContain("toucher");
  });
});

describe("createGremlin", () => {
  it("should create a ClickerGremlin", () => {
    const gremlin = createGremlin("clicker");
    expect(gremlin.species).toBe("clicker");
    expect(gremlin).toBeInstanceOf(ClickerGremlin);
  });

  it("should create a TyperGremlin", () => {
    const gremlin = createGremlin("typer");
    expect(gremlin.species).toBe("typer");
    expect(gremlin).toBeInstanceOf(TyperGremlin);
  });

  it("should create a ScrollerGremlin", () => {
    const gremlin = createGremlin("scroller");
    expect(gremlin.species).toBe("scroller");
  });

  it("should create a FormFillerGremlin", () => {
    const gremlin = createGremlin("formFiller");
    expect(gremlin.species).toBe("formFiller");
  });

  it("should create a ToucherGremlin", () => {
    const gremlin = createGremlin("toucher");
    expect(gremlin.species).toBe("toucher");
  });
});

describe("excludeCheck helper", () => {
  it("should return empty string for empty selectors", () => {
    const gremlin = new ClickerGremlin();
    const script = gremlin.getInjectionScript({ excludeSelectors: [] });
    expect(script).not.toContain("isExcluded");
  });

  it("should include exclude check when selectors provided", () => {
    const gremlin = new ClickerGremlin();
    const script = gremlin.getInjectionScript({ excludeSelectors: [".skip-me"] });
    expect(script).toContain("isExcluded");
    expect(script).toContain(".skip-me");
  });
});
