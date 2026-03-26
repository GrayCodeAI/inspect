// ============================================================================
// @inspect/quality - Gremlin Species Implementations
// ============================================================================

import type { GremlinSpecies } from "@inspect/shared";

/** Base interface for all gremlin species */
export interface Gremlin {
  /** Species identifier */
  readonly species: GremlinSpecies;
  /** Generate the JavaScript code to inject and execute in the page */
  getInjectionScript(options: GremlinInjectionOptions): string;
}

/** Options for gremlin injection scripts */
export interface GremlinInjectionOptions {
  /** CSS selectors to exclude from interaction */
  excludeSelectors?: string[];
  /** Max viewport width for random coordinate generation */
  maxX?: number;
  /** Max viewport height for random coordinate generation */
  maxY?: number;
  /** Whether to add visual markers for interactions */
  showMarkers?: boolean;
}

function excludeCheck(selectors: string[]): string {
  if (selectors.length === 0) return "";
  const selectorStr = selectors.map((s) => JSON.stringify(s)).join(",");
  return `
    var excludeSelectors = [${selectorStr}];
    function isExcluded(el) {
      return excludeSelectors.some(function(sel) {
        try { return el.matches(sel) || el.closest(sel); } catch(e) { return false; }
      });
    }
  `;
}

function markerScript(x: number, y: number, color: string): string {
  return `
    (function() {
      var marker = document.createElement('div');
      marker.style.cssText = 'position:fixed;left:' + (${x}-4) + 'px;top:' + (${y}-4) + 'px;width:8px;height:8px;border-radius:50%;background:${color};pointer-events:none;z-index:999999;opacity:0.7;transition:opacity 0.5s;';
      document.body.appendChild(marker);
      setTimeout(function() { marker.style.opacity = '0'; }, 300);
      setTimeout(function() { marker.remove(); }, 800);
    })();
  `;
}

/**
 * ClickerGremlin - randomly clicks elements on the page.
 * Adds red visual markers at click locations.
 */
export class ClickerGremlin implements Gremlin {
  readonly species: GremlinSpecies = "clicker";

  getInjectionScript(options: GremlinInjectionOptions): string {
    const maxX = options.maxX ?? 1280;
    const maxY = options.maxY ?? 720;
    const showMarkers = options.showMarkers ?? true;

    return `
      (function() {
        ${excludeCheck(options.excludeSelectors ?? [])}
        var x = Math.floor(Math.random() * ${maxX});
        var y = Math.floor(Math.random() * ${maxY});
        var el = document.elementFromPoint(x, y);
        if (!el) return { type: 'clicker', x: x, y: y, target: null, skipped: true };
        ${options.excludeSelectors?.length ? 'if (isExcluded(el)) return { type: "clicker", x: x, y: y, target: el.tagName, skipped: true };' : ''}

        ${showMarkers ? `
        var marker = document.createElement('div');
        marker.style.cssText = 'position:fixed;left:' + (x-5) + 'px;top:' + (y-5) + 'px;width:10px;height:10px;border-radius:50%;background:red;pointer-events:none;z-index:999999;opacity:0.8;transition:opacity 0.5s;';
        document.body.appendChild(marker);
        setTimeout(function() { marker.style.opacity = '0'; }, 300);
        setTimeout(function() { marker.remove(); }, 800);
        ` : ''}

        el.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, view: window,
          clientX: x, clientY: y
        }));

        return { type: 'clicker', x: x, y: y, target: el.tagName, skipped: false };
      })()
    `;
  }
}

/**
 * TyperGremlin - types random keyboard input into focused elements.
 */
export class TyperGremlin implements Gremlin {
  readonly species: GremlinSpecies = "typer";

  private static readonly CHARS = "abcdefghijklmnopqrstuvwxyz0123456789 !@#$%^&*()";
  private static readonly SPECIAL_KEYS = ["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

  getInjectionScript(options: GremlinInjectionOptions): string {
    return `
      (function() {
        ${excludeCheck(options.excludeSelectors ?? [])}
        var chars = ${JSON.stringify(TyperGremlin.CHARS)};
        var specialKeys = ${JSON.stringify(TyperGremlin.SPECIAL_KEYS)};

        var activeEl = document.activeElement;
        if (!activeEl || activeEl === document.body) {
          // Try to focus a random input
          var inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]');
          if (inputs.length > 0) {
            activeEl = inputs[Math.floor(Math.random() * inputs.length)];
            activeEl.focus();
          } else {
            return { type: 'typer', key: null, target: null, skipped: true };
          }
        }

        ${options.excludeSelectors?.length ? 'if (isExcluded(activeEl)) return { type: "typer", key: null, target: activeEl.tagName, skipped: true };' : ''}

        var key;
        if (Math.random() < 0.1) {
          key = specialKeys[Math.floor(Math.random() * specialKeys.length)];
        } else {
          key = chars[Math.floor(Math.random() * chars.length)];
        }

        activeEl.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
        activeEl.dispatchEvent(new KeyboardEvent('keypress', { key: key, bubbles: true }));

        if (key.length === 1 && activeEl.tagName !== 'BODY') {
          if (activeEl.value !== undefined) {
            activeEl.value += key;
          }
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        activeEl.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));

        return { type: 'typer', key: key, target: activeEl.tagName, skipped: false };
      })()
    `;
  }
}

/**
 * ScrollerGremlin - randomly scrolls the page or scrollable elements.
 */
export class ScrollerGremlin implements Gremlin {
  readonly species: GremlinSpecies = "scroller";

  getInjectionScript(options: GremlinInjectionOptions): string {
    const maxX = options.maxX ?? 1280;
    const maxY = options.maxY ?? 720;

    return `
      (function() {
        var scrollX = (Math.random() - 0.5) * 800;
        var scrollY = (Math.random() - 0.5) * 800;

        // Sometimes scroll a random element instead of the page
        if (Math.random() < 0.3) {
          var x = Math.floor(Math.random() * ${maxX});
          var y = Math.floor(Math.random() * ${maxY});
          var el = document.elementFromPoint(x, y);
          if (el && el.scrollHeight > el.clientHeight) {
            el.scrollBy({ left: scrollX, top: scrollY, behavior: 'auto' });
            return { type: 'scroller', scrollX: scrollX, scrollY: scrollY, target: el.tagName, page: false };
          }
        }

        window.scrollBy({ left: scrollX, top: scrollY, behavior: 'auto' });
        return { type: 'scroller', scrollX: scrollX, scrollY: scrollY, target: 'window', page: true };
      })()
    `;
  }
}

/**
 * FormFillerGremlin - fills form inputs with random data.
 */
export class FormFillerGremlin implements Gremlin {
  readonly species: GremlinSpecies = "formFiller";

  getInjectionScript(options: GremlinInjectionOptions): string {
    return `
      (function() {
        ${excludeCheck(options.excludeSelectors ?? [])}

        var inputs = document.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([disabled]), ' +
          'textarea:not([disabled]), ' +
          'select:not([disabled])'
        );

        if (inputs.length === 0) {
          return { type: 'formFiller', filled: 0, skipped: true };
        }

        var input = inputs[Math.floor(Math.random() * inputs.length)];
        ${options.excludeSelectors?.length ? 'if (isExcluded(input)) return { type: "formFiller", filled: 0, skipped: true };' : ''}

        var type = (input.type || input.tagName).toLowerCase();
        var value;

        switch (type) {
          case 'email':
            value = 'gremlin' + Math.floor(Math.random() * 9999) + '@test.com';
            break;
          case 'tel':
            value = '+1' + Math.floor(Math.random() * 9000000000 + 1000000000);
            break;
          case 'number':
          case 'range':
            var min = parseFloat(input.min) || 0;
            var max = parseFloat(input.max) || 100;
            value = String(Math.floor(Math.random() * (max - min) + min));
            break;
          case 'date':
            var d = new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000));
            value = d.toISOString().split('T')[0];
            break;
          case 'url':
            value = 'https://example.com/' + Math.random().toString(36).slice(2);
            break;
          case 'color':
            value = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            break;
          case 'checkbox':
          case 'radio':
            input.checked = !input.checked;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return { type: 'formFiller', filled: 1, inputType: type, value: input.checked };
          case 'select':
          case 'select-one':
            if (input.options && input.options.length > 0) {
              input.selectedIndex = Math.floor(Math.random() * input.options.length);
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return { type: 'formFiller', filled: 1, inputType: type, value: input.value };
          case 'textarea':
            value = 'Lorem ipsum dolor sit amet, gremlin ' + Math.random().toString(36).slice(2, 10);
            break;
          default:
            value = 'gremlin_' + Math.random().toString(36).slice(2, 10);
        }

        if (value !== undefined) {
          input.focus();
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return { type: 'formFiller', filled: 1, inputType: type, value: value };
      })()
    `;
  }
}

/**
 * ToucherGremlin - dispatches random touch events.
 */
export class ToucherGremlin implements Gremlin {
  readonly species: GremlinSpecies = "toucher";

  getInjectionScript(options: GremlinInjectionOptions): string {
    const maxX = options.maxX ?? 1280;
    const maxY = options.maxY ?? 720;

    return `
      (function() {
        ${excludeCheck(options.excludeSelectors ?? [])}
        var x = Math.floor(Math.random() * ${maxX});
        var y = Math.floor(Math.random() * ${maxY});
        var el = document.elementFromPoint(x, y);
        if (!el) return { type: 'toucher', x: x, y: y, target: null, skipped: true };
        ${options.excludeSelectors?.length ? 'if (isExcluded(el)) return { type: "toucher", x: x, y: y, target: el.tagName, skipped: true };' : ''}

        var touchObj = new Touch({
          identifier: Date.now(),
          target: el,
          clientX: x,
          clientY: y,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1
        });

        var touchStartEvent = new TouchEvent('touchstart', {
          bubbles: true, cancelable: true,
          touches: [touchObj], targetTouches: [touchObj], changedTouches: [touchObj]
        });
        el.dispatchEvent(touchStartEvent);

        // Simulate brief hold then release
        var touchEndEvent = new TouchEvent('touchend', {
          bubbles: true, cancelable: true,
          touches: [], targetTouches: [], changedTouches: [touchObj]
        });
        el.dispatchEvent(touchEndEvent);

        return { type: 'toucher', x: x, y: y, target: el.tagName, skipped: false };
      })()
    `;
  }
}

/** Map of species name to gremlin class */
export const GREMLIN_REGISTRY: Record<GremlinSpecies, new () => Gremlin> = {
  clicker: ClickerGremlin,
  typer: TyperGremlin,
  scroller: ScrollerGremlin,
  formFiller: FormFillerGremlin,
  toucher: ToucherGremlin,
};

/** Create a gremlin instance by species name */
export function createGremlin(species: GremlinSpecies): Gremlin {
  const GremlinClass = GREMLIN_REGISTRY[species];
  return new GremlinClass();
}
