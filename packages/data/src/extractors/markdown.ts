// ============================================================================
// @inspect/data - Markdown Extractor (HTML to Markdown)
// ============================================================================

/**
 * MarkdownExtractor converts HTML to clean Markdown.
 * Preserves links, lists, code blocks, tables, and headings.
 * Designed for extracting readable content from web pages.
 */
export class MarkdownExtractor {
  /**
   * Convert HTML to clean Markdown.
   */
  extractMarkdown(html: string): string {
    let result = html;

    // Remove script and style tags with content
    result = result.replace(/<script[\s\S]*?<\/script>/gi, "");
    result = result.replace(/<style[\s\S]*?<\/style>/gi, "");
    result = result.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

    // Remove HTML comments
    result = result.replace(/<!--[\s\S]*?-->/g, "");

    // Process block-level elements first

    // Headings
    result = result.replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi,
      (_match, level: string, content: string) => {
        const prefix = "#".repeat(parseInt(level, 10));
        const cleanContent = this.stripInlineTags(content).trim();
        return `\n\n${prefix} ${cleanContent}\n\n`;
      },
    );

    // Code blocks (pre > code)
    result = result.replace(
      /<pre[^>]*>\s*<code[^>]*(?:class="[^"]*language-(\w+)"[^>]*)?>([\s\S]*?)<\/code>\s*<\/pre>/gi,
      (_match, lang: string | undefined, code: string) => {
        const language = lang ?? "";
        const decodedCode = this.decodeEntities(code).trim();
        return `\n\n\`\`\`${language}\n${decodedCode}\n\`\`\`\n\n`;
      },
    );

    // Pre blocks without code
    result = result.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, content: string) => {
      return `\n\n\`\`\`\n${this.decodeEntities(content).trim()}\n\`\`\`\n\n`;
    });

    // Tables
    result = this.convertTables(result);

    // Blockquotes
    result = result.replace(
      /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
      (_match, content: string) => {
        const lines = this.stripInlineTags(content)
          .trim()
          .split("\n")
          .map((line) => `> ${line.trim()}`)
          .join("\n");
        return `\n\n${lines}\n\n`;
      },
    );

    // Ordered lists
    result = this.convertLists(result);

    // Horizontal rules
    result = result.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

    // Paragraphs and divs
    result = result.replace(/<\/p>/gi, "\n\n");
    result = result.replace(/<p[^>]*>/gi, "\n\n");
    result = result.replace(/<\/div>/gi, "\n");
    result = result.replace(/<div[^>]*>/gi, "\n");

    // Line breaks
    result = result.replace(/<br\s*\/?>/gi, "\n");

    // Process inline elements

    // Bold
    result = result.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**");

    // Italic
    result = result.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*");

    // Strikethrough
    result = result.replace(/<(?:del|s|strike)[^>]*>([\s\S]*?)<\/(?:del|s|strike)>/gi, "~~$1~~");

    // Inline code
    result = result.replace(
      /<code[^>]*>([\s\S]*?)<\/code>/gi,
      (_match, content: string) => `\`${this.decodeEntities(content)}\``,
    );

    // Links
    result = result.replace(
      /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, text: string) => {
        const cleanText = this.stripInlineTags(text).trim();
        if (!cleanText) return "";
        if (href === cleanText) return href;
        return `[${cleanText}](${href})`;
      },
    );

    // Images
    result = result.replace(
      /<img[^>]*src="([^"]*)"[^>]*(?:alt="([^"]*)")?[^>]*\/?>/gi,
      (_match, src: string, alt: string | undefined) => {
        return `![${alt ?? ""}](${src})`;
      },
    );

    // Remove remaining HTML tags
    result = result.replace(/<[^>]+>/g, "");

    // Decode HTML entities
    result = this.decodeEntities(result);

    // Clean up whitespace
    result = result.replace(/\n{3,}/g, "\n\n");
    result = result.replace(/[ \t]+\n/g, "\n");
    result = result.replace(/\n[ \t]+/g, "\n");
    result = result.replace(/[ \t]{2,}/g, " ");
    result = result.trim();

    return result;
  }

  /**
   * Convert HTML tables to Markdown tables.
   */
  private convertTables(html: string): string {
    return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableContent: string) => {
      const rows: string[][] = [];

      // Extract thead rows
      const theadMatch = tableContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
      if (theadMatch) {
        const headerRows = this.extractTableRows(theadMatch[1]);
        rows.push(...headerRows);
      }

      // Extract tbody rows
      const tbodyMatch = tableContent.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
      if (tbodyMatch) {
        const bodyRows = this.extractTableRows(tbodyMatch[1]);
        rows.push(...bodyRows);
      }

      // If no thead/tbody, extract rows directly
      if (rows.length === 0) {
        rows.push(...this.extractTableRows(tableContent));
      }

      if (rows.length === 0) return "";

      // Build markdown table
      const maxCols = Math.max(...rows.map((r) => r.length));
      const lines: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i];
        // Pad to max columns
        while (cells.length < maxCols) cells.push("");
        lines.push(`| ${cells.join(" | ")} |`);

        // Add separator after header row
        if (i === 0) {
          const separator = cells.map(() => "---");
          lines.push(`| ${separator.join(" | ")} |`);
        }
      }

      return `\n\n${lines.join("\n")}\n\n`;
    });
  }

  /**
   * Extract table rows from HTML.
   */
  private extractTableRows(html: string): string[][] {
    const rows: string[][] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(this.stripInlineTags(cellMatch[1]).trim());
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    return rows;
  }

  /**
   * Convert HTML lists to Markdown.
   */
  private convertLists(html: string): string {
    // Process nested lists from inside out
    let result = html;
    let maxIterations = 10;

    while (maxIterations-- > 0) {
      const before = result;

      // Unordered lists
      result = result.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match, content: string) => {
        return this.processListItems(content, "ul", 0);
      });

      // Ordered lists
      result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_match, content: string) => {
        return this.processListItems(content, "ol", 0);
      });

      if (result === before) break;
    }

    return result;
  }

  /**
   * Process list items.
   */
  private processListItems(html: string, listType: "ul" | "ol", depth: number): string {
    const items: string[] = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;
    let index = 1;

    while ((match = liRegex.exec(html)) !== null) {
      const content = this.stripInlineTags(match[1]).trim();
      const indent = "  ".repeat(depth);
      const prefix = listType === "ul" ? "-" : `${index}.`;
      items.push(`${indent}${prefix} ${content}`);
      index++;
    }

    return `\n${items.join("\n")}\n`;
  }

  /**
   * Strip inline HTML tags but keep text content.
   */
  private stripInlineTags(html: string): string {
    return html.replace(/<[^>]+>/g, "");
  }

  /**
   * Decode common HTML entities.
   */
  private decodeEntities(text: string): string {
    const entities: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'",
      "&apos;": "'",
      "&nbsp;": " ",
      "&mdash;": "--",
      "&ndash;": "-",
      "&laquo;": "<<",
      "&raquo;": ">>",
      "&bull;": "*",
      "&hellip;": "...",
      "&copy;": "(c)",
      "&reg;": "(R)",
      "&trade;": "(TM)",
      "&ldquo;": '"',
      "&rdquo;": '"',
      "&lsquo;": "'",
      "&rsquo;": "'",
    };

    let result = text;
    for (const [entity, replacement] of Object.entries(entities)) {
      result = result.split(entity).join(replacement);
    }

    // Decode numeric entities
    result = result.replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    );
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) =>
      String.fromCharCode(parseInt(code, 16)),
    );

    return result;
  }
}
