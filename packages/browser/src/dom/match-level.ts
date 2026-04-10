// ============================================================================
// @inspect/browser - Element Match Levels
// ============================================================================

export const enum MatchLevel {
  EXACT = 1,
  STABLE = 2,
  XPATH = 3,
  AX_NAME = 4,
  ATTRIBUTE = 5,
}

export function matchElementByLevel(
  element: { role?: string; name?: string },
  target: { role?: string; name?: string },
  level: MatchLevel,
): boolean {
  if (element.role !== target.role) return false;

  switch (level) {
    case MatchLevel.EXACT:
    case MatchLevel.STABLE:
      return element.name === target.name;
    case MatchLevel.AX_NAME:
      return (
        !element.name ||
        !target.name ||
        element.name === target.name ||
        element.name.includes(target.name) ||
        target.name.includes(element.name)
      );
    case MatchLevel.ATTRIBUTE:
      return true;
    case MatchLevel.XPATH:
    default:
      return true;
  }
}
