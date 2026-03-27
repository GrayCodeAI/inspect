import type { FormInfo, FormField, FormTestResult, TestDataSet, LLMCall, ProgressCallback } from "./types.js";
import { randomUUID } from "node:crypto";
import { safeEvaluate } from "./evaluate.js";

// ============================================================================
// Agent 6 — Form Filler
// Detects form fields and fills them with realistic test data.
// ============================================================================

const FIRST_NAMES = [
  "Emma", "Liam", "Olivia", "Noah", "Ava", "James", "Sophia", "Oliver",
  "Isabella", "Benjamin", "Mia", "Elijah", "Charlotte", "Lucas", "Amelia",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson",
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomDigits(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10).toString();
  return out;
}

// ---------------------------------------------------------------------------
// generateTestData
// ---------------------------------------------------------------------------

export function generateTestData(): TestDataSet {
  const first = randomPick(FIRST_NAMES);
  const last = randomPick(LAST_NAMES);
  const short = randomUUID().slice(0, 8);

  return {
    name: { first, last, full: `${first} ${last}` },
    email: `test+${short}@inspect.dev`,
    password: "Inspect_Test_2024!",
    phone: `+1 (555) 123-${randomDigits(4)}`,
    address: {
      street: "742 Evergreen Terrace",
      city: "Springfield",
      state: "IL",
      zip: "62704",
      country: "US",
    },
    creditCard: {
      number: "4242424242424242",
      expiry: "12/28",
      cvv: "123",
      name: `${first} ${last}`,
    },
    date: "1990-01-15",
    url: "https://example.com",
    company: "Inspect Testing Co",
    username: `inspect_test_${randomDigits(6)}`,
  };
}

// ---------------------------------------------------------------------------
// detectForms
// ---------------------------------------------------------------------------

export async function detectForms(page: any): Promise<FormInfo[]> {
  const rawForms: Array<{
    action: string | null;
    method: string;
    fields: Array<{
      name: string;
      type: string;
      label: string | null;
      placeholder: string | null;
      required: boolean;
      pattern: string | null;
      minLength: number | null;
      maxLength: number | null;
      options: string[];
      autocomplete: string | null;
    }>;
    hasSubmitButton: boolean;
  }> = await safeEvaluate(page, `
    (() => {
      const forms = Array.from(document.querySelectorAll("form"));
      return forms.map((form) => {
        const inputs = Array.from(form.querySelectorAll("input, textarea, select"));
        const fields = inputs.map((el) => {
          let labelText = null;
          if (el.id) {
            const labelEl = form.querySelector('label[for="' + el.id + '"]');
            if (labelEl) labelText = (labelEl.textContent || "").trim();
          }
          if (!labelText) {
            const parent = el.closest("label");
            if (parent) labelText = (parent.textContent || "").trim();
          }
          const options = [];
          if (el.tagName === "SELECT") {
            const optionEls = Array.from(el.options);
            for (const opt of optionEls) { if (opt.value) options.push(opt.value); }
          }
          return {
            name: el.getAttribute("name") || el.id || "",
            type: el.getAttribute("type") || el.tagName.toLowerCase(),
            label: labelText,
            placeholder: el.getAttribute("placeholder"),
            required: el.hasAttribute("required"),
            pattern: el.getAttribute("pattern"),
            minLength: el.hasAttribute("minlength") ? Number(el.getAttribute("minlength")) : null,
            maxLength: el.hasAttribute("maxlength") ? Number(el.getAttribute("maxlength")) : null,
            options,
            autocomplete: el.getAttribute("autocomplete"),
          };
        });
        const hasSubmitButton = form.querySelector('button[type="submit"], input[type="submit"]') !== null || form.querySelector("button:not([type])") !== null;
        return {
          action: form.getAttribute("action"),
          method: (form.getAttribute("method") || "GET").toUpperCase(),
          fields,
          hasSubmitButton,
        };
      });
    })()
  `, [] as any);

  const currentUrl: string = page.url();

  return rawForms.map((raw) => {
    const fields: FormField[] = raw.fields.map((f) => ({
      name: f.name,
      type: f.type,
      label: f.label ?? undefined,
      placeholder: f.placeholder ?? undefined,
      required: f.required,
      pattern: f.pattern ?? undefined,
      minLength: f.minLength ?? undefined,
      maxLength: f.maxLength ?? undefined,
      options: f.options.length > 0 ? f.options : undefined,
      autocomplete: f.autocomplete ?? undefined,
    }));

    const formType = classifyForm(fields, raw.action, raw.hasSubmitButton, currentUrl);

    return {
      action: raw.action ?? undefined,
      method: raw.method,
      fields,
      hasSubmitButton: raw.hasSubmitButton,
      formType,
    };
  });

  const nativeForms = rawForms.length > 0 ? rawForms.map((raw) => {
    const fields: FormField[] = raw.fields.map((f) => ({
      name: f.name, type: f.type, label: f.label ?? undefined,
      placeholder: f.placeholder ?? undefined, required: f.required,
      pattern: f.pattern ?? undefined, minLength: f.minLength ?? undefined,
      maxLength: f.maxLength ?? undefined,
      options: f.options.length > 0 ? f.options : undefined,
      autocomplete: f.autocomplete ?? undefined,
    }));
    return {
      action: raw.action ?? undefined, method: raw.method, fields,
      hasSubmitButton: raw.hasSubmitButton,
      formType: classifyForm(fields, raw.action, raw.hasSubmitButton, currentUrl),
    };
  }) : [];

  // SPA form detection: find input groups NOT inside native <form> elements
  if (nativeForms.length === 0) {
    const spaForms = await safeEvaluate<Array<{
      fields: Array<{ name: string; type: string; label: string | null; placeholder: string | null; required: boolean; options: string[]; autocomplete: string | null }>;
      hasSubmitButton: boolean;
    }>>(page, `
      (() => {
        const orphanInputs = Array.from(document.querySelectorAll("input, textarea, select")).filter(el => !el.closest("form"));
        if (orphanInputs.length === 0) return [];
        const containers = new Map();
        for (const input of orphanInputs) {
          const container = input.closest("section, div[class], main, article, [role='form']") || document.body;
          if (!containers.has(container)) containers.set(container, []);
          containers.get(container).push(input);
        }
        const results = [];
        for (const [container, inputs] of containers) {
          if (inputs.length < 1) continue;
          const fields = inputs.map(el => {
            let labelText = null;
            if (el.id) { const lbl = document.querySelector('label[for="' + el.id + '"]'); if (lbl) labelText = (lbl.textContent || "").trim(); }
            if (!labelText) { const p = el.closest("label"); if (p) labelText = (p.textContent || "").trim(); }
            const options = [];
            if (el.tagName === "SELECT") { for (const opt of el.options) { if (opt.value) options.push(opt.value); } }
            return { name: el.getAttribute("name") || el.id || "", type: el.getAttribute("type") || el.tagName.toLowerCase(), label: labelText, placeholder: el.getAttribute("placeholder"), required: el.hasAttribute("required"), options, autocomplete: el.getAttribute("autocomplete") };
          });
          const hasButton = container.querySelector("button, [role='button'], input[type='submit']") !== null;
          results.push({ fields, hasSubmitButton: hasButton });
        }
        return results;
      })()
    `, []);

    for (const spa of spaForms) {
      const fields: FormField[] = spa.fields.map(f => ({
        name: f.name, type: f.type, label: f.label ?? undefined,
        placeholder: f.placeholder ?? undefined, required: f.required,
        options: f.options.length > 0 ? f.options : undefined,
        autocomplete: f.autocomplete ?? undefined,
      }));
      nativeForms.push({
        action: undefined, method: "POST", fields, hasSubmitButton: spa.hasSubmitButton,
        formType: classifyForm(fields, null, spa.hasSubmitButton, currentUrl),
      });
    }

    return nativeForms;
  }

  // Return forms from the first mapping (with proper types)
  return rawForms.map((raw) => {
    const fields: FormField[] = raw.fields.map((f) => ({
      name: f.name, type: f.type, label: f.label ?? undefined,
      placeholder: f.placeholder ?? undefined, required: f.required,
      pattern: f.pattern ?? undefined, minLength: f.minLength ?? undefined,
      maxLength: f.maxLength ?? undefined,
      options: f.options.length > 0 ? f.options : undefined,
      autocomplete: f.autocomplete ?? undefined,
    }));
    return {
      action: raw.action ?? undefined, method: raw.method, fields,
      hasSubmitButton: raw.hasSubmitButton,
      formType: classifyForm(fields, raw.action, raw.hasSubmitButton, currentUrl),
    };
  });
}

/** Heuristic classification of form purpose */
function classifyForm(
  fields: FormField[],
  action: string | null,
  hasSubmitButton: boolean,
  currentUrl: string,
): FormInfo["formType"] {
  const types = fields.map((f) => f.type.toLowerCase());
  const names = fields.map((f) => (f.name + " " + (f.label ?? "")).toLowerCase());
  const allText = names.join(" ");
  const actionLower = (action ?? "").toLowerCase();

  const hasPassword = types.includes("password");
  const hasEmail = types.includes("email") || allText.includes("email");
  const hasUsername = allText.includes("user") || allText.includes("login");
  const hasName = allText.includes("name") && !allText.includes("username");
  const hasSearch = types.includes("search") || allText.includes("search");
  const hasMessage = types.includes("textarea") || allText.includes("message") || allText.includes("comment");
  const hasCreditCard = allText.includes("card") || allText.includes("payment") || allText.includes("cc-number");
  const hasCheckbox = types.includes("checkbox");
  const hasSelect = types.includes("select");

  // Search form
  if (hasSearch) return "search";

  // Newsletter: email-only + submit
  if (fields.length <= 2 && hasEmail && !hasPassword && hasSubmitButton) {
    if (allText.includes("subscribe") || allText.includes("newsletter")) return "newsletter";
  }

  // Login: password + email/username, small form
  if (hasPassword && (hasEmail || hasUsername) && fields.length <= 4) return "login";

  // Signup: password + email + name, or action hints
  if (hasPassword && hasEmail && (hasName || fields.length > 3)) return "signup";
  if (actionLower.includes("register") || actionLower.includes("signup") || actionLower.includes("sign-up")) return "signup";

  // Checkout: credit card fields
  if (hasCreditCard) return "checkout";

  // Contact: message + email
  if (hasMessage && hasEmail) return "contact";

  // Settings: URL path or lots of diverse fields
  if (currentUrl.includes("/settings") || currentUrl.includes("/preferences") || currentUrl.includes("/account")) return "settings";

  // Filter: checkboxes / selects without password
  if ((hasCheckbox || hasSelect) && !hasPassword && !hasEmail) return "filter";

  // Newsletter fallback
  if (fields.length <= 2 && hasEmail && !hasPassword) return "newsletter";

  return "unknown";
}

// ---------------------------------------------------------------------------
// fillForm
// ---------------------------------------------------------------------------

export async function fillForm(
  page: any,
  formInfo: FormInfo,
  testData: TestDataSet,
  onProgress: ProgressCallback,
): Promise<FormTestResult> {
  const startTime = Date.now();
  const url: string = page.url();
  let fieldsFilled = 0;
  const errors: string[] = [];

  onProgress("info", `Filling ${formInfo.formType} form (${formInfo.fields.length} fields)`);

  for (const field of formInfo.fields) {
    try {
      const value = resolveFieldValue(field, testData);
      if (value === null) continue; // skip (e.g., file inputs)

      const selector = buildFieldSelector(field);

      if (field.type === "select" || field.type === "select-one") {
        const optionValue = field.options?.[0] ?? value;
        await page.selectOption(selector, optionValue, { timeout: 3000 });
        fieldsFilled++;
        onProgress("step", `  Filled ${field.name}: [select] ${optionValue}`);
      } else if (field.type === "checkbox") {
        await page.check(selector, { timeout: 3000 });
        fieldsFilled++;
        onProgress("step", `  Checked ${field.name}`);
      } else if (field.type === "radio") {
        if (field.options && field.options.length > 0) {
          await page.check(`input[name="${field.name}"][value="${field.options[0]}"]`, { timeout: 3000 });
        } else {
          await page.check(selector, { timeout: 3000 });
        }
        fieldsFilled++;
        onProgress("step", `  Selected radio ${field.name}`);
      } else if (field.type === "file") {
        // File inputs handled separately
        continue;
      } else {
        await page.fill(selector, value, { timeout: 3000 });
        fieldsFilled++;
        onProgress("step", `  Filled ${field.name}: ${value.slice(0, 40)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress("warn", `  Could not fill ${field.name}: ${msg.slice(0, 60)}`);
    }
  }

  // Submit the form
  let submitted = false;
  if (formInfo.hasSubmitButton) {
    try {
      // Try finding the submit button within the form context
      const submitClicked = await page.evaluate(() => {
        const form = document.querySelector("form");
        if (!form) return false;
        const btn =
          form.querySelector<HTMLElement>('button[type="submit"]') ??
          form.querySelector<HTMLElement>('input[type="submit"]') ??
          form.querySelector<HTMLElement>("button:not([type])");
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      if (submitClicked) {
        submitted = true;
        onProgress("step", "  Submitted form");
      }
    } catch {
      onProgress("warn", "  Could not click submit button, pressing Enter instead");
    }
  }

  if (!submitted) {
    try {
      await page.keyboard.press("Enter");
      submitted = true;
      onProgress("step", "  Submitted form via Enter key");
    } catch {
      onProgress("warn", "  Could not submit form");
    }
  }

  // Wait briefly for response
  try {
    await page.waitForTimeout(1500);
  } catch {
    // ignore
  }

  // Check for validation errors on the page
  const validationErrors: string[] = await safeEvaluate<string[]>(page, `
    (() => {
      const errorSelectors = [
        ".error", ".error-message", ".field-error", ".validation-error",
        ".invalid-feedback", ".form-error", '[role="alert"]',
        ".alert-danger", ".alert-error", ".text-danger", ".text-error",
      ];
      const found = [];
      for (const sel of errorSelectors) {
        const elements = Array.from(document.querySelectorAll(sel));
        for (const el of elements) {
          const text = (el.textContent ?? "").trim();
          if (text && text.length < 200) found.push(text);
        }
      }
      const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
      for (const input of inputs) {
        const el = input;
        if (!el.checkValidity() && el.validationMessage) {
          found.push((el.name || el.id || el.type) + ": " + el.validationMessage);
        }
      }
      return found;
    })()
  `, []);

  errors.push(...validationErrors);

  const passed = submitted && validationErrors.length === 0;
  if (passed) {
    onProgress("pass", `  Form filled and submitted successfully`);
  } else if (validationErrors.length > 0) {
    onProgress("fail", `  Validation errors: ${validationErrors.join("; ").slice(0, 100)}`);
  }

  return {
    formUrl: url,
    formType: formInfo.formType,
    fieldsFound: formInfo.fields.length,
    fieldsFilled,
    submitted,
    validationErrors: errors,
    passed,
    duration: Date.now() - startTime,
    testType: "valid",
  };
}

// ---------------------------------------------------------------------------
// testFormValidation
// ---------------------------------------------------------------------------

export async function testFormValidation(
  page: any,
  formInfo: FormInfo,
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<FormTestResult[]> {
  const results: FormTestResult[] = [];
  const url: string = page.url();

  // ---- Test 1: Empty submission ----
  onProgress("info", "Test 1/4: Empty submission");
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
    const emptyResult = await submitAndCollectErrors(page, url, formInfo, onProgress);
    emptyResult.testType = "empty";

    // For empty submission on forms with required fields, we expect validation errors
    const hasRequired = formInfo.fields.some((f) => f.required);
    if (hasRequired) {
      emptyResult.passed = emptyResult.validationErrors.length > 0;
      if (emptyResult.passed) {
        onProgress("pass", "  Empty submission correctly blocked by validation");
      } else {
        onProgress("warn", "  Empty submission was NOT blocked — possible missing validation");
      }
    } else {
      emptyResult.passed = true;
      onProgress("pass", "  No required fields — empty submission OK");
    }
    results.push(emptyResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress("fail", `  Empty submission test error: ${msg.slice(0, 80)}`);
    results.push(makeErrorResult(url, formInfo, "empty", msg));
  }

  // ---- Test 2: Invalid data ----
  onProgress("info", "Test 2/4: Invalid data");
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
    const invalidData = generateInvalidData();
    const invalidResult = await fillAndSubmit(page, formInfo, invalidData, onProgress);
    invalidResult.testType = "invalid";

    // We expect validation errors for invalid data
    invalidResult.passed = invalidResult.validationErrors.length > 0;
    if (invalidResult.passed) {
      onProgress("pass", "  Invalid data correctly rejected");
    } else {
      // Use LLM to check if the page shows any non-standard error indicators
      const pageText = await safeEvaluate<string>(page, `document.body.innerText.slice(0, 2000)`, "");
      const llmResult = await llm([{
        role: "user",
        content: `I submitted a form with invalid data (bad email "not-an-email", password "x", etc.).
The page now shows this content:
${pageText.slice(0, 1500)}

Does the page show any validation error messages or rejection? Answer JSON: {"hasErrors": true/false, "errors": ["list of error messages found"]}`,
      }]);

      try {
        const match = llmResult.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { hasErrors: boolean; errors: string[] };
          if (parsed.hasErrors) {
            invalidResult.passed = true;
            invalidResult.validationErrors = parsed.errors;
            onProgress("pass", "  LLM detected validation errors in page content");
          } else {
            onProgress("warn", "  Invalid data was NOT rejected — weak validation");
          }
        }
      } catch {
        onProgress("warn", "  Could not determine if invalid data was rejected");
      }
    }
    results.push(invalidResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress("fail", `  Invalid data test error: ${msg.slice(0, 80)}`);
    results.push(makeErrorResult(url, formInfo, "invalid", msg));
  }

  // ---- Test 3: Valid data ----
  onProgress("info", "Test 3/4: Valid data");
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
    const testData = generateTestData();
    const validResult = await fillForm(page, formInfo, testData, onProgress);
    validResult.testType = "valid";
    results.push(validResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress("fail", `  Valid data test error: ${msg.slice(0, 80)}`);
    results.push(makeErrorResult(url, formInfo, "valid", msg));
  }

  // ---- Test 4: Boundary testing ----
  onProgress("info", "Test 4/4: Boundary testing");
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
    const boundaryData = generateBoundaryData(formInfo);
    const boundaryResult = await fillAndSubmit(page, formInfo, boundaryData, onProgress);
    boundaryResult.testType = "boundary";

    // Boundary test passes if the form handles edge cases gracefully (errors or accepts)
    // It fails only if the page crashes or shows unexpected behavior
    const pageOk = await safeEvaluate<boolean>(page, `!document.querySelector(".error-500, .fatal-error")`, false);
    boundaryResult.passed = pageOk as boolean;
    if (boundaryResult.passed) {
      onProgress("pass", "  Boundary data handled gracefully");
    } else {
      onProgress("fail", "  Boundary data caused page error");
    }
    results.push(boundaryResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress("fail", `  Boundary test error: ${msg.slice(0, 80)}`);
    results.push(makeErrorResult(url, formInfo, "boundary", msg));
  }

  return results;
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Build a CSS selector for a field */
function buildFieldSelector(field: FormField): string {
  if (field.name) {
    return `[name="${field.name}"]`;
  }
  // Fallback to type-based selector
  return `input[type="${field.type}"]`;
}

/** Map a form field to the appropriate test data value */
function resolveFieldValue(field: FormField, data: TestDataSet): string | null {
  const nameLC = (field.name + " " + (field.label ?? "") + " " + (field.placeholder ?? "")).toLowerCase();
  const type = field.type.toLowerCase();

  // File inputs cannot be filled via text
  if (type === "file" || type === "hidden") return null;

  // Checkboxes and radios are handled separately
  if (type === "checkbox" || type === "radio") return null;

  // Select handled separately
  if (type === "select" || type === "select-one") return null;

  // Email
  if (type === "email" || nameLC.includes("email")) return data.email;

  // Password
  if (type === "password" || nameLC.includes("password")) return data.password;

  // Username
  if (nameLC.includes("username") || nameLC.includes("user name") || nameLC.includes("login")) return data.username;

  // Phone / tel
  if (type === "tel" || nameLC.includes("phone") || nameLC.includes("mobile") || nameLC.includes("tel")) return data.phone;

  // URL
  if (type === "url" || nameLC.includes("website") || nameLC.includes("url")) return data.url;

  // Date
  if (type === "date" || nameLC.includes("birth") || nameLC.includes("dob")) return data.date;

  // Credit card number
  if (nameLC.includes("card number") || nameLC.includes("cc-number") || nameLC.includes("cardnumber")) return data.creditCard.number;

  // Credit card expiry
  if (nameLC.includes("expir") || nameLC.includes("exp-date") || nameLC.includes("cc-exp")) return data.creditCard.expiry;

  // Credit card CVV
  if (nameLC.includes("cvv") || nameLC.includes("cvc") || nameLC.includes("security code") || nameLC.includes("cc-csc")) return data.creditCard.cvv;

  // Name fields
  if (nameLC.includes("first") && nameLC.includes("name")) return data.name.first;
  if (nameLC.includes("last") && nameLC.includes("name")) return data.name.last;
  if (nameLC.includes("full") && nameLC.includes("name")) return data.name.full;
  if (nameLC.includes("name") && !nameLC.includes("user")) return data.name.full;

  // Company
  if (nameLC.includes("company") || nameLC.includes("organization") || nameLC.includes("org")) return data.company;

  // Address parts
  if (nameLC.includes("street") || nameLC.includes("address line") || nameLC.includes("address1")) return data.address.street;
  if (nameLC.includes("city") || nameLC.includes("town")) return data.address.city;
  if (nameLC.includes("state") || nameLC.includes("province") || nameLC.includes("region")) return data.address.state;
  if (nameLC.includes("zip") || nameLC.includes("postal")) return data.address.zip;
  if (nameLC.includes("country")) return data.address.country;
  if (nameLC.includes("address")) return `${data.address.street}, ${data.address.city}, ${data.address.state} ${data.address.zip}`;

  // Number input
  if (type === "number") return "42";

  // Search
  if (type === "search" || nameLC.includes("search") || nameLC.includes("query") || nameLC.includes("q")) return "test search query";

  // Message / comment / textarea
  if (type === "textarea" || nameLC.includes("message") || nameLC.includes("comment") || nameLC.includes("description") || nameLC.includes("bio")) {
    return "This is an automated test message from Inspect Testing. Please disregard.";
  }

  // Subject
  if (nameLC.includes("subject") || nameLC.includes("title")) return "Automated Test Submission";

  // Generic text fallback
  if (type === "text" || type === "textarea") return "Test input";

  return "Test";
}

/** Generate intentionally invalid test data */
function generateInvalidData(): TestDataSet {
  return {
    name: { first: "", last: "", full: "" },
    email: "not-an-email",
    password: "x",
    phone: "abc",
    address: {
      street: "",
      city: "",
      state: "",
      zip: "INVALID",
      country: "",
    },
    creditCard: {
      number: "0000000000000000",
      expiry: "99/99",
      cvv: "0",
      name: "",
    },
    date: "not-a-date",
    url: "not-a-url",
    company: "",
    username: "a",
  };
}

/** Generate boundary-condition test data (min/max lengths, special chars) */
function generateBoundaryData(formInfo: FormInfo): TestDataSet {
  // Build a very long string for boundary testing
  const longString = "A".repeat(500);
  const specialChars = '<script>alert("xss")</script>';

  // Look for maxLength in fields to test at the boundary
  let maxField: FormField | undefined;
  for (const field of formInfo.fields) {
    if (field.maxLength && field.maxLength > 0) {
      maxField = field;
      break;
    }
  }

  const boundaryName = maxField?.maxLength ? "A".repeat(maxField.maxLength + 10) : longString;

  return {
    name: { first: boundaryName, last: specialChars, full: `${boundaryName} ${specialChars}` },
    email: `${"a".repeat(200)}@${"b".repeat(200)}.com`,
    password: specialChars,
    phone: "+1" + "9".repeat(30),
    address: {
      street: longString,
      city: specialChars,
      state: longString,
      zip: "00000-00000000",
      country: specialChars,
    },
    creditCard: {
      number: "9".repeat(30),
      expiry: "99/9999",
      cvv: "9".repeat(10),
      name: longString,
    },
    date: "9999-99-99",
    url: `https://${"a".repeat(300)}.com`,
    company: specialChars,
    username: "a",
  };
}

/** Submit the form without filling and collect validation errors */
async function submitAndCollectErrors(
  page: any,
  url: string,
  formInfo: FormInfo,
  onProgress: ProgressCallback,
): Promise<FormTestResult> {
  const startTime = Date.now();

  let submitted = false;

  // Try clicking the submit button
  if (formInfo.hasSubmitButton) {
    try {
      const clicked = await page.evaluate(() => {
        const form = document.querySelector("form");
        if (!form) return false;
        const btn =
          form.querySelector<HTMLElement>('button[type="submit"]') ??
          form.querySelector<HTMLElement>('input[type="submit"]') ??
          form.querySelector<HTMLElement>("button:not([type])");
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      submitted = clicked as boolean;
    } catch {
      // ignore
    }
  }

  if (!submitted) {
    try {
      await page.keyboard.press("Enter");
      submitted = true;
    } catch {
      // ignore
    }
  }

  try {
    await page.waitForTimeout(1500);
  } catch {
    // ignore
  }

  const validationErrors: string[] = await safeEvaluate<string[]>(page, `
    (() => {
      const errorSelectors = [
        ".error", ".error-message", ".field-error", ".validation-error",
        ".invalid-feedback", ".form-error", '[role="alert"]',
        ".alert-danger", ".alert-error", ".text-danger", ".text-error",
      ];
      const found = [];
      for (const sel of errorSelectors) {
        const elements = Array.from(document.querySelectorAll(sel));
        for (const el of elements) {
          const text = (el.textContent ?? "").trim();
          if (text && text.length < 200) found.push(text);
        }
      }
      const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
      for (const input of inputs) {
        const el = input;
        if (!el.checkValidity() && el.validationMessage) {
          found.push((el.name || el.id || el.type) + ": " + el.validationMessage);
        }
      }
      return found;
    })()
  `, []);

  return {
    formUrl: url,
    formType: formInfo.formType,
    fieldsFound: formInfo.fields.length,
    fieldsFilled: 0,
    submitted,
    validationErrors,
    passed: false, // caller will determine
    duration: Date.now() - startTime,
    testType: "empty",
  };
}

/** Fill a form with arbitrary data and submit, returning the result */
async function fillAndSubmit(
  page: any,
  formInfo: FormInfo,
  data: TestDataSet,
  onProgress: ProgressCallback,
): Promise<FormTestResult> {
  const startTime = Date.now();
  const url: string = page.url();
  let fieldsFilled = 0;

  for (const field of formInfo.fields) {
    try {
      const value = resolveFieldValue(field, data);
      if (value === null) continue;

      const selector = buildFieldSelector(field);

      if (field.type === "select" || field.type === "select-one") {
        if (field.options && field.options.length > 0) {
          await page.selectOption(selector, field.options[0], { timeout: 3000 });
          fieldsFilled++;
        }
      } else if (field.type === "checkbox") {
        await page.check(selector, { timeout: 3000 });
        fieldsFilled++;
      } else if (field.type === "radio") {
        if (field.options && field.options.length > 0) {
          await page.check(`input[name="${field.name}"][value="${field.options[0]}"]`, { timeout: 3000 });
        } else {
          await page.check(selector, { timeout: 3000 });
        }
        fieldsFilled++;
      } else if (field.type === "file") {
        continue;
      } else {
        // Clear existing value first
        try {
          await page.fill(selector, "", { timeout: 2000 });
        } catch {
          // field may not be clearable
        }
        await page.fill(selector, value, { timeout: 3000 });
        fieldsFilled++;
      }
    } catch {
      // Skip fields that can't be filled
    }
  }

  // Submit
  let submitted = false;
  if (formInfo.hasSubmitButton) {
    try {
      const clicked = await page.evaluate(() => {
        const form = document.querySelector("form");
        if (!form) return false;
        const btn =
          form.querySelector<HTMLElement>('button[type="submit"]') ??
          form.querySelector<HTMLElement>('input[type="submit"]') ??
          form.querySelector<HTMLElement>("button:not([type])");
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      submitted = clicked as boolean;
    } catch {
      // ignore
    }
  }

  if (!submitted) {
    try {
      await page.keyboard.press("Enter");
      submitted = true;
    } catch {
      // ignore
    }
  }

  try {
    await page.waitForTimeout(1500);
  } catch {
    // ignore
  }

  const validationErrors: string[] = await safeEvaluate<string[]>(page, `
    (() => {
      const errorSelectors = [
        ".error", ".error-message", ".field-error", ".validation-error",
        ".invalid-feedback", ".form-error", '[role="alert"]',
        ".alert-danger", ".alert-error", ".text-danger", ".text-error",
      ];
      const found = [];
      for (const sel of errorSelectors) {
        const elements = Array.from(document.querySelectorAll(sel));
        for (const el of elements) {
          const text = (el.textContent ?? "").trim();
          if (text && text.length < 200) found.push(text);
        }
      }
      const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
      for (const input of inputs) {
        const el = input;
        if (!el.checkValidity() && el.validationMessage) {
          found.push((el.name || el.id || el.type) + ": " + el.validationMessage);
        }
      }
      return found;
    })()
  `, []);

  return {
    formUrl: url,
    formType: formInfo.formType,
    fieldsFound: formInfo.fields.length,
    fieldsFilled,
    submitted,
    validationErrors,
    passed: false, // caller will determine
    duration: Date.now() - startTime,
    testType: "valid",
  };
}

/** Create a FormTestResult for an error case */
function makeErrorResult(
  url: string,
  formInfo: FormInfo,
  testType: FormTestResult["testType"],
  error: string,
): FormTestResult {
  return {
    formUrl: url,
    formType: formInfo.formType,
    fieldsFound: formInfo.fields.length,
    fieldsFilled: 0,
    submitted: false,
    validationErrors: [error],
    passed: false,
    duration: 0,
    testType,
  };
}
