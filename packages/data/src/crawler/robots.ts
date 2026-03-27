// ──────────────────────────────────────────────────────────────────────────────
// @inspect/data - Robots.txt Parser
// ──────────────────────────────────────────────────────────────────────────────

/** Parsed robots.txt rule */
export interface RobotsRule {
  userAgent: string;
  disallows: string[];
  allows: string[];
  crawlDelay?: number;
  sitemaps: string[];
}

/**
 * Parse and evaluate robots.txt rules.
 */
export class RobotsParser {
  private rules: RobotsRule[] = [];
  private sitemaps: string[] = [];

  constructor(content: string) {
    this.parse(content);
  }

  /**
   * Check if a URL is allowed for the given user agent.
   */
  isAllowed(url: string, userAgent: string = "*"): boolean {
    const path = this.getPath(url);
    const applicableRules = this.getRulesForAgent(userAgent);

    for (const rule of applicableRules) {
      // Check explicit allows first
      for (const allow of rule.allows) {
        if (path.startsWith(allow)) return true;
      }

      // Then check disallows
      for (const disallow of rule.disallows) {
        if (path.startsWith(disallow)) return false;
      }
    }

    return true;
  }

  /**
   * Get crawl delay for a user agent.
   */
  getCrawlDelay(userAgent: string = "*"): number | undefined {
    const rules = this.getRulesForAgent(userAgent);
    for (const rule of rules) {
      if (rule.crawlDelay !== undefined) return rule.crawlDelay;
    }
    return undefined;
  }

  /**
   * Get all sitemaps referenced in robots.txt.
   */
  getSitemaps(): string[] {
    return [...this.sitemaps];
  }

  private parse(content: string): void {
    const lines = content.split("\n");
    let currentRule: RobotsRule | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const commentIndex = line.indexOf("#");
      const cleanLine = commentIndex >= 0 ? line.slice(0, commentIndex).trim() : line;
      const [directive, ...valueParts] = cleanLine.split(":");
      const value = valueParts.join(":").trim();

      switch (directive.toLowerCase().trim()) {
        case "user-agent":
          if (currentRule && currentRule.disallows.length > 0) {
            this.rules.push(currentRule);
          }
          currentRule = { userAgent: value, disallows: [], allows: [], sitemaps: [] };
          break;

        case "disallow":
          if (currentRule && value) {
            currentRule.disallows.push(value);
          }
          break;

        case "allow":
          if (currentRule && value) {
            currentRule.allows.push(value);
          }
          break;

        case "crawl-delay":
          if (currentRule && value) {
            currentRule.crawlDelay = parseFloat(value) * 1000; // Convert to ms
          }
          break;

        case "sitemap":
          if (value) {
            this.sitemaps.push(value);
          }
          break;
      }
    }

    if (currentRule && currentRule.disallows.length > 0) {
      this.rules.push(currentRule);
    }
  }

  private getRulesForAgent(userAgent: string): RobotsRule[] {
    const lowerAgent = userAgent.toLowerCase();
    const specific = this.rules.filter((r) => r.userAgent.toLowerCase() === lowerAgent);
    const wildcard = this.rules.filter((r) => r.userAgent === "*");
    return specific.length > 0 ? specific : wildcard;
  }

  private getPath(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
}
