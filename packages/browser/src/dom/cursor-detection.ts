export interface CursorInteractiveElement {
  selector: string;
  tag: string;
  text: string;
  reason: "cursor-pointer" | "onclick" | "tabindex" | "draggable" | "contenteditable";
  boundingBox?: { x: number; y: number; width: number; height: number };
}

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "option",
  "menuitem",
  "tab",
  "switch",
  "slider",
  "spinbutton",
  "searchbox",
  "treeitem",
  "menu",
]);

const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "details",
  "summary",
  "label",
  "option",
]);

export const findCursorInteractiveElements = async (
  page: any,
  options: {
    rootSelector?: string;
    maxTextLength?: number;
    maxResults?: number;
  } = {},
): Promise<CursorInteractiveElement[]> => {
  const rootSelector = options.rootSelector ?? "body";
  const maxTextLength = options.maxTextLength ?? 100;
  const maxResults = options.maxResults ?? 50;

  const elements = await page.evaluate(
    (
      root: string,
      maxLen: number,
      maxRes: number,
      interactiveRoles: string[],
      interactiveTags: string[],
    ) => {
      const rootEl = document.querySelector(root);
      if (!rootEl) return [];

      const results: any[] = [];
      const seen = new Set<Element>();

      const checkElement = (el: Element): any | null => {
        if (seen.has(el)) return null;
        seen.add(el);

        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        const text = (el.textContent ?? "").trim().slice(0, maxLen);

        if (interactiveRoles.has(role)) return null;
        if (interactiveTags.includes(tag) && role === null) return null;

        let reason: string | null = null;
        const style = window.getComputedStyle(el);

        if (style.cursor === "pointer") reason = "cursor-pointer";
        else if (el.getAttribute("onclick")) reason = "onclick";
        else if (el.getAttribute("tabindex") && el.getAttribute("tabindex") !== "-1")
          reason = "tabindex";
        else if (el.getAttribute("draggable") === "true") reason = "draggable";
        else if (el.getAttribute("contenteditable") === "true") reason = "contenteditable";

        if (!reason) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5) return null;

        return {
          selector: getSelector(el),
          tag,
          text,
          reason,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      };

      const getSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        if (el.className) {
          const cls = el.className.toString().split(" ").filter(Boolean)[0];
          if (cls) return `${el.tagName.toLowerCase()}.${cls.split(" ")[0]}`;
        }
        return el.tagName.toLowerCase();
      };

      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node: Element) => {
          if (node.children.length === 0) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let count = 0;
      while (walker.nextNode() && count < maxRes) {
        const node = walker.currentNode as Element;
        const result = checkElement(node);
        if (result) {
          results.push(result);
          count++;
        }
      }

      return results;
    },
    rootSelector,
    maxTextLength,
    maxResults,
    Array.from(INTERACTIVE_ROLES),
    Array.from(INTERACTIVE_TAGS),
  );

  return elements;
};
