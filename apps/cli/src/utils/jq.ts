/**
 * Simple jq-like JSON path query.
 * Supports: .key, .key.nested, .[0], .key[], .key[0].nested,
 * .key | length, select(.field == "value")
 */
export function jqFilter(data: unknown, query: string): unknown {
  if (!query || query === ".") return data;

  const parts = query.split("|").map(p => p.trim());
  let result = data;

  for (const part of parts) {
    result = applyFilter(result, part);
  }

  return result;
}

function applyFilter(data: unknown, filter: string): unknown {
  if (filter === ".") return data;
  if (filter === "length") return getLength(data);
  if (filter === "keys") return typeof data === "object" && data !== null ? Object.keys(data) : [];
  if (filter === "values") return typeof data === "object" && data !== null ? Object.values(data) : [];
  if (filter === "type") return typeof data;

  if (filter.startsWith("select(")) {
    return applySelect(data, filter);
  }

  if (filter.startsWith("map(")) {
    const inner = filter.slice(4, -1);
    if (Array.isArray(data)) {
      return data.map(item => applyFilter(item, inner));
    }
    return data;
  }

  // Path traversal: .key.nested[0]
  if (filter.startsWith(".")) {
    return traverse(data, filter.slice(1));
  }

  return data;
}

function traverse(data: unknown, path: string): unknown {
  if (!path) return data;

  let current = data;
  // Split on . and [] boundaries
  const segments = path.match(/[^.[\]]+|\[\d+\]|\[\]/g) ?? [];

  for (const seg of segments) {
    if (current == null) return null;

    if (seg === "[]") {
      // Array expansion
      if (Array.isArray(current)) return current;
      return null;
    }

    const indexMatch = seg.match(/^\[(\d+)\]$/);
    if (indexMatch) {
      const idx = parseInt(indexMatch[1], 10);
      if (Array.isArray(current)) current = current[idx];
      else return null;
    } else {
      if (typeof current === "object" && current !== null) {
        current = (current as Record<string, unknown>)[seg];
      } else {
        return null;
      }
    }
  }

  return current;
}

function getLength(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (typeof data === "string") return data.length;
  if (typeof data === "object" && data !== null) return Object.keys(data).length;
  return 0;
}

function applySelect(data: unknown, filter: string): unknown {
  // Basic select: select(.field == "value") or select(.field > N)
  const inner = filter.slice(7, -1).trim();

  if (Array.isArray(data)) {
    return data.filter(item => evaluateCondition(item, inner));
  }

  return evaluateCondition(data, inner) ? data : null;
}

function evaluateCondition(data: unknown, condition: string): boolean {
  // Parse: .field == "value" or .field > N or .field != null
  const match = condition.match(/^(\.[a-zA-Z0-9_.]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) return true;

  const [, path, op, rawValue] = match;
  const actual = traverse(data, path.slice(1));

  let expected: unknown;
  if (rawValue === "null") expected = null;
  else if (rawValue === "true") expected = true;
  else if (rawValue === "false") expected = false;
  else if (rawValue.startsWith('"') && rawValue.endsWith('"')) expected = rawValue.slice(1, -1);
  else expected = Number(rawValue);

  switch (op) {
    case "==": return actual === expected;
    case "!=": return actual !== expected;
    case ">": return Number(actual) > Number(expected);
    case "<": return Number(actual) < Number(expected);
    case ">=": return Number(actual) >= Number(expected);
    case "<=": return Number(actual) <= Number(expected);
    default: return true;
  }
}
