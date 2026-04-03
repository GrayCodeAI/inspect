export interface CustomA11yRule {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical";
  selector: string;
  evaluateFn: (node: Element) => boolean;
  description: string;
}

export interface CustomA11yViolation {
  ruleId: string;
  description: string;
  impact: "minor" | "moderate" | "serious" | "critical";
  selector: string;
  element: string;
}

export class CustomA11yRuleEngine {
  private rules: Map<string, CustomA11yRule> = new Map();

  register = (rule: CustomA11yRule): void => {
    this.rules.set(rule.id, rule);
  };

  unregister = (id: string): void => {
    this.rules.delete(id);
  };

  evaluate = async (page: {
    evaluate: <T>(fn: () => Promise<T> | T) => Promise<T>;
  }): Promise<CustomA11yViolation[]> => {
    const allViolations: CustomA11yViolation[] = [];
    for (const rule of this.rules.values()) {
      const violations = await this.evaluateRule(rule, page);
      allViolations.push(...violations);
    }
    return allViolations;
  };

  evaluateRule = async (
    rule: CustomA11yRule,
    page: { evaluate: <T>(fn: () => Promise<T> | T) => Promise<T> },
  ): Promise<CustomA11yViolation[]> => {
    return await page.evaluate(async () => {
      const elements = document.querySelectorAll(rule.selector);
      const violations: CustomA11yViolation[] = [];
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        const hasViolation = rule.evaluateFn(element);
        if (hasViolation) {
          violations.push({
            ruleId: rule.id,
            description: rule.description,
            impact: rule.impact,
            selector: rule.selector,
            element: element.outerHTML.substring(0, 200),
          });
        }
      }
      return violations;
    });
  };

  list = (): CustomA11yRule[] => {
    return Array.from(this.rules.values());
  };
}

const formErrorAssociationRule: CustomA11yRule = {
  id: "form-error-association",
  impact: "serious",
  selector: "[role='alert'], .error, .error-message, [aria-live='assertive']",
  description: "All form error messages must have aria-describedby linking to the input",
  evaluateFn: (node: Element): boolean => {
    const describedBy = node.getAttribute("aria-describedby");
    if (!describedBy) {
      return true;
    }
    const targetId = describedBy.split(" ")[0];
    const targetElement = document.getElementById(targetId);
    if (!targetElement) {
      return true;
    }
    const isInput =
      targetElement.tagName === "INPUT" ||
      targetElement.tagName === "TEXTAREA" ||
      targetElement.tagName === "SELECT";
    return !isInput;
  },
};

const modalFocusTrapRule: CustomA11yRule = {
  id: "modal-focus-trap",
  impact: "critical",
  selector: "[role='dialog'], [role='alertdialog'], .modal, dialog",
  description: "Modals must trap focus within their boundaries",
  evaluateFn: (node: Element): boolean => {
    const hasTabIndex =
      node.getAttribute("tabindex") === "-1" || node.getAttribute("tabindex") === "0";
    const hasAriaModal = node.getAttribute("aria-modal") === "true";
    const focusableElements = node.querySelectorAll(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    if (focusableElements.length === 0) {
      return false;
    }
    return !hasTabIndex && !hasAriaModal;
  },
};

const buttonInteractiveLabelRule: CustomA11yRule = {
  id: "button-interactive-label",
  impact: "critical",
  selector:
    "button, [role='button'], input[type='button'], input[type='submit'], input[type='reset']",
  description:
    "All buttons must have accessible names (aria-label, text content, or aria-labelledby)",
  evaluateFn: (node: Element): boolean => {
    const ariaLabel = node.getAttribute("aria-label");
    const ariaLabelledBy = node.getAttribute("aria-labelledby");
    const textContent = node.textContent?.trim();
    const title = node.getAttribute("title");
    const hasAccessibleName = ariaLabel || ariaLabelledBy || textContent || title;
    return !hasAccessibleName;
  },
};

export const BUILTIN_CUSTOM_A11Y_RULES: CustomA11yRule[] = [
  formErrorAssociationRule,
  modalFocusTrapRule,
  buttonInteractiveLabelRule,
];
