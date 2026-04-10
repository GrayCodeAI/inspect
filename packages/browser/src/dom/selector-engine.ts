// ============================================================================
// @inspect/browser - Selector Engine Registration
// ============================================================================
// Register custom selector engines (based on Playwright pattern)

import type { Page, Locator } from "playwright";

export interface SelectorEngine {
  name: string;
  create: (page: Page, selector: string) => Locator;
  queryOne?: (page: Page, selector: string) => Promise<Locator | null>;
  queryAll?: (page: Page, selector: string) => Promise<Locator[]>;
}

export type { Locator };

const registeredEngines = new Map<string, SelectorEngine>();

/**
 * Register a custom selector engine.
 * Follows Playwright's engine registration pattern.
 */
export function registerSelectorEngine(engine: SelectorEngine): void {
  registeredEngines.set(engine.name, engine);
}

/**
 * Create a locator using a registered custom engine.
 */
export function createEngineLocator(
  page: Page,
  engineName: string,
  selector: string,
): Locator | null {
  const engine = registeredEngines.get(engineName);
  if (!engine) return null;
  return engine.create(page, selector);
}

/**
 * Query a single element using custom engine.
 */
export async function queryEngineOne(
  page: Page,
  engineName: string,
  selector: string,
): Promise<Locator | null> {
  const engine = registeredEngines.get(engineName);
  if (!engine) return null;

  if (engine.queryOne) {
    return engine.queryOne(page, selector);
  }

  const locator = engine.create(page, selector);
  const count = await locator.count();
  return count > 0 ? locator.first() : null;
}

/**
 * Query all elements using custom engine.
 */
export async function queryEngineAll(
  page: Page,
  engineName: string,
  selector: string,
): Promise<Locator[]> {
  const engine = registeredEngines.get(engineName);
  if (!engine?.queryAll) {
    const locator = engine?.create(page, selector);
    return locator ? await locator.all() : [];
  }
  return engine.queryAll(page, selector);
}

/**
 * Get all registered engine names.
 */
export function getRegisteredEngines(): string[] {
  return Array.from(registeredEngines.keys());
}

/**
 * Register common selector engines.
 */
export function registerCommonEngines(page: Page): void {
  registerSelectorEngine({
    name: "visible",
    create: (p, s) => p.locator(`${s}:visible`),
    queryOne: async (p, s) => {
      const el = p.locator(`${s}:visible`).first();
      return (await el.count()) > 0 ? el : null;
    },
  });

  registerSelectorEngine({
    name: "text",
    create: (p, s) => p.getByText(s, { exact: true }),
  });

  registerSelectorEngine({
    name: "role",
    create: (p, s) => p.getByRole(s as any),
  });

  registerSelectorEngine({
    name: "label",
    create: (p, s) => p.getByLabel(s),
  });
}
