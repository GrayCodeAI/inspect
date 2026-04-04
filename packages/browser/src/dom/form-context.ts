/**
 * Form Context Extraction - Tasks 276-290
 *
 * Extract form structure, field relationships, labels, validation rules
 */

import type { Page } from "playwright";

/**
 * Form field information
 */
export interface FormField {
  name: string;
  type: string;
  selector: string;
  label?: string;
  placeholder?: string;
  value?: string;
  required: boolean;
  readonly: boolean;
  disabled: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  step?: string;
  options?: string[]; // For select, radio, checkbox
  ariaLabel?: string;
  ariaRequired?: boolean;
  ariaInvalid?: boolean;
}

/**
 * Form structure
 */
export interface FormStructure {
  selector: string;
  id?: string;
  method?: string;
  action?: string;
  fields: FormField[];
  submitButton?: {
    selector: string;
    text: string;
  };
  resetButton?: {
    selector: string;
    text: string;
  };
  fieldGroups: FieldGroup[];
}

/**
 * Grouped form fields (e.g., address fields, billing info)
 */
export interface FieldGroup {
  name: string;
  fields: string[]; // field names in group
  description?: string;
}

/**
 * Task 276-280: Extract form structure
 */
export async function extractFormStructure(
  page: Page,
  formSelector: string = "form",
): Promise<FormStructure[]> {
  return page.evaluate((formSelector) => {
    const forms = document.querySelectorAll(formSelector);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structures: any[] = [];

    for (const form of forms) {
      const formElement = form as HTMLFormElement;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const structure: any = {
        selector: formSelector,
        id: formElement.id,
        method: formElement.method,
        action: formElement.action,
        fields: [],
        fieldGroups: [],
      };

      // Task 277: Extract all input fields
      const inputs = formElement.querySelectorAll("input, textarea, select");
      for (const input of inputs) {
        const field = extractFieldInfo(input);
        if (field) {
          structure.fields.push(field);
        }
      }

      // Task 278: Find submit button
      const submitBtn = formElement.querySelector(
        'button[type="submit"], input[type="submit"], [role="button"][type="submit"]',
      );
      if (submitBtn) {
        structure.submitButton = {
          selector: submitBtn.id ? `#${submitBtn.id}` : "button[type=submit]",
          text: submitBtn.textContent || submitBtn.getAttribute("value"),
        };
      }

      // Task 279: Find reset button
      const resetBtn = formElement.querySelector('button[type="reset"], input[type="reset"]');
      if (resetBtn) {
        structure.resetButton = {
          selector: resetBtn.id ? `#${resetBtn.id}` : "button[type=reset]",
          text: resetBtn.textContent || resetBtn.getAttribute("value"),
        };
      }

      // Task 280: Identify field groups
      const fieldsets = formElement.querySelectorAll("fieldset");
      for (const fieldset of fieldsets) {
        const legend = fieldset.querySelector("legend");
        const groupName = legend?.textContent || "Unnamed";
        const groupFields = Array.from(fieldset.querySelectorAll("input, textarea, select"))
          .map((el) => (el as HTMLInputElement).name)
          .filter(Boolean);

        if (groupFields.length > 0) {
          structure.fieldGroups.push({
            name: groupName,
            fields: groupFields,
          });
        }
      }

      structures.push(structure);
    }

    return structures;
  }, formSelector);
}

/**
 * Extract individual field information
 */
function extractFieldInfo(element: Element): FormField | null {
  const input = element as HTMLInputElement;
  if (!input.name) return null;

  // Task 281: Get label
  let label: string | undefined;
  const labelElement = document.querySelector(`label[for="${input.id}"]`);
  if (labelElement) {
    label = labelElement.textContent || undefined;
  } else {
    // Try finding parent label
    const parentLabel = input.closest("label");
    if (parentLabel) {
      label = parentLabel.textContent || undefined;
    }
  }

  // Task 282-285: Extract constraints
  const field: FormField = {
    name: input.name,
    type: input.type,
    selector: input.id ? `#${input.id}` : `input[name="${input.name}"]`,
    label,
    placeholder: input.placeholder || undefined,
    value: input.value || undefined,
    required: input.required,
    readonly: input.readOnly,
    disabled: input.disabled,
    pattern: input.pattern || undefined,
    minLength: input.minLength > 0 ? input.minLength : undefined,
    maxLength: input.maxLength > 0 ? input.maxLength : undefined,
    min: input.min || undefined,
    max: input.max || undefined,
    step: input.step || undefined,
    ariaLabel: input.getAttribute("aria-label") || undefined,
    ariaRequired: input.getAttribute("aria-required") === "true",
    ariaInvalid: input.getAttribute("aria-invalid") === "true",
  };

  // Task 286-288: Handle select/radio/checkbox options
  if (element instanceof HTMLSelectElement) {
    const select = element as HTMLSelectElement;
    field.options = Array.from(select.options).map((opt) => opt.text);
  } else if (input.type === "radio" || input.type === "checkbox") {
    // Get related options with same name
    const relatedInputs = document.querySelectorAll(`input[name="${input.name}"]`);
    field.options = Array.from(relatedInputs)
      .map((inp) => {
        const label = document.querySelector(`label[for="${(inp as HTMLInputElement).id}"]`);
        return label?.textContent || (inp as HTMLInputElement).value;
      })
      .filter(Boolean);
  }

  return field;
}

/**
 * Task 289-290: Find related form fields
 */
export async function findRelatedFields(page: Page, fieldName: string): Promise<FormField[]> {
  return page.evaluate((fieldName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relatedFields: any[] = [];
    const primaryField = document.querySelector(
      `input[name="${fieldName}"], textarea[name="${fieldName}"], select[name="${fieldName}"]`,
    );

    if (!primaryField) return [];

    // Find form containing this field
    const form = primaryField.closest("form");
    if (!form) return [];

    // Find related fields by proximity or group
    const allFields = form.querySelectorAll("input, textarea, select");

    for (const field of allFields) {
      const input = field as HTMLInputElement;
      if (input.name === fieldName) continue;

      // Check if in same fieldset
      const primaryFieldset = primaryField.closest("fieldset");
      const currentFieldset = field.closest("fieldset");
      if (primaryFieldset && primaryFieldset === currentFieldset) {
        const info = {
          name: input.name,
          type: input.type,
          label: document.querySelector(`label[for="${input.id}"]`)?.textContent,
          proximity: "same-group",
        };
        relatedFields.push(info);
      }

      // Check if names suggest relationship (e.g., first_name/last_name)
      const baseName = fieldName.replace(/[_-].*$/, "");
      if (input.name.startsWith(baseName) && input.name !== fieldName) {
        const info = {
          name: input.name,
          type: input.type,
          label: document.querySelector(`label[for="${input.id}"]`)?.textContent,
          proximity: "name-related",
        };
        relatedFields.push(info);
      }
    }

    return relatedFields;
  }, fieldName);
}

/**
 * Task 291-295: Validate field constraints
 */
export interface ValidationError {
  field: string;
  error: string;
  constraint: string;
}

export async function validateFormField(
  page: Page,
  fieldName: string,
  value: string,
): Promise<ValidationError[]> {
  return page.evaluate(
    (args) => {
      const { fieldName, value } = args;
      const errors: any[] = [];
      const field = document.querySelector(
        `input[name="${fieldName}"], textarea[name="${fieldName}"], select[name="${fieldName}"]`,
      ) as HTMLInputElement;

      if (!field) {
        errors.push({
          field: fieldName,
          error: "Field not found",
          constraint: "existence",
        });
        return errors;
      }

      // Task 292: Check required
      if (field.required && !value) {
        errors.push({
          field: fieldName,
          error: "Field is required",
          constraint: "required",
        });
      }

      // Task 293: Check length
      if (field.minLength && value.length < field.minLength) {
        errors.push({
          field: fieldName,
          error: `Minimum length: ${field.minLength}`,
          constraint: "minLength",
        });
      }
      if (field.maxLength && value.length > field.maxLength) {
        errors.push({
          field: fieldName,
          error: `Maximum length: ${field.maxLength}`,
          constraint: "maxLength",
        });
      }

      // Task 294: Check pattern
      if (field.pattern) {
        const regex = new RegExp(field.pattern);
        if (!regex.test(value)) {
          errors.push({
            field: fieldName,
            error: `Invalid format (pattern: ${field.pattern})`,
            constraint: "pattern",
          });
        }
      }

      // Task 295: Check min/max
      if (field.type === "number") {
        if (field.min && parseFloat(value) < parseFloat(field.min)) {
          errors.push({
            field: fieldName,
            error: `Minimum value: ${field.min}`,
            constraint: "min",
          });
        }
        if (field.max && parseFloat(value) > parseFloat(field.max)) {
          errors.push({
            field: fieldName,
            error: `Maximum value: ${field.max}`,
            constraint: "max",
          });
        }
      }

      return errors;
    },
    { fieldName, value },
  );
}
