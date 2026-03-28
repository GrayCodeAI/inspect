// ============================================================================
// @inspect/core - Test Tagging & Filtering
//
// Attach tags to tests and filter test suites by tag expressions.
// Supports: --tag critical, --tag "smoke AND !slow", --tag "login OR signup"
// ============================================================================

export interface TaggedTest<T = unknown> {
  /** Test data (can be any test representation) */
  test: T;
  /** Tags attached to this test */
  tags: Set<string>;
}

/**
 * TagExpression parses and evaluates boolean tag filter expressions.
 *
 * Syntax:
 *   - `critical`          → matches tests tagged "critical"
 *   - `!slow`             → matches tests NOT tagged "slow"
 *   - `smoke AND fast`    → matches tests tagged both "smoke" and "fast"
 *   - `login OR signup`   → matches tests tagged "login" or "signup"
 *   - `critical AND !slow` → matches "critical" but not "slow"
 *
 * Precedence: NOT > AND > OR (standard boolean precedence)
 */
export class TagExpression {
  private ast: TagNode;

  constructor(expression: string) {
    this.ast = TagExpression.parse(expression.trim());
  }

  /**
   * Evaluate the expression against a set of tags.
   */
  matches(tags: Set<string> | string[]): boolean {
    const tagSet = tags instanceof Set ? tags : new Set(tags);
    return TagExpression.evaluate(this.ast, tagSet);
  }

  /**
   * Get all tag names referenced in the expression.
   */
  getReferencedTags(): string[] {
    const tags: string[] = [];
    TagExpression.collectTags(this.ast, tags);
    return [...new Set(tags)];
  }

  // ── Parser ───────────────────────────────────────────────────────────────

  private static parse(expr: string): TagNode {
    const tokens = TagExpression.tokenize(expr);
    let pos = 0;

    function parseOr(): TagNode {
      let left = parseAnd();
      while (pos < tokens.length && tokens[pos].toUpperCase() === "OR") {
        pos++;
        const right = parseAnd();
        left = { type: "or", left, right };
      }
      return left;
    }

    function parseAnd(): TagNode {
      let left = parseNot();
      while (pos < tokens.length && tokens[pos].toUpperCase() === "AND") {
        pos++;
        const right = parseNot();
        left = { type: "and", left, right };
      }
      return left;
    }

    function parseNot(): TagNode {
      if (pos < tokens.length && tokens[pos] === "!") {
        pos++;
        const operand = parsePrimary();
        return { type: "not", operand };
      }
      if (pos < tokens.length && tokens[pos].toUpperCase() === "NOT") {
        pos++;
        const operand = parsePrimary();
        return { type: "not", operand };
      }
      return parsePrimary();
    }

    function parsePrimary(): TagNode {
      if (pos < tokens.length && tokens[pos] === "(") {
        pos++; // skip (
        const node = parseOr();
        if (pos < tokens.length && tokens[pos] === ")") {
          pos++; // skip )
        }
        return node;
      }

      if (pos >= tokens.length) {
        return { type: "tag", name: "" };
      }

      const name = tokens[pos++];
      return { type: "tag", name };
    }

    return parseOr();
  }

  private static tokenize(expr: string): string[] {
    const tokens: string[] = [];
    let i = 0;

    while (i < expr.length) {
      // Skip whitespace
      if (expr[i] === " " || expr[i] === "\t") {
        i++;
        continue;
      }

      // Operators
      if (expr[i] === "(" || expr[i] === ")" || expr[i] === "!") {
        tokens.push(expr[i]);
        i++;
        continue;
      }

      // Words (tag names, AND, OR, NOT)
      let word = "";
      while (i < expr.length && expr[i] !== " " && expr[i] !== "\t" && expr[i] !== "(" && expr[i] !== ")") {
        word += expr[i];
        i++;
      }
      if (word) tokens.push(word);
    }

    return tokens;
  }

  private static evaluate(node: TagNode, tags: Set<string>): boolean {
    switch (node.type) {
      case "tag":
        return node.name === "" || tags.has(node.name);
      case "not":
        return !TagExpression.evaluate(node.operand, tags);
      case "and":
        return TagExpression.evaluate(node.left, tags) && TagExpression.evaluate(node.right, tags);
      case "or":
        return TagExpression.evaluate(node.left, tags) || TagExpression.evaluate(node.right, tags);
    }
  }

  private static collectTags(node: TagNode, tags: string[]): void {
    switch (node.type) {
      case "tag":
        if (node.name) tags.push(node.name);
        break;
      case "not":
        TagExpression.collectTags(node.operand, tags);
        break;
      case "and":
      case "or":
        TagExpression.collectTags(node.left, tags);
        TagExpression.collectTags(node.right, tags);
        break;
    }
  }
}

type TagNode =
  | { type: "tag"; name: string }
  | { type: "not"; operand: TagNode }
  | { type: "and"; left: TagNode; right: TagNode }
  | { type: "or"; left: TagNode; right: TagNode };

/**
 * TestFilter applies tag-based filtering to test collections.
 */
export class TestFilter<T = unknown> {
  private tests: TaggedTest<T>[] = [];

  /**
   * Add a test with tags.
   */
  add(test: T, tags: string[]): void {
    this.tests.push({ test, tags: new Set(tags) });
  }

  /**
   * Add multiple tests.
   */
  addAll(entries: Array<{ test: T; tags: string[] }>): void {
    for (const entry of entries) {
      this.add(entry.test, entry.tags);
    }
  }

  /**
   * Filter tests by a tag expression.
   */
  filter(expression: string): T[] {
    const expr = new TagExpression(expression);
    return this.tests
      .filter((t) => expr.matches(t.tags))
      .map((t) => t.test);
  }

  /**
   * Get all unique tags across all tests.
   */
  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const t of this.tests) {
      for (const tag of t.tags) tags.add(tag);
    }
    return [...tags].sort();
  }

  /**
   * Get test count per tag.
   */
  getTagCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const t of this.tests) {
      for (const tag of t.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }

  /**
   * Total test count.
   */
  get size(): number {
    return this.tests.length;
  }
}
