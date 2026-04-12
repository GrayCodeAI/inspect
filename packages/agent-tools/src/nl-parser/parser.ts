// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent-tools - Natural Language Parser
// Parses browser automation instructions into structured actions
// ──────────────────────────────────────────────────────────────────────────────

import {
  type ParsedAction,
  type ParseResult,
  type ParserConfig,
  type GrammarPattern,
  type ActionParams,
  type ElementDescriptor,
  DEFAULT_PARSER_CONFIG,
} from "./types.js";
import { getPatternsByPriority, allPatterns } from "./grammar.js";

export class NLParser {
  private config: ParserConfig;
  private patterns: GrammarPattern[];
  private customPatterns: GrammarPattern[] = [];

  constructor(config: Partial<ParserConfig> = {}) {
    this.config = { ...DEFAULT_PARSER_CONFIG, ...config };
    this.patterns = getPatternsByPriority();
  }

  /**
   * Add custom patterns for domain-specific actions
   */
  addCustomPatterns(patterns: GrammarPattern[]): void {
    this.customPatterns.push(...patterns);
    // Re-sort with custom patterns (highest priority)
    this.patterns = [...this.customPatterns, ...getPatternsByPriority()].sort(
      (a, b) => b.priority - a.priority,
    );
  }

  /**
   * Parse a natural language instruction into structured action
   */
  parse(instruction: string): ParseResult {
    const startTime = performance.now();
    const alternatives: ParsedAction[] = [];

    // Normalize instruction
    const normalizedInstruction = this.config.caseSensitive
      ? instruction.trim()
      : instruction.toLowerCase().trim();

    // Try each pattern
    for (const pattern of this.patterns) {
      const match = this.tryPattern(pattern, normalizedInstruction);
      if (match) {
        alternatives.push(match);

        // Stop at first high-confidence match
        if (match.confidence >= 0.95) {
          break;
        }
      }

      // Timeout check
      if (performance.now() - startTime > this.config.maxParseTime) {
        break;
      }
    }

    // Sort by confidence
    alternatives.sort((a, b) => b.confidence - a.confidence);

    const bestMatch = alternatives.find((a) => a.confidence >= this.config.minConfidence) || null;

    const parseTime = performance.now() - startTime;

    if (!bestMatch) {
      return {
        bestMatch: null,
        alternatives,
        success: false,
        error: `No matching pattern found for: "${instruction}"`,
        parseTime,
      };
    }

    return {
      bestMatch,
      alternatives: alternatives.slice(0, 3), // Top 3 alternatives
      success: true,
      parseTime,
    };
  }

  /**
   * Try to match a single pattern
   */
  private tryPattern(pattern: GrammarPattern, instruction: string): ParsedAction | null {
    for (const regex of pattern.patterns) {
      const match = instruction.match(regex);
      if (match) {
        // Extract parameters
        const params: ActionParams = {};
        for (const extractor of pattern.extractors) {
          Object.assign(params, extractor(match, instruction));
        }

        // Calculate confidence
        const confidence = this.calculateConfidence(match, pattern, instruction);

        return {
          type: pattern.actionType,
          params,
          confidence,
          originalInstruction: instruction,
          matchedPattern: pattern.name,
          entities: this.config.entityRecognition ? this.extractEntities(instruction) : [],
        };
      }
    }
    return null;
  }

  /**
   * Calculate match confidence based on pattern quality
   */
  private calculateConfidence(
    match: RegExpMatchArray,
    pattern: GrammarPattern,
    instruction: string,
  ): number {
    let confidence = 0.7; // Base confidence

    // Higher priority patterns get boost
    confidence += pattern.priority / 1000;

    // Longer matches = higher confidence
    if (match[0].length === instruction.length) {
      confidence += 0.1; // Full match
    }

    // More captured groups = more specific = higher confidence
    const filledGroups = match.slice(1).filter((g) => g && g.trim()).length;
    confidence += filledGroups * 0.05;

    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }

  /**
   * Extract entities from instruction
   */
  private extractEntities(instruction: string): Array<{
    type: "url" | "email" | "number" | "text";
    value: string;
    position: { start: number; end: number };
    confidence: number;
  }> {
    const entities: Array<{
      type: "url" | "email" | "number" | "text";
      value: string;
      position: { start: number; end: number };
      confidence: number;
    }> = [];

    // URL detection
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = urlRegex.exec(instruction)) !== null) {
      entities.push({
        type: "url",
        value: m[1],
        position: { start: m.index, end: m.index + m[0].length },
        confidence: 1.0,
      });
    }

    // Email detection
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
    while ((m = emailRegex.exec(instruction)) !== null) {
      entities.push({
        type: "email",
        value: m[1],
        position: { start: m.index, end: m.index + m[0].length },
        confidence: 1.0,
      });
    }

    // Number detection
    const numRegex = /\b(\d+)\b/g;
    while ((m = numRegex.exec(instruction)) !== null) {
      entities.push({
        type: "number",
        value: m[1],
        position: { start: m.index, end: m.index + m[0].length },
        confidence: 0.9,
      });
    }

    // Quoted strings
    const quoteRegex = /["']([^"']+)["']/g;
    while ((m = quoteRegex.exec(instruction)) !== null) {
      entities.push({
        type: "text",
        value: m[1],
        position: { start: m.index, end: m.index + m[0].length },
        confidence: 0.95,
      });
    }

    return entities;
  }

  /**
   * Parse element descriptor from text
   */
  parseElementDescriptor(text: string): ElementDescriptor {
    const descriptor: ElementDescriptor = {};

    // Role detection
    const rolePatterns: Array<[RegExp, string]> = [
      [/\b(button|btn)\b/i, "button"],
      [/\b(link|a\b)/i, "link"],
      [/\b(input|field|box)\b/i, "input"],
      [/\b(dropdown|select|menu)\b/i, "dropdown"],
      [/\b(checkbox|check box)\b/i, "checkbox"],
      [/\b(radio|radio button)\b/i, "radio"],
      [/\b(tab)\b/i, "tab"],
      [/\b(icon|image|img)\b/i, "image"],
    ];

    for (const [pattern, role] of rolePatterns) {
      if (pattern.test(text)) {
        descriptor.role = role;
        break;
      }
    }

    // Index detection (first, second, last, 3rd, etc.)
    const indexPatterns: Array<[RegExp, string | number | ((m: RegExpMatchArray) => number)]> = [
      [/\bfirst\b/i, 0],
      [/\bsecond\b/i, 1],
      [/\bthird\b/i, 2],
      [/\blast\b/i, "last"],
      [/\b(\d+)(?:st|nd|rd|th)\b/i, (m: RegExpMatchArray) => parseInt(m[1], 10) - 1],
    ];

    for (const [pattern, index] of indexPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (typeof index === "function") {
          descriptor.index = index(match);
        } else {
          descriptor.index = index;
        }
        break;
      }
    }

    // Extract text content (everything that's not a role or index)
    let textContent = text;
    for (const [pattern] of rolePatterns) {
      textContent = textContent.replace(pattern, "");
    }
    for (const [pattern] of indexPatterns) {
      textContent = textContent.replace(pattern, "");
    }
    // Remove action words and articles
    textContent = textContent.replace(
      /\b(click|tap|press|type|enter|fill|set|select|choose|pick|check|uncheck|wait|scroll|hover|focus|open|go|navigate|visit|verify|assert|expect|drag|drop|move|upload|download|attach|switch|close|refresh|reload|hit|input|on|the|a|an|to|of|in|with|from|into)\b/gi,
      "",
    );
    textContent = textContent.trim().replace(/\s+/g, " ");

    if (textContent) {
      descriptor.text = textContent;
    }

    return descriptor;
  }

  /**
   * Batch parse multiple instructions
   */
  parseBatch(instructions: string[]): ParseResult[] {
    return instructions.map((instruction) => this.parse(instruction));
  }

  /**
   * Get parser statistics
   */
  getStats(): {
    patternCount: number;
    customPatternCount: number;
    config: ParserConfig;
  } {
    return {
      patternCount: this.patterns.length,
      customPatternCount: this.customPatterns.length,
      config: this.config,
    };
  }

  /**
   * Validate that instruction can be parsed
   */
  validate(instruction: string): { valid: boolean; error?: string; suggestion?: string } {
    const result = this.parse(instruction);

    if (result.success) {
      return { valid: true };
    }

    // Try to suggest similar patterns
    const suggestion = this.findSuggestion(instruction);

    return {
      valid: false,
      error: result.error,
      suggestion,
    };
  }

  /**
   * Find suggestion for unparseable instruction
   */
  private findSuggestion(instruction: string): string | undefined {
    const normalized = instruction.toLowerCase();

    // Common misspellings and variations
    const suggestions: Array<[RegExp, string]> = [
      [/clik|clic|clk/, "Did you mean: 'click'?"],
      [/typ|tpe/, "Did you mean: 'type'?"],
      [/scrol|scrool/, "Did you mean: 'scroll'?"],
      [/navigat|nav/, "Did you mean: 'navigate'?"],
      [/selct|sel/, "Did you mean: 'select'?"],
      [/fil|fll/, "Did you mean: 'fill'?"],
      [/wait|w8/, "Did you mean: 'wait'?"],
    ];

    for (const [pattern, suggestion] of suggestions) {
      if (pattern.test(normalized)) {
        return suggestion;
      }
    }

    return undefined;
  }
}

/** Create default parser instance */
export const createNLParser = (config?: Partial<ParserConfig>): NLParser => {
  return new NLParser(config);
};

/** Parse a single instruction (convenience function) */
export const parseInstruction = (instruction: string): ParseResult => {
  const parser = new NLParser();
  return parser.parse(instruction);
};

/** Get all supported patterns */
export const getSupportedPatterns = (): GrammarPattern[] => {
  return allPatterns;
};
