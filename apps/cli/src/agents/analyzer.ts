// ============================================================================
// Analyzer Agent (Agent 2) — Classifies pages and detects features across a site
// ============================================================================

import type {
  SiteMap,
  SiteAnalysis,
  PageAnalysis,
  FeatureInventory,
  FormInfo,
  InteractiveElement,
  PageType,
  LLMCall,
  ProgressCallback,
} from "./types.js";
import { AriaSnapshotBuilder } from "@inspect/browser";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function analyzeSite(
  siteMap: SiteMap,
  page: any, // Playwright Page
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<SiteAnalysis> {
  onProgress("info", `Analyzing ${siteMap.pages.length} pages from ${siteMap.baseUrl}`);

  const ariaBuilder = new AriaSnapshotBuilder();
  const pageAnalyses: PageAnalysis[] = [];
  let techStack: string[] = [];
  let techStackDetected = false;

  // Analyze each page
  for (let i = 0; i < siteMap.pages.length; i++) {
    const pageInfo = siteMap.pages[i];
    onProgress("step", `[${i + 1}/${siteMap.pages.length}] Analyzing ${pageInfo.url}`);

    try {
      await page.goto(pageInfo.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch {
      onProgress("warn", `Failed to navigate to ${pageInfo.url}, skipping`);
      pageAnalyses.push(buildSkippedPageAnalysis(pageInfo.url, pageInfo.type, pageInfo.forms, pageInfo.interactive));
      continue;
    }

    // Build ARIA snapshot for this page
    let ariaSnapshot = "";
    try {
      await ariaBuilder.buildTree(page);
      ariaSnapshot = ariaBuilder.getFormattedTree();
    } catch {
      onProgress("warn", `ARIA snapshot failed for ${pageInfo.url}, continuing with DOM-only analysis`);
    }

    // Detect page features via DOM evaluation
    const features = await detectPageFeatures(page);

    // Detect tech stack on the first successful page
    if (!techStackDetected) {
      techStack = await detectTechStack(page);
      techStackDetected = true;
      if (techStack.length > 0) {
        onProgress("info", `Tech stack detected: ${techStack.join(", ")}`);
      }
    }

    // Classify forms more accurately using field analysis
    const classifiedForms = classifyForms(pageInfo.forms);

    // Determine page type — use the crawler's classification, or refine with LLM if unknown
    let pageType = pageInfo.type;
    if (pageType === "unknown" && ariaSnapshot.length > 0) {
      pageType = await classifyPageWithLLM(pageInfo.url, ariaSnapshot, llm, onProgress);
    }

    const analysis: PageAnalysis = {
      url: pageInfo.url,
      type: pageType,
      forms: classifiedForms,
      interactive: pageInfo.interactive,
      hasAuth: features.hasAuth,
      hasSearch: features.hasSearch,
      hasPagination: features.hasPagination,
      hasModals: features.hasModals,
      hasTabs: features.hasTabs,
      hasCarousel: features.hasCarousel,
      hasInfiniteScroll: features.hasInfiniteScroll,
      hasFileUpload: features.hasFileUpload,
      hasCookieConsent: features.hasCookieConsent,
      hasCaptcha: features.hasCaptcha,
    };

    pageAnalyses.push(analysis);
  }

  // Build feature inventory from all page analyses
  const features = buildFeatureInventory(pageAnalyses, siteMap);
  onProgress("info", buildFeatureSummary(features));

  // Detect additional tech stack from remaining pages if first page was sparse
  if (techStack.length === 0 && siteMap.pages.length > 0) {
    try {
      techStack = await detectTechStack(page);
    } catch {
      // Ignore — tech stack detection is best-effort
    }
  }

  onProgress("done", `Analysis complete: ${pageAnalyses.length} pages, ${techStack.length} technologies detected`);

  return {
    siteMap,
    pageAnalyses,
    features,
    techStack,
  };
}

// ---------------------------------------------------------------------------
// DOM-based feature detection
// ---------------------------------------------------------------------------

interface PageFeatures {
  hasAuth: boolean;
  hasSearch: boolean;
  hasPagination: boolean;
  hasModals: boolean;
  hasTabs: boolean;
  hasCarousel: boolean;
  hasInfiniteScroll: boolean;
  hasFileUpload: boolean;
  hasCookieConsent: boolean;
  hasCaptcha: boolean;
  oauthProviders: string[];
  hasPayment: boolean;
}

async function detectPageFeatures(page: any): Promise<PageFeatures> {
  try {
    return await page.evaluate(`
      (() => {
        const q = (s) => document.querySelector(s) !== null;
        const qAll = (s) => Array.from(document.querySelectorAll(s));
        const bodyText = (document.body?.innerText ?? "").toLowerCase();
        const bodyHtml = (document.body?.innerHTML ?? "").toLowerCase();

        const hasPasswordInput = q('input[type="password"]');
        const hasLoginForm = bodyText.includes("log in") || bodyText.includes("login") || bodyText.includes("sign in");
        const hasSignupForm = bodyText.includes("sign up") || bodyText.includes("register") || bodyText.includes("create account");
        const hasAuth = hasPasswordInput || (hasLoginForm && q("form")) || (hasSignupForm && q("form"));

        const hasSearchInput = q('input[type="search"]') || q('[role="search"]') || q('input[name="q"]') || q('input[name="query"]') || q('input[name="search"]');
        const hasSearchButton = qAll("button").some(el => (el.textContent ?? "").toLowerCase().includes("search") || (el.getAttribute("aria-label") ?? "").toLowerCase().includes("search"));
        const hasSearch = hasSearchInput || hasSearchButton;

        const hasPaginationNav = q("nav.pagination") || q(".pagination") || q('[aria-label="pagination"]');
        const hasPaginationLinks = qAll("a").some(el => { const t = (el.textContent ?? "").trim().toLowerCase(); return t === "next" || t === "previous" || t === "prev" || /^\\d+$/.test(t); });
        const hasNextPrevButtons = qAll("button").some(el => { const t = (el.textContent ?? "").trim().toLowerCase(); return t === "next" || t === "previous" || t === "load more"; });
        const hasPagination = hasPaginationNav || hasPaginationLinks || hasNextPrevButtons;

        const hasModals = q('[role="dialog"]') || q('[role="alertdialog"]') || q("dialog") || qAll("[data-toggle='modal'], [data-bs-toggle='modal']").length > 0;
        const hasTabs = q('[role="tablist"]') || q(".nav-tabs") || q(".tabs");
        const hasCarousel = q(".carousel") || q(".slider") || q(".swiper") || q(".carousel-indicators") || q(".slick-dots") || q(".swiper-pagination");
        const hasLoadMoreButton = qAll("button").some(el => { const t = (el.textContent ?? "").trim().toLowerCase(); return t === "load more" || t === "show more" || t === "view more"; });
        const hasInfiniteScroll = hasLoadMoreButton || q("[data-infinite-scroll]") || q(".infinite-scroll");
        const hasFileUpload = q('input[type="file"]') || q("[data-dropzone]") || q(".dropzone");

        const hasCookieBanner = bodyHtml.includes("cookie") && (bodyHtml.includes("consent") || bodyHtml.includes("accept") || bodyHtml.includes("privacy"));
        const hasCookieConsentElement = q("#cookie-consent") || q("#cookie-banner") || q(".cookie-banner") || q(".cookie-consent") || q("#onetrust-banner-sdk") || q("#CybotCookiebotDialog") || q(".cc-banner");
        const hasCookieConsent = hasCookieBanner || hasCookieConsentElement;

        const hasCaptcha = q(".g-recaptcha") || q("#g-recaptcha") || bodyHtml.includes("recaptcha") || q(".h-captcha") || bodyHtml.includes("hcaptcha") || q(".cf-turnstile") || bodyHtml.includes("challenges.cloudflare.com");

        const oauthProviders = [];
        const providerMap = [
          ["google", ["login with google", "sign in with google", "continue with google", "accounts.google.com"]],
          ["github", ["login with github", "sign in with github", "continue with github", "github.com/login/oauth"]],
          ["facebook", ["login with facebook", "sign in with facebook", "continue with facebook"]],
          ["apple", ["sign in with apple", "continue with apple", "appleid.apple.com"]],
          ["microsoft", ["sign in with microsoft", "continue with microsoft", "login.microsoftonline.com"]],
          ["twitter", ["sign in with twitter", "continue with twitter", "sign in with x"]],
        ];
        for (const [name, patterns] of providerMap) {
          if (patterns.some(p => bodyText.includes(p) || bodyHtml.includes(p))) oauthProviders.push(name);
        }

        const hasStripe = bodyHtml.includes("stripe") || q("[data-stripe]") || q("#card-element") || q(".StripeElement");
        const hasPayPal = bodyHtml.includes("paypal") || q(".paypal-button") || q("#paypal-button-container");
        const hasPayment = hasStripe || hasPayPal || bodyHtml.includes("braintree") || q('input[autocomplete="cc-number"]');

        return { hasAuth, hasSearch, hasPagination, hasModals, hasTabs, hasCarousel, hasInfiniteScroll, hasFileUpload, hasCookieConsent, hasCaptcha, oauthProviders, hasPayment };
      })()
    `) as PageFeatures;
  } catch {
    return {
      hasAuth: false,
      hasSearch: false,
      hasPagination: false,
      hasModals: false,
      hasTabs: false,
      hasCarousel: false,
      hasInfiniteScroll: false,
      hasFileUpload: false,
      hasCookieConsent: false,
      hasCaptcha: false,
      oauthProviders: [],
      hasPayment: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Tech stack detection
// ---------------------------------------------------------------------------

async function detectTechStack(page: any): Promise<string[]> {
  try {
    return await page.evaluate(`
      (() => {
        const detected = [];
        const w = window;
        const html = document.documentElement.outerHTML.toLowerCase();

        if (w.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector("[data-reactroot]") || document.querySelector("[data-reactid]") || html.includes("_reactRootContainer")) detected.push("React");
        if (w.__VUE__ || w.__vue__ || document.querySelector("[data-v-]") || html.includes("__vue_app__")) detected.push("Vue");
        if (document.querySelector("[ng-version]") || w.getAllAngularRootElements || w.ng || html.includes("ng-app")) detected.push("Angular");
        if (w.__svelte || document.querySelector("[class*='svelte-']") || html.includes("__svelte")) detected.push("Svelte");
        if (w.next || w.__NEXT_DATA__) detected.push("Next.js");
        if (w.__nuxt || w.$nuxt || w.__NUXT__) detected.push("Nuxt");
        if (html.includes("gatsby") || w.___gatsby) detected.push("Gatsby");
        if (w.Ember || w.Em) detected.push("Ember");

        if (w.jQuery || (w.$ && w.$.fn && w.$.fn.jquery)) detected.push("jQuery");
        if (html.includes("tailwindcss")) {
          const classes = Array.from(document.querySelectorAll("[class]")).flatMap(el => (el.getAttribute("class") || "").split(" "));
          const twPat = /^(bg-|text-|flex|grid|p-|m-|w-|h-|rounded|shadow|border-)/;
          if (classes.filter(c => twPat.test(c)).length > 10) detected.push("Tailwind CSS");
        }
        if (html.includes("bootstrap") || document.querySelector(".container-fluid") || document.querySelector("[class*='col-md-']")) detected.push("Bootstrap");
        if (w.htmx) detected.push("htmx");
        if (w.Alpine || document.querySelector("[x-data]")) detected.push("Alpine.js");

        if (w.Stripe || html.includes("js.stripe.com") || html.includes("stripe-js")) detected.push("Stripe");
        if (html.includes("paypal") || w.paypal) detected.push("PayPal");

        if (w.gtag || w.ga || html.includes("google-analytics") || html.includes("googletagmanager")) detected.push("Google Analytics");
        if (html.includes("hotjar") || w.hj) detected.push("Hotjar");
        if (html.includes("segment") || (w.analytics && w.analytics.identify)) detected.push("Segment");
        if (html.includes("mixpanel") || w.mixpanel) detected.push("Mixpanel");

        if (html.includes("auth0")) detected.push("Auth0");
        if (html.includes("firebase") || w.firebase) detected.push("Firebase");
        if (html.includes("supabase") || w.supabase) detected.push("Supabase");
        if (html.includes("clerk")) detected.push("Clerk");

        if (html.includes("wp-content") || html.includes("wordpress")) detected.push("WordPress");
        if (html.includes("shopify") || w.Shopify) detected.push("Shopify");
        if (html.includes("webflow")) detected.push("Webflow");
        if (html.includes("squarespace")) detected.push("Squarespace");

        return detected;
      })()
    `) as string[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Form classification
// ---------------------------------------------------------------------------

function classifyForms(forms: FormInfo[]): FormInfo[] {
  return forms.map((form) => {
    // If already classified, keep it unless it's "unknown"
    if (form.formType !== "unknown") return form;

    const fieldNames = form.fields.map((f) => f.name.toLowerCase());
    const fieldTypes = form.fields.map((f) => f.type.toLowerCase());
    const fieldLabels = form.fields.map((f) => (f.label ?? "").toLowerCase());
    const fieldAutocompletes = form.fields.map((f) => (f.autocomplete ?? "").toLowerCase());
    const allText = [...fieldNames, ...fieldLabels, ...fieldAutocompletes].join(" ");

    // Login: has password, 2-3 fields, typically email/username + password
    if (fieldTypes.includes("password") && form.fields.length <= 3) {
      const hasEmailOrUsername = allText.includes("email") || allText.includes("user") || allText.includes("login");
      if (hasEmailOrUsername) {
        return { ...form, formType: "login" as const };
      }
    }

    // Signup: has password + confirmation or many fields with password
    if (fieldTypes.includes("password") && form.fields.length > 3) {
      const hasConfirmPassword =
        fieldNames.filter((n) => n.includes("password")).length >= 2 ||
        allText.includes("confirm") ||
        allText.includes("repeat");
      const hasNameField = allText.includes("name") || allText.includes("first") || allText.includes("last");
      if (hasConfirmPassword || hasNameField) {
        return { ...form, formType: "signup" as const };
      }
    }

    // Search: single text input, search-like names
    if (form.fields.length <= 2 && (allText.includes("search") || allText.includes("query") || allText.includes("q"))) {
      return { ...form, formType: "search" as const };
    }

    // Checkout: payment-related fields
    if (
      allText.includes("card") ||
      allText.includes("payment") ||
      allText.includes("cc-number") ||
      allText.includes("cvv") ||
      allText.includes("expir") ||
      allText.includes("billing")
    ) {
      return { ...form, formType: "checkout" as const };
    }

    // Contact: message/subject fields
    if (allText.includes("message") || allText.includes("subject") || (allText.includes("email") && allText.includes("name") && !fieldTypes.includes("password"))) {
      return { ...form, formType: "contact" as const };
    }

    // Newsletter: single email field
    if (form.fields.length <= 2 && allText.includes("email") && !fieldTypes.includes("password")) {
      return { ...form, formType: "newsletter" as const };
    }

    // Settings: has various input types, often with current values
    if (allText.includes("setting") || allText.includes("preference") || allText.includes("profile")) {
      return { ...form, formType: "settings" as const };
    }

    // Filter: has selects/checkboxes, few text fields
    const selectCount = fieldTypes.filter((t) => t === "select" || t === "checkbox" || t === "radio").length;
    if (selectCount > form.fields.length / 2 && form.fields.length >= 2) {
      return { ...form, formType: "filter" as const };
    }

    return form;
  });
}

// ---------------------------------------------------------------------------
// LLM-enhanced page classification for ambiguous pages
// ---------------------------------------------------------------------------

async function classifyPageWithLLM(
  url: string,
  ariaSnapshot: string,
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<PageType> {
  try {
    // Truncate the ARIA snapshot to keep token usage reasonable
    const truncated = ariaSnapshot.length > 3000 ? ariaSnapshot.slice(0, 3000) + "\n... (truncated)" : ariaSnapshot;

    const prompt = `You are a JSON API. Classify this web page into exactly one type.

URL: ${url}

ARIA Snapshot (accessibility tree):
${truncated}

Page types: landing, auth, dashboard, form, list, detail, checkout, settings, error, search, blog, docs, pricing, contact, profile, admin

Return ONLY a JSON object with a single field "type". Example: {"type":"landing"}
No markdown, no explanation, just the JSON.`;

    const response = await llm([{ role: "user", content: prompt }]);

    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const objStart = jsonStr.indexOf("{");
    const objEnd = jsonStr.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) {
      jsonStr = jsonStr.slice(objStart, objEnd + 1);
    }

    const parsed = JSON.parse(jsonStr) as { type: string };
    const validTypes: PageType[] = [
      "landing", "auth", "dashboard", "form", "list", "detail",
      "checkout", "settings", "error", "search", "blog", "docs",
      "pricing", "contact", "profile", "admin",
    ];
    if (validTypes.includes(parsed.type as PageType)) {
      return parsed.type as PageType;
    }
  } catch {
    onProgress("warn", `LLM classification failed for ${url}, keeping as unknown`);
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Feature inventory aggregation
// ---------------------------------------------------------------------------

function buildFeatureInventory(analyses: PageAnalysis[], siteMap: SiteMap): FeatureInventory {
  const authFlows: string[] = [];
  const searchPages: string[] = [];
  const formPages: string[] = [];
  const paginatedPages: string[] = [];
  const protectedRoutes: string[] = [];
  const oauthProviders = new Set<string>();
  const paymentForms: string[] = [];
  const fileUploads: string[] = [];

  for (const analysis of analyses) {
    // Auth flows — pages with login or signup forms
    if (analysis.hasAuth) {
      authFlows.push(analysis.url);
    }
    const hasAuthForm = analysis.forms.some(
      (f) => f.formType === "login" || f.formType === "signup",
    );
    if (hasAuthForm && !authFlows.includes(analysis.url)) {
      authFlows.push(analysis.url);
    }

    // Search pages
    if (analysis.hasSearch) {
      searchPages.push(analysis.url);
    }

    // Form pages — any page with forms (excluding pure search forms)
    const nonSearchForms = analysis.forms.filter((f) => f.formType !== "search");
    if (nonSearchForms.length > 0) {
      formPages.push(analysis.url);
    }

    // Paginated pages
    if (analysis.hasPagination) {
      paginatedPages.push(analysis.url);
    }

    // File uploads
    if (analysis.hasFileUpload) {
      fileUploads.push(analysis.url);
    }

    // Payment forms
    const hasPaymentForm = analysis.forms.some((f) => f.formType === "checkout");
    if (hasPaymentForm) {
      paymentForms.push(analysis.url);
    }
  }

  // Detect protected routes: pages that redirected to an auth page
  const authUrls = new Set(authFlows);
  for (const pageInfo of siteMap.pages) {
    // A protected route is one where the final URL (after redirects) lands on an auth page
    // We check if the page's URL pattern suggests it should be non-auth, but it was classified as auth
    const analysis = analyses.find((a) => a.url === pageInfo.url);
    if (analysis && analysis.type === "auth" && !urlLooksLikeAuth(pageInfo.url)) {
      protectedRoutes.push(pageInfo.url);
    }
  }

  // Collect OAuth providers from DOM feature detection across all pages
  // We need to re-aggregate from the page evaluations, so we extract from auth pages
  // The oauthProviders from detectPageFeatures are captured during analysis
  // Since we stored them in PageFeatures (not PageAnalysis), we detect them from form/auth pages
  // by checking for common OAuth button text in the analysis forms and interactive elements
  for (const analysis of analyses) {
    if (!analysis.hasAuth) continue;
    for (const el of analysis.interactive) {
      const text = el.text.toLowerCase();
      if (text.includes("google")) oauthProviders.add("google");
      if (text.includes("github")) oauthProviders.add("github");
      if (text.includes("facebook")) oauthProviders.add("facebook");
      if (text.includes("apple")) oauthProviders.add("apple");
      if (text.includes("microsoft")) oauthProviders.add("microsoft");
      if (text.includes("twitter") || text.includes(" x ")) oauthProviders.add("twitter");
    }
  }

  return {
    authFlows,
    searchPages,
    formPages,
    paginatedPages,
    protectedRoutes,
    oauthProviders: Array.from(oauthProviders),
    paymentForms,
    fileUploads,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function urlLooksLikeAuth(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  return (
    path.includes("login") ||
    path.includes("signin") ||
    path.includes("sign-in") ||
    path.includes("signup") ||
    path.includes("sign-up") ||
    path.includes("register") ||
    path.includes("auth") ||
    path.includes("sso")
  );
}

function buildSkippedPageAnalysis(
  url: string,
  type: PageType,
  forms: FormInfo[],
  interactive: InteractiveElement[],
): PageAnalysis {
  return {
    url,
    type,
    forms,
    interactive,
    hasAuth: false,
    hasSearch: false,
    hasPagination: false,
    hasModals: false,
    hasTabs: false,
    hasCarousel: false,
    hasInfiniteScroll: false,
    hasFileUpload: false,
    hasCookieConsent: false,
    hasCaptcha: false,
  };
}

function buildFeatureSummary(features: FeatureInventory): string {
  const parts: string[] = [];
  if (features.authFlows.length > 0) parts.push(`${features.authFlows.length} auth flow(s)`);
  if (features.searchPages.length > 0) parts.push(`${features.searchPages.length} search page(s)`);
  if (features.formPages.length > 0) parts.push(`${features.formPages.length} form page(s)`);
  if (features.paginatedPages.length > 0) parts.push(`${features.paginatedPages.length} paginated page(s)`);
  if (features.protectedRoutes.length > 0) parts.push(`${features.protectedRoutes.length} protected route(s)`);
  if (features.oauthProviders.length > 0) parts.push(`OAuth: ${features.oauthProviders.join(", ")}`);
  if (features.paymentForms.length > 0) parts.push(`${features.paymentForms.length} payment form(s)`);
  if (features.fileUploads.length > 0) parts.push(`${features.fileUploads.length} file upload(s)`);
  return parts.length > 0 ? `Features found: ${parts.join(", ")}` : "No notable features detected";
}
