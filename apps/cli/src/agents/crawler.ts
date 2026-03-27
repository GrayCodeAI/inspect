// ============================================================================
// Crawler Agent (Agent 1) — Discovers all pages on a website
// ============================================================================

import type {
  SiteMap,
  PageInfo,
  BrokenLink,
  FormInfo,
  FormField,
  InteractiveElement,
  PageType,
  ProgressCallback,
} from "./types.js";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function crawlSite(
  startUrl: string,
  page: any, // Playwright Page
  onProgress: ProgressCallback,
  options?: { maxPages?: number; maxDepth?: number; timeout?: number; crawlDelay?: number },
): Promise<SiteMap> {
  const maxPages = options?.maxPages ?? 50;
  const maxDepth = options?.maxDepth ?? 5;
  const timeout = options?.timeout ?? 15_000;
  const crawlDelay = options?.crawlDelay ?? 500; // politeness delay between requests
  const crawlStart = Date.now();

  const baseOrigin = new URL(startUrl).origin;
  const visited = new Set<string>();
  const pages: PageInfo[] = [];
  const brokenLinks: BrokenLink[] = [];
  const externalLinks = new Set<string>();

  // Queue: [url, depth, referrer]
  const queue: Array<[string, number, string]> = [];

  onProgress("info", `Crawling ${startUrl} (max ${maxPages} pages, depth ${maxDepth})`);

  // -------------------------------------------------------------------------
  // Phase 1: Discover seed URLs from sitemap.xml and robots.txt
  // -------------------------------------------------------------------------

  let robotsTxt: string | undefined;
  const sitemapUrls: string[] = [];

  try {
    robotsTxt = (await fetchTextViaPage(page, `${baseOrigin}/robots.txt`, timeout)) ?? undefined;
    if (robotsTxt) {
      onProgress("info", "Found robots.txt");
      const sitemapLines = robotsTxt
        .split("\n")
        .filter((l) => l.toLowerCase().startsWith("sitemap:"))
        .map((l) => l.split(":", 2).slice(1).join(":").trim());
      for (const sUrl of sitemapLines) {
        if (sUrl) sitemapUrls.push(sUrl);
      }
    }
  } catch {
    // robots.txt not available — that's fine
  }

  // Try sitemap.xml if not discovered via robots.txt
  if (sitemapUrls.length === 0) {
    sitemapUrls.push(`${baseOrigin}/sitemap.xml`);
  }

  for (const sitemapUrl of sitemapUrls) {
    try {
      const sitemapXml = await fetchTextViaPage(page, sitemapUrl, timeout);
      if (sitemapXml && sitemapXml.includes("<url")) {
        const urls = parseSitemapXml(sitemapXml);
        onProgress("info", `Sitemap found: ${urls.length} URLs`);
        for (const u of urls) {
          const normalized = normalizeUrl(u);
          if (normalized && isSameOrigin(normalized, baseOrigin) && !visited.has(normalized)) {
            queue.push([normalized, 1, startUrl]);
          }
        }
      }
    } catch {
      // sitemap not available — continue
    }
  }

  // Always start with the entry URL
  const normalizedStart = normalizeUrl(startUrl);
  if (normalizedStart && !visited.has(normalizedStart)) {
    queue.unshift([normalizedStart, 0, ""]);
  }

  // -------------------------------------------------------------------------
  // Phase 2: BFS crawl
  // -------------------------------------------------------------------------

  while (queue.length > 0 && pages.length < maxPages) {
    const [url, depth, referrer] = queue.shift()!;
    const normalized = normalizeUrl(url);

    if (!normalized || visited.has(normalized)) continue;
    if (depth > maxDepth) continue;
    if (!isSameOrigin(normalized, baseOrigin)) {
      externalLinks.add(normalized);
      continue;
    }

    visited.add(normalized);

    // Politeness delay to avoid hammering the server
    if (pages.length > 0 && crawlDelay > 0) {
      await new Promise(r => setTimeout(r, crawlDelay));
    }

    onProgress("step", `[${pages.length + 1}/${maxPages}] Visiting: ${normalized}`);

    const pageInfo = await visitPage(page, normalized, depth, timeout);

    if (pageInfo) {
      pages.push(pageInfo);

      // Track broken links
      if (pageInfo.status >= 400) {
        brokenLinks.push({
          url: normalized,
          status: pageInfo.status,
          foundOn: referrer,
          linkText: "",
        });
      }

      // Enqueue discovered links
      for (const link of pageInfo.links) {
        const resolvedLink = resolveUrl(link, normalized);
        if (!resolvedLink) continue;

        const normalizedLink = normalizeUrl(resolvedLink);
        if (!normalizedLink) continue;

        if (!isSameOrigin(normalizedLink, baseOrigin)) {
          externalLinks.add(normalizedLink);
          continue;
        }

        if (!visited.has(normalizedLink) && depth + 1 <= maxDepth) {
          queue.push([normalizedLink, depth + 1, normalized]);
        }
      }
    } else {
      // Page failed to load entirely
      brokenLinks.push({
        url: normalized,
        status: 0,
        foundOn: referrer,
        linkText: "",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: Check for broken links among unvisited discovered links
  // -------------------------------------------------------------------------

  // Find links that appeared on pages but were not themselves visited yet
  const allDiscoveredInternalLinks = new Set<string>();
  for (const p of pages) {
    for (const link of p.links) {
      const resolved = resolveUrl(link, p.url);
      if (!resolved) continue;
      const norm = normalizeUrl(resolved);
      if (norm && isSameOrigin(norm, baseOrigin)) {
        allDiscoveredInternalLinks.add(norm);
      }
    }
  }

  // Identify broken links that we discovered during page visits
  // (links on pages that returned 4xx/5xx are already tracked)

  const totalLinks = allDiscoveredInternalLinks.size + externalLinks.size;

  onProgress("done", `Crawl complete: ${pages.length} pages, ${brokenLinks.length} broken links, ${externalLinks.size} external links`);

  return {
    baseUrl: startUrl,
    pages,
    totalLinks,
    brokenLinks,
    externalLinks: [...externalLinks],
    crawlDuration: Date.now() - crawlStart,
    robotsTxt,
    sitemapUrls: sitemapUrls.length > 0 ? sitemapUrls : undefined,
  };
}

// ---------------------------------------------------------------------------
// Visit a single page and extract all information
// ---------------------------------------------------------------------------

async function visitPage(
  page: any,
  url: string,
  depth: number,
  timeout: number,
): Promise<PageInfo | null> {
  const loadStart = Date.now();

  let status = 200;
  let title = "";

  try {
    // Listen for the response status code
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    status = response?.status() ?? 200;
    title = await page.title().catch(() => "");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Navigation timeout or failure — record as error page
    if (message.includes("net::ERR_") || message.includes("NS_ERROR_")) {
      return null;
    }
    // Timeout — still try to extract what we can
    status = 0;
    title = await page.title().catch(() => "");
  }

  const loadTime = Date.now() - loadStart;

  // Extract page data in a single evaluate call for performance
  const extracted = await page.evaluate(`(() => {
    // Links
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const links = anchors.map((a) => a.href).filter(Boolean);

    // Headings
    const headingEls = Array.from(document.querySelectorAll("h1, h2, h3"));
    const headings = headingEls.map((h) => (h.textContent || "").trim()).filter(Boolean);

    // Meta tags
    const meta = {};
    const metaEls = Array.from(document.querySelectorAll("meta[name], meta[property]"));
    for (const el of metaEls) {
      const key = el.getAttribute("name") || el.getAttribute("property") || "";
      const val = el.getAttribute("content") || "";
      if (key && val) meta[key] = val;
    }

    // Forms
    const formEls = Array.from(document.querySelectorAll("form"));
    const forms = formEls.map((form) => {
      const fields = [];

      const inputs = Array.from(form.querySelectorAll("input, textarea, select"));
      for (const input of inputs) {
        const el = input;
        const fieldName = el.name || el.id || "";
        const fieldType = el.type || el.tagName.toLowerCase();

        // Find associated label
        let label = "";
        if (el.id) {
          const labelEl = document.querySelector("label[for=\"" + el.id + "\"]");
          if (labelEl) label = labelEl.textContent?.trim() ?? "";
        }
        if (!label) {
          const parentLabel = el.closest("label");
          if (parentLabel) label = parentLabel.textContent?.trim() ?? "";
        }

        // Collect select options
        const options = [];
        if (el.tagName.toLowerCase() === "select") {
          const optEls = Array.from(el.options);
          for (const opt of optEls) options.push(opt.text);
        }

        fields.push({
          name: fieldName,
          type: fieldType,
          label,
          placeholder: el.placeholder ?? "",
          required: el.required,
          pattern: el.pattern ?? "",
          minLength: el.minLength > 0 ? el.minLength : -1,
          maxLength: el.maxLength > 0 ? el.maxLength : -1,
          options,
          autocomplete: el.autocomplete ?? "",
        });
      }

      const hasSubmitButton =
        form.querySelector('button[type="submit"], input[type="submit"]') !== null ||
        form.querySelector("button:not([type])") !== null;

      return {
        action: form.action || "",
        method: (form.method || "get").toUpperCase(),
        fields,
        hasSubmitButton,
      };
    });

    // Interactive elements
    const interactive = [];

    // Buttons
    for (const btn of Array.from(document.querySelectorAll("button, [role=\"button\"]"))) {
      interactive.push({
        type: "button",
        text: btn.textContent?.trim().slice(0, 80) ?? "",
        selector: getSimpleSelector(btn),
      });
    }

    // Inputs
    for (const inp of Array.from(document.querySelectorAll("input:not([type=\"hidden\"]), textarea"))) {
      const el = inp;
      const inputType = el.type || "text";
      let elType = "input";
      if (inputType === "checkbox") elType = "checkbox";
      else if (inputType === "radio") elType = "radio";
      else if (inputType === "file") elType = "file";
      else if (el.tagName.toLowerCase() === "textarea") elType = "textarea";

      interactive.push({
        type: elType,
        text: el.placeholder || el.name || el.id || "",
        selector: getSimpleSelector(el),
      });
    }

    // Selects
    for (const sel of Array.from(document.querySelectorAll("select"))) {
      interactive.push({
        type: "select",
        text: sel.name || sel.id || "",
        selector: getSimpleSelector(sel),
      });
    }

    // Modal triggers
    for (const el of Array.from(document.querySelectorAll("[data-toggle=\"modal\"], [data-bs-toggle=\"modal\"], [data-target], [aria-haspopup=\"dialog\"]"))) {
      interactive.push({
        type: "modal-trigger",
        text: el.textContent?.trim().slice(0, 80) ?? "",
        selector: getSimpleSelector(el),
      });
    }

    // Tabs
    for (const el of Array.from(document.querySelectorAll("[role=\"tab\"], [data-toggle=\"tab\"], [data-bs-toggle=\"tab\"]"))) {
      interactive.push({
        type: "tab",
        text: el.textContent?.trim().slice(0, 80) ?? "",
        selector: getSimpleSelector(el),
      });
    }

    // Accordions
    for (const el of Array.from(document.querySelectorAll("[data-toggle=\"collapse\"], [data-bs-toggle=\"collapse\"], [aria-expanded]"))) {
      // Skip if already captured as tab
      if (el.getAttribute("role") === "tab") continue;
      interactive.push({
        type: "accordion",
        text: el.textContent?.trim().slice(0, 80) ?? "",
        selector: getSimpleSelector(el),
      });
    }

    // Carousels
    for (const el of Array.from(document.querySelectorAll("[data-ride=\"carousel\"], [data-bs-ride=\"carousel\"], .carousel, .swiper"))) {
      interactive.push({
        type: "carousel",
        text: "carousel",
        selector: getSimpleSelector(el),
      });
    }

    // Dropdowns
    for (const el of Array.from(document.querySelectorAll("[data-toggle=\"dropdown\"], [data-bs-toggle=\"dropdown\"], [aria-haspopup=\"listbox\"], [aria-haspopup=\"menu\"]"))) {
      interactive.push({
        type: "dropdown",
        text: el.textContent?.trim().slice(0, 80) ?? "",
        selector: getSimpleSelector(el),
      });
    }

    // Toggles
    for (const el of Array.from(document.querySelectorAll("[role=\"switch\"], input[type=\"checkbox\"][role=\"switch\"]"))) {
      interactive.push({
        type: "toggle",
        text: el.textContent?.trim().slice(0, 80) ?? "",
        selector: getSimpleSelector(el),
      });
    }

    // Helper to get a simple CSS selector for an element
    function getSimpleSelector(el) {
      if (el.id) return "#" + el.id;
      if (el.getAttribute("data-testid")) return "[data-testid=\"" + el.getAttribute("data-testid") + "\"]";
      if (el.getAttribute("aria-label")) return "[aria-label=\"" + el.getAttribute("aria-label") + "\"]";
      if (el.className && typeof el.className === "string") {
        const cls = el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".");
        if (cls) return el.tagName.toLowerCase() + "." + cls;
      }
      return el.tagName.toLowerCase();
    }

    // Body text snippet for classification
    const bodyText = document.body?.innerText?.slice(0, 2000) ?? "";

    return { links, headings, meta, forms, interactive, bodyText };
  })()`).catch(() => ({
    links: [],
    headings: [],
    meta: {},
    forms: [],
    interactive: [],
    bodyText: "",
  })) as any;

  // Map extracted forms to FormInfo
  type ExtractedField = {
    name: string;
    type: string;
    label: string;
    placeholder: string;
    required: boolean;
    pattern: string;
    minLength: number;
    maxLength: number;
    options: string[];
    autocomplete: string;
  };
  type ExtractedForm = {
    action: string;
    method: string;
    fields: ExtractedField[];
    hasSubmitButton: boolean;
  };
  type ExtractedInteractive = { type: string; text: string; selector: string };

  const forms: FormInfo[] = (extracted.forms as ExtractedForm[]).map((f) => {
    const fields: FormField[] = f.fields.map((fd: ExtractedField) => ({
      name: fd.name,
      type: fd.type,
      label: fd.label || undefined,
      placeholder: fd.placeholder || undefined,
      required: fd.required,
      pattern: fd.pattern || undefined,
      minLength: fd.minLength > 0 ? fd.minLength : undefined,
      maxLength: fd.maxLength > 0 ? fd.maxLength : undefined,
      options: fd.options.length > 0 ? fd.options : undefined,
      autocomplete: fd.autocomplete || undefined,
    }));

    const formType = classifyForm(f.action, f.method, fields);

    return {
      action: f.action || undefined,
      method: f.method,
      fields,
      hasSubmitButton: f.hasSubmitButton,
      formType,
    };
  });

  // Map interactive elements
  const interactive: InteractiveElement[] = (extracted.interactive as ExtractedInteractive[]).map((el: ExtractedInteractive) => ({
    type: el.type as InteractiveElement["type"],
    text: el.text,
    selector: el.selector || undefined,
  }));

  // Classify page type
  const pageType = classifyPage(url, title, forms, extracted.bodyText, extracted.headings);

  return {
    url,
    title,
    type: pageType,
    status,
    links: extracted.links,
    forms,
    interactive,
    headings: extracted.headings,
    meta: extracted.meta,
    depth,
    loadTime,
  };
}

// ---------------------------------------------------------------------------
// Page classification
// ---------------------------------------------------------------------------

function classifyPage(
  url: string,
  title: string,
  forms: FormInfo[],
  bodyText: string,
  headings: string[],
): PageType {
  const path = new URL(url).pathname.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerBody = bodyText.toLowerCase();

  // URL pattern matching (most reliable signal)
  if (/\/(login|signin|sign-in|log-in)\b/.test(path)) return "auth";
  if (/\/(register|signup|sign-up|join)\b/.test(path)) return "auth";
  if (/\/dashboard\b/.test(path)) return "dashboard";
  if (/\/admin\b/.test(path)) return "admin";
  if (/\/search\b/.test(path)) return "search";
  if (/\/(checkout|cart|payment)\b/.test(path)) return "checkout";
  if (/\/(settings|preferences|account)\b/.test(path)) return "settings";
  if (/\/(profile|user\/\w+)\b/.test(path)) return "profile";
  if (/\/(contact|contact-us|support)\b/.test(path)) return "contact";
  if (/\/(blog|posts|articles|news)\b/.test(path)) return "blog";
  if (/\/(docs|documentation|help|wiki|guide)\b/.test(path)) return "docs";
  if (/\/(pricing|plans|upgrade)\b/.test(path)) return "pricing";
  if (/\/(404|not-found|error)\b/.test(path)) return "error";

  // Form-based detection
  const hasLoginForm = forms.some((f) => f.formType === "login");
  const hasSignupForm = forms.some((f) => f.formType === "signup");
  const hasSearchForm = forms.some((f) => f.formType === "search");
  const hasContactForm = forms.some((f) => f.formType === "contact");
  const hasCheckoutForm = forms.some((f) => f.formType === "checkout");

  if (hasLoginForm || hasSignupForm) return "auth";
  if (hasCheckoutForm) return "checkout";
  if (hasSearchForm) return "search";
  if (hasContactForm) return "contact";

  // Content-based detection
  if (lowerTitle.includes("login") || lowerTitle.includes("sign in")) return "auth";
  if (lowerTitle.includes("dashboard")) return "dashboard";
  if (lowerTitle.includes("search")) return "search";
  if (lowerTitle.includes("pricing")) return "pricing";
  if (lowerTitle.includes("404") || lowerTitle.includes("not found")) return "error";
  if (lowerTitle.includes("blog")) return "blog";
  if (lowerTitle.includes("documentation") || lowerTitle.includes("docs")) return "docs";

  // Body text signals
  if (lowerBody.includes("sign in to your account") || lowerBody.includes("log in to")) return "auth";
  if (lowerBody.includes("search results for")) return "search";

  // List patterns — many repeated similar structures
  const listIndicators = ["product", "item", "result", "listing", "catalog"];
  if (listIndicators.some((ind) => (lowerBody.match(new RegExp(ind, "g")) || []).length > 3)) return "list";

  // Detail page — usually has a single item slug in URL
  const pathSegments = path.split("/").filter(Boolean);
  if (pathSegments.length >= 2 && /^[a-z0-9-]+$/.test(pathSegments[pathSegments.length - 1])) {
    // Could be a detail page, but also could be anything — mild signal
    if (headings.length >= 1 && headings.length <= 3) return "detail";
  }

  // Forms present but not classified
  if (forms.length > 0) return "form";

  // Root / landing page
  if (path === "/" || path === "") return "landing";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Form classification
// ---------------------------------------------------------------------------

function classifyForm(
  action: string,
  _method: string,
  fields: FormField[],
): FormInfo["formType"] {
  const lowerAction = (action || "").toLowerCase();
  const fieldNames = fields.map((f) => (f.name + " " + (f.label ?? "") + " " + (f.type ?? "")).toLowerCase());
  const allFieldText = fieldNames.join(" ");

  // Login: has password + email/username, few fields
  const hasPassword = fields.some((f) => f.type === "password");
  const hasEmail = fields.some((f) =>
    f.type === "email" || /email/.test(f.name.toLowerCase()) || f.autocomplete === "email",
  );
  const hasUsername = fields.some((f) =>
    /username|user/.test(f.name.toLowerCase()) || f.autocomplete === "username",
  );

  if (hasPassword && (hasEmail || hasUsername) && fields.length <= 5) {
    // Distinguish login vs signup by field count and presence of "confirm" password
    const hasConfirmPassword = fields.filter((f) => f.type === "password").length >= 2;
    const hasNameField = fields.some((f) => /\b(name|first|last)\b/.test(f.name.toLowerCase()));
    if (hasConfirmPassword || hasNameField || fields.length > 3) return "signup";
    return "login";
  }

  if (hasPassword && fields.length <= 3) return "login";

  // Search
  if (
    lowerAction.includes("search") ||
    allFieldText.includes("search") ||
    allFieldText.includes("query") ||
    (fields.length === 1 && fields[0].type === "search")
  ) {
    return "search";
  }

  // Contact
  if (
    lowerAction.includes("contact") ||
    lowerAction.includes("message") ||
    (allFieldText.includes("message") && allFieldText.includes("email")) ||
    (fields.some((f) => f.type === "textarea") && hasEmail)
  ) {
    return "contact";
  }

  // Checkout / payment
  if (
    lowerAction.includes("checkout") ||
    lowerAction.includes("payment") ||
    lowerAction.includes("pay") ||
    allFieldText.includes("credit card") ||
    allFieldText.includes("card number") ||
    allFieldText.includes("cvv") ||
    allFieldText.includes("expir")
  ) {
    return "checkout";
  }

  // Filter
  if (
    allFieldText.includes("filter") ||
    allFieldText.includes("sort") ||
    (fields.every((f) => f.type === "checkbox" || f.type === "radio" || f.type === "select-one") && fields.length >= 2)
  ) {
    return "filter";
  }

  // Settings
  if (
    lowerAction.includes("setting") ||
    lowerAction.includes("preference") ||
    lowerAction.includes("profile") ||
    allFieldText.includes("timezone") ||
    allFieldText.includes("notification")
  ) {
    return "settings";
  }

  // Newsletter
  if (
    lowerAction.includes("subscribe") ||
    lowerAction.includes("newsletter") ||
    (fields.length === 1 && hasEmail) ||
    allFieldText.includes("subscribe") ||
    allFieldText.includes("newsletter")
  ) {
    return "newsletter";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Only crawl http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    // Remove fragment
    parsed.hash = "";
    // Remove trailing slash (but keep root /)
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    parsed.pathname = path;
    // Remove common tracking query params but keep meaningful ones
    // For dedup, strip all query params
    parsed.search = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function isSameOrigin(url: string, baseOrigin: string): boolean {
  try {
    return new URL(url).origin === baseOrigin;
  } catch {
    return false;
  }
}

function resolveUrl(href: string, base: string): string | null {
  try {
    // Skip non-page links
    if (
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("data:") ||
      href === "#" ||
      href === ""
    ) {
      return null;
    }
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sitemap XML parser (simple regex-based — no external deps)
// ---------------------------------------------------------------------------

function parseSitemapXml(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    if (url) urls.push(url);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Fetch text content via Playwright page navigation
// ---------------------------------------------------------------------------

async function fetchTextViaPage(
  page: any,
  url: string,
  timeout: number,
): Promise<string | null> {
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    if (!response || response.status() >= 400) return null;

    const contentType: string = (await response.headerValue("content-type")) ?? "";

    // For XML/text content, get the body text
    if (contentType.includes("xml") || contentType.includes("text/plain")) {
      return await page.evaluate(() => document.body?.innerText ?? document.documentElement?.textContent ?? "");
    }

    // Fallback: try to get the raw text anyway
    return await response.text().catch(() => null);
  } catch {
    return null;
  }
}
