// ============================================================================
// @inspect/browser - Page to Markdown Converter
//
// Converts a live Playwright page into clean, readable Markdown.
// Preserves document structure (headings, lists, tables, links) and
// annotates interactive elements with ref IDs for agent consumption.
// ============================================================================

import type { Page } from "playwright";

export interface PageToMarkdownOptions {
  /** Include interactive element ref annotations (e.g. [e1]). Default: true */
  includeRefs?: boolean;
  /** Include images as markdown image tags. Default: true */
  includeImages?: boolean;
  /** Include hidden/invisible elements. Default: false */
  includeHidden?: boolean;
  /** Maximum content length in characters. Default: 50000 */
  maxLength?: number;
  /** Include page metadata (title, URL, description). Default: true */
  includeMetadata?: boolean;
}

interface ExtractedPage {
  url: string;
  title: string;
  description: string;
  lang: string;
  markdown: string;
}

/**
 * PageToMarkdown converts a live browser page into structured Markdown.
 *
 * Unlike HTML-to-Markdown converters that work on raw HTML strings, this
 * operates on a live Playwright page and uses the browser's computed layout
 * to determine visibility, reading order, and interactive elements.
 */
export class PageToMarkdown {
  private options: Required<PageToMarkdownOptions>;

  constructor(options: PageToMarkdownOptions = {}) {
    this.options = {
      includeRefs: options.includeRefs ?? true,
      includeImages: options.includeImages ?? true,
      includeHidden: options.includeHidden ?? false,
      maxLength: options.maxLength ?? 50_000,
      includeMetadata: options.includeMetadata ?? true,
    };
  }

  /**
   * Convert the current page to Markdown.
   */
  async convert(page: Page): Promise<ExtractedPage> {
    const metadata = await this.extractMetadata(page);
    const markdown = await this.extractContent(page);

    let result = "";

    if (this.options.includeMetadata) {
      result += `# ${metadata.title}\n\n`;
      if (metadata.description) {
        result += `> ${metadata.description}\n\n`;
      }
      result += `**URL:** ${metadata.url}\n\n---\n\n`;
    }

    result += markdown;

    // Enforce max length
    if (result.length > this.options.maxLength) {
      result = result.slice(0, this.options.maxLength) + "\n\n[... content truncated]";
    }

    return {
      url: metadata.url,
      title: metadata.title,
      description: metadata.description,
      lang: metadata.lang,
      markdown: result,
    };
  }

  /**
   * Extract page metadata.
   */
  private async extractMetadata(page: Page): Promise<{
    url: string;
    title: string;
    description: string;
    lang: string;
  }> {
    return page.evaluate(() => {
      const meta = (name: string) =>
        document
          .querySelector(`meta[name="${name}"], meta[property="${name}"]`)
          ?.getAttribute("content") ?? "";

      return {
        url: location.href,
        title: document.title || "",
        description: meta("description") || meta("og:description") || "",
        lang: document.documentElement.lang || "en",
      };
    });
  }

  /**
   * Extract and convert page content to Markdown using browser evaluation.
   */
  private async extractContent(page: Page): Promise<string> {
    const includeRefs = this.options.includeRefs;
    const includeImages = this.options.includeImages;
    const includeHidden = this.options.includeHidden;

    return page.evaluate(
      ({ includeRefs, includeImages, includeHidden }) => {
        let refCounter = 0;

        function isVisible(el: Element): boolean {
          if (includeHidden) return true;
          const style = window.getComputedStyle(el);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            el.getBoundingClientRect().height > 0
          );
        }

        function isInteractive(el: Element): boolean {
          const tag = el.tagName.toLowerCase();
          if (["a", "button", "input", "select", "textarea", "details", "summary"].includes(tag))
            return true;
          if (el.hasAttribute("onclick") || el.hasAttribute("tabindex") || el.hasAttribute("role"))
            return true;
          if (el.getAttribute("contenteditable") === "true") return true;
          return false;
        }

        function getRef(): string {
          return `e${++refCounter}`;
        }

        function escapeMarkdown(text: string): string {
          return text.replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        function processNode(node: Node, depth: number = 0): string {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.replace(/\s+/g, " ") ?? "";
            return text;
          }

          if (node.nodeType !== Node.ELEMENT_NODE) return "";

          const el = node as Element;
          const tag = el.tagName.toLowerCase();

          // Skip invisible, script, style, etc.
          if (["script", "style", "noscript", "meta", "link", "template", "svg"].includes(tag))
            return "";
          if (!isVisible(el)) return "";

          const refTag = includeRefs && isInteractive(el) ? `[${getRef()}] ` : "";
          const children = () => {
            let out = "";
            for (const child of el.childNodes) {
              out += processNode(child, depth);
            }
            return out;
          };

          switch (tag) {
            // Headings
            case "h1":
              return `\n\n# ${refTag}${children().trim()}\n\n`;
            case "h2":
              return `\n\n## ${refTag}${children().trim()}\n\n`;
            case "h3":
              return `\n\n### ${refTag}${children().trim()}\n\n`;
            case "h4":
              return `\n\n#### ${refTag}${children().trim()}\n\n`;
            case "h5":
              return `\n\n##### ${refTag}${children().trim()}\n\n`;
            case "h6":
              return `\n\n###### ${refTag}${children().trim()}\n\n`;

            // Block elements
            case "p":
              return `\n\n${refTag}${children().trim()}\n\n`;
            case "blockquote": {
              const content = children()
                .trim()
                .split("\n")
                .map((l) => `> ${l}`)
                .join("\n");
              return `\n\n${content}\n\n`;
            }
            case "pre": {
              const code = el.querySelector("code");
              const langClass = code?.className.match(/language-(\w+)/)?.[1] ?? "";
              const text = (code ?? el).textContent ?? "";
              return `\n\n\`\`\`${langClass}\n${text.trim()}\n\`\`\`\n\n`;
            }
            case "hr":
              return "\n\n---\n\n";
            case "br":
              return "\n";

            // Lists
            case "ul": {
              let items = "";
              for (const child of el.children) {
                if (child.tagName.toLowerCase() === "li") {
                  const ref = includeRefs && isInteractive(child) ? `[${getRef()}] ` : "";
                  const content = processNode(child, depth + 1).trim();
                  items += `${"  ".repeat(depth)}- ${ref}${content}\n`;
                }
              }
              return `\n${items}\n`;
            }
            case "ol": {
              let items = "";
              let idx = 1;
              for (const child of el.children) {
                if (child.tagName.toLowerCase() === "li") {
                  const ref = includeRefs && isInteractive(child) ? `[${getRef()}] ` : "";
                  const content = processNode(child, depth + 1).trim();
                  items += `${"  ".repeat(depth)}${idx}. ${ref}${content}\n`;
                  idx++;
                }
              }
              return `\n${items}\n`;
            }
            case "li":
              return children();

            // Tables
            case "table": {
              const rows: string[][] = [];
              const headerRows: string[][] = [];

              for (const section of el.children) {
                const sTag = section.tagName.toLowerCase();
                const targetRows = sTag === "thead" ? headerRows : rows;

                for (const row of section.children) {
                  if (row.tagName.toLowerCase() !== "tr") continue;
                  const cells: string[] = [];
                  for (const cell of row.children) {
                    const cTag = cell.tagName.toLowerCase();
                    if (cTag === "td" || cTag === "th") {
                      cells.push(escapeMarkdown((cell.textContent ?? "").trim()));
                    }
                  }
                  if (cells.length > 0) targetRows.push(cells);
                }
              }

              // If no thead, first row from tbody is header
              if (headerRows.length === 0 && rows.length > 0) {
                headerRows.push(rows.shift()!);
              }

              if (headerRows.length === 0) return "";

              const maxCols = Math.max(...[...headerRows, ...rows].map((r) => r.length));
              const pad = (cells: string[]) => {
                while (cells.length < maxCols) cells.push("");
                return `| ${cells.join(" | ")} |`;
              };

              let table = "\n\n";
              for (const hr of headerRows) table += pad(hr) + "\n";
              table += `| ${Array(maxCols).fill("---").join(" | ")} |\n`;
              for (const r of rows) table += pad(r) + "\n";
              return table + "\n";
            }

            // Inline elements
            case "a": {
              const href = el.getAttribute("href") ?? "";
              const text = children().trim();
              if (!text) return "";
              return `${refTag}[${text}](${href})`;
            }
            case "strong":
            case "b":
              return `**${children().trim()}**`;
            case "em":
            case "i":
              return `*${children().trim()}*`;
            case "code":
              return `\`${(el.textContent ?? "").trim()}\``;
            case "del":
            case "s":
              return `~~${children().trim()}~~`;
            case "mark":
              return `==${children().trim()}==`;

            // Images
            case "img": {
              if (!includeImages) return "";
              const src = el.getAttribute("src") ?? "";
              const alt = el.getAttribute("alt") ?? "";
              return `${refTag}![${alt}](${src})`;
            }

            // Forms
            case "input": {
              const type = el.getAttribute("type") ?? "text";
              const value = (el as HTMLInputElement).value ?? "";
              const placeholder = el.getAttribute("placeholder") ?? "";
              const label = placeholder || type;
              return `${refTag}[input:${label}${value ? `="${value}"` : ""}]`;
            }
            case "textarea": {
              const value = (el as HTMLTextAreaElement).value ?? "";
              const placeholder = el.getAttribute("placeholder") ?? "textarea";
              return `${refTag}[textarea:${placeholder}${value ? `="${value}"` : ""}]`;
            }
            case "select": {
              const selected = (el as HTMLSelectElement).selectedOptions?.[0]?.textContent ?? "";
              return `${refTag}[select:${selected || "..."}]`;
            }
            case "button": {
              const text = children().trim() || el.getAttribute("aria-label") || "button";
              return `${refTag}[button:${text}]`;
            }

            // Semantic sections
            case "nav":
              return `\n\n**Navigation:**\n${children()}\n`;
            case "main":
              return children();
            case "header":
              return children();
            case "footer":
              return `\n\n---\n\n${children()}`;
            case "aside":
              return `\n\n> **Aside:**\n${children()
                .trim()
                .split("\n")
                .map((l) => `> ${l}`)
                .join("\n")}\n\n`;
            case "section":
            case "article":
            case "div":
            case "span":
            case "figure":
            case "figcaption":
            case "label":
            case "form":
              return `${refTag}${children()}`;

            // Skip iframes, objects, etc.
            case "iframe":
            case "object":
            case "embed":
            case "video":
            case "audio":
            case "canvas":
              return `${refTag}[${tag}]`;

            default:
              return children();
          }
        }

        const body = document.body;
        if (!body) return "";

        let result = processNode(body);

        // Clean up excessive whitespace
        result = result.replace(/\n{3,}/g, "\n\n");
        result = result.replace(/[ \t]+$/gm, "");
        result = result.trim();

        return result;
      },
      { includeRefs, includeImages, includeHidden },
    );
  }
}
