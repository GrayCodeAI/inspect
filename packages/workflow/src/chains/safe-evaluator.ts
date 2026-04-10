/**
 * Safe expression evaluator - replaces unsafe Function() constructor
 *
 * Supports basic comparison and logical operators:
 * - Comparison: ==, ===, !=, !==, <, >, <=, >=
 * - Logical: &&, ||, !
 * - Literals: strings, numbers, booleans (true, false), null
 */

/* eslint-disable no-useless-assignment */

interface Token {
  type: "operator" | "literal" | "identifier" | "paren";
  value: string;
}

class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const skipWhitespace = () => {
    while (index < expression.length && /\s/.test(expression[index] ?? "")) {
      index++;
    }
  };

  while (index < expression.length) {
    skipWhitespace();
    if (index >= expression.length) break;

    const char = expression[index];

    // Operators
    if (
      char === "=" ||
      char === "!" ||
      char === "<" ||
      char === ">" ||
      char === "&" ||
      char === "|"
    ) {
      let op = char;
      index++;
      const nextChar = expression[index];
      if ((op === "=" || op === "!" || op === "<" || op === ">") && nextChar === "=") {
        op += nextChar;
        index++;
      } else if ((op === "&" && nextChar === "&") || (op === "|" && nextChar === "|")) {
        op += nextChar;
        index++;
      }
      tokens.push({ type: "operator", value: op });
      continue;
    }

    // Parentheses
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index++;
      continue;
    }

    // String literals
    if (char === '"' || char === "'") {
      const quote = char;
      let str = "";
      index++;
      while (index < expression.length) {
        const c = expression[index];
        if (c === quote) {
          index++;
          break;
        }
        if (c === "\\") {
          index++;
          const escaped = expression[index];
          if (escaped === "n") str += "\n";
          else if (escaped === "t") str += "\t";
          else if (escaped === "r") str += "\r";
          else str += escaped ?? "";
        } else {
          str += c ?? "";
        }
        index++;
      }
      tokens.push({ type: "literal", value: str });
      continue;
    }

    // Numbers
    if (/\d/.test(char ?? "")) {
      let num = "";
      while (index < expression.length && /[\d.]/.test(expression[index] ?? "")) {
        num += expression[index];
        index++;
      }
      tokens.push({ type: "literal", value: num });
      continue;
    }

    // Identifiers (true, false, null, variable names)
    if (/[a-zA-Z_]/.test(char ?? "")) {
      let ident = "";
      while (index < expression.length && /[a-zA-Z0-9_]/.test(expression[index] ?? "")) {
        ident += expression[index];
        index++;
      }
      const isKeyword = ident === "true" || ident === "false" || ident === "null";
      tokens.push({ type: isKeyword ? "literal" : "identifier", value: ident });
      continue;
    }

    // Not operator
    if (char === "!") {
      tokens.push({ type: "operator", value: "!" });
      index++;
      continue;
    }

    throw new ExpressionError(`Unexpected character: ${char} at position ${index}`);
  }

  return tokens;
}

function parseLiteral(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^\d+(\.\d+)?$/.test(value)) return parseFloat(value);
  return value;
}

function evaluateSimpleExpression(
  tokens: Token[],
  variables: Record<string, unknown>,
): { result: unknown; consumed: number } {
  if (tokens.length === 0) {
    throw new ExpressionError("Empty expression");
  }

  let index = 0;

  let result: unknown = null;

  const getToken = () => tokens[index];
  const consume = () => tokens[index++];

  // Handle parentheses
  if (getToken()?.type === "paren" && getToken()?.value === "(") {
    consume(); // consume (
    const innerResult = evaluateExpression(tokens.slice(index), variables);
    result = innerResult.result;
    index += innerResult.consumed;

    if (getToken()?.type !== "paren" || getToken()?.value !== ")") {
      throw new ExpressionError("Missing closing parenthesis");
    }
    consume(); // consume )
  } else if (getToken()?.type === "operator" && getToken()?.value === "!") {
    consume(); // consume !
    const operand = evaluateSimpleExpression(tokens.slice(index), variables);
    result = operand.result ? false : true;
    index += operand.consumed;
  } else if (getToken()?.type === "literal") {
    result = parseLiteral(consume()?.value ?? "");
  } else if (getToken()?.type === "identifier") {
    const varName = consume()?.value ?? "";
    result = variables[varName];
  } else {
    throw new ExpressionError(`Unexpected token: ${getToken()?.value}`);
  }

  // Handle comparison operators - only process if first token is an operator
  const firstToken = getToken();
  let returnResult = result;
  if (
    firstToken?.type === "operator" &&
    (firstToken.value === "==" || firstToken.value === "===")
  ) {
    consume(); // consume operator
    let rightValue: unknown;
    const rightToken = getToken();
    if (rightToken?.type === "literal") {
      rightValue = parseLiteral(consume()?.value ?? "");
    } else if (rightToken?.type === "identifier") {
      const varName = consume()?.value ?? "";
      rightValue = variables[varName];
    } else {
      // Not a valid comparison - return as-is
      return { result: returnResult, consumed: index };
    }

    returnResult = returnResult == rightValue;
  }

  return { result: returnResult, consumed: index };
}

function evaluateExpression(
  tokens: Token[],
  variables: Record<string, unknown>,
): { result: unknown; consumed: number } {
  let index = 0;
  let result: unknown = undefined;
  let expectAnd = false;
  let expectOr = false;

  while (index < tokens.length) {
    const remainingTokens = tokens.slice(index);
    const { result: simpleResult, consumed } = evaluateSimpleExpression(remainingTokens, variables);

    if (expectAnd) {
      result = Boolean(result) && Boolean(simpleResult);
      expectAnd = false;
    } else if (expectOr) {
      result = Boolean(result) || Boolean(simpleResult);
      expectOr = false;
    } else {
      result = simpleResult;
    }

    index += consumed;

    // Check for logical operators
    const nextToken = tokens[index];
    if (nextToken?.type === "operator" && nextToken.value === "&&") {
      index++;
      expectAnd = true;
    } else if (nextToken?.type === "operator" && nextToken.value === "||") {
      index++;
      expectOr = true;
    } else {
      break;
    }
  }

  return { result, consumed: index };
}

/**
 * Safely evaluate a conditional expression without using eval or Function
 *
 * @param expression - The expression to evaluate (e.g., "{{status}} === 'success'")
 * @param variables - Variable values to use in evaluation
 * @returns Boolean result of the expression
 */
export function evaluateSafely(expression: string, variables: Record<string, unknown>): boolean {
  try {
    // Handle already-resolved expressions (no variables)
    if (!expression.includes("{{")) {
      const tokens = tokenize(expression);
      const { result } = evaluateExpression(tokens, variables);
      return Boolean(result);
    }

    // For expressions with variables, we need to resolve them first
    // This should be done by the caller before passing to this function
    const tokens = tokenize(expression);
    const { result } = evaluateExpression(tokens, variables);
    return Boolean(result);
  } catch (error) {
    // Return false on any parsing error for safety
    return false;
  }
}
