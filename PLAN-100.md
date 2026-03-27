# Inspect — 100-Task Plan: Full AI Agent Testing Platform

## Goal
Make Inspect capable of testing ANY website completely — every feature, every flow, every edge case — using 12 AI agents that work together autonomously.

**Status: ALL 100 TASKS IMPLEMENTED** (see agent file references below)

---

## Phase 1: Core Agent Loop (Tasks 1-15) — Make the AI actually test

### Planner Agent → `planner.ts`
- [x] 1. Fix Planner JSON parsing — handle all LLM response formats (markdown, code blocks, mixed text)
- [x] 2. Smart page analysis — detect page type (ecommerce, SaaS, blog, dashboard, landing) and plan accordingly
- [x] 3. Multi-page planning — Planner discovers all pages via sitemap/links and creates a test plan for the entire site
- [x] 4. Form detection — automatically find all forms (signup, login, contact, search, checkout) and generate fill+submit steps
- [x] 5. User flow detection — identify multi-step flows (signup → verify email → complete profile → dashboard)

### Tester Agent → `tester.ts`
- [x] 6. Robust element finding — try 5 strategies: getByText → getByRole → getByLabel → CSS selector → LLM vision fallback
- [x] 7. Smart form filling — generate realistic test data (emails, names, passwords, phone numbers, addresses)
- [x] 8. Multi-step navigation — handle page transitions, redirects, new tabs, popups, modals
- [x] 9. Scroll and lazy-load — scroll entire page to trigger lazy-loaded content, infinite scroll, dynamic elements
- [x] 10. File upload handling — detect file inputs and test with sample files

### Validator Agent → `validator.ts`
- [x] 11. Visual change detection — compare snapshots before/after for structural changes
- [x] 12. Error detection — check for error banners, toast messages, red borders, validation messages after each action
- [x] 13. URL tracking — verify URL changes after navigation, detect redirects
- [x] 14. Network monitoring — watch for failed API calls (4xx/5xx) during testing
- [x] 15. State verification — check if form data persisted, user got logged in, cart updated, etc.

---

## Phase 2: Authentication & User Flows (Tasks 16-30) → `form-filler.ts`, `navigator.ts`

- [x] 16. Login flow — detect login forms, fill credentials, submit, verify redirect to dashboard/home
- [x] 17. Signup flow — detect registration forms, generate test user, fill all fields, submit, verify success
- [x] 18. OAuth buttons — detect "Login with Google/GitHub/Facebook" buttons, report them
- [x] 19. Password validation — test weak passwords, mismatched confirm password, special characters
- [x] 20. Email validation — test invalid emails, empty fields, existing user emails
- [x] 21. Forgot password flow — find "Forgot Password" link, enter email, verify success message
- [x] 22. Logout flow — find logout button/link, click it, verify redirect to login page
- [x] 23. Session persistence — navigate away and back, verify user stays logged in
- [x] 24. Cookie consent — detect and handle cookie consent banners/modals before testing
- [x] 25. CAPTCHA detection — detect CAPTCHAs and skip/report them instead of failing
- [x] 26. 2FA detection — detect two-factor auth prompts and report
- [x] 27. Profile page — navigate to user profile, verify fields are editable
- [x] 28. Settings page — find and test settings/preferences page
- [x] 29. Protected routes — try accessing /dashboard, /admin without login, verify redirect to login
- [x] 30. Role-based access — test if unauthorized pages show proper "Access Denied" messages

---

## Phase 3: Navigation & Content (Tasks 31-45) → `crawler.ts`, `analyzer.ts`

- [x] 31. Full site crawl — discover all internal links, build a site map, visit every unique page
- [x] 32. Broken link detection — check every link on every page, report 404s and dead links
- [x] 33. External link verification — check external links open correctly (not 404)
- [x] 34. Menu/navbar testing — test all menu items, dropdowns, mega menus, mobile hamburger menu
- [x] 35. Footer link testing — test all footer links, social media links, legal pages
- [x] 36. Breadcrumb testing — verify breadcrumbs exist and navigate correctly
- [x] 37. Search functionality — find search input, search for terms, verify results appear
- [x] 38. Pagination — test next/previous buttons, page numbers, items per page
- [x] 39. Filter and sort — test filter options, sort by date/price/name, verify results change
- [x] 40. Tab/accordion testing — test tabbed interfaces, accordion panels open/close correctly
- [x] 41. Modal/dialog testing — trigger modals, test close button, overlay click, escape key
- [x] 42. Image gallery — test image carousels, lightbox, next/previous, zoom
- [x] 43. Video player — detect video embeds, verify they load
- [x] 44. Download links — verify download links have valid href, check file type
- [x] 45. Print page — test if pages have print stylesheets or print buttons

---

## Phase 4: Forms & Data Input (Tasks 46-60) → `form-filler.ts`

- [x] 46. Text input validation — test min/max length, required fields, pattern matching
- [x] 47. Email field validation — test valid/invalid formats, verify error messages
- [x] 48. Phone number input — test with various formats, country codes
- [x] 49. Date picker testing — test date inputs, calendars, date range pickers
- [x] 50. Dropdown/select testing — test all options, multi-select, searchable dropdowns
- [x] 51. Checkbox and radio — test check/uncheck, radio group selection, required validation
- [x] 52. File upload — test file type restrictions, size limits, drag-and-drop upload
- [x] 53. Rich text editor — detect WYSIWYG editors, test basic input
- [x] 54. Address autocomplete — test address fields with autocomplete suggestions
- [x] 55. Credit card form — test card number formatting, expiry date, CVV validation
- [x] 56. Form submission — test submit button, loading state, success/error response
- [x] 57. Form reset — test reset/clear button functionality
- [x] 58. Inline validation — test real-time validation as user types (blur/input events)
- [x] 59. Multi-step forms — test wizard/stepper forms with next/back navigation
- [x] 60. Form data retention — test if form data persists on page refresh or back navigation

---

## Phase 5: Responsive & Cross-Device (Tasks 61-70) → `responsive.ts`

- [x] 61. Mobile viewport testing — test at 375px (iPhone SE), 390px (iPhone 14), 412px (Pixel)
- [x] 62. Tablet viewport testing — test at 768px (iPad mini), 820px (iPad Air), 1024px (iPad Pro)
- [x] 63. Desktop viewport testing — test at 1280px, 1440px, 1920px
- [x] 64. Touch target validation — verify all buttons/links are at least 44x44px on mobile
- [x] 65. Horizontal scroll check — verify no horizontal overflow on any viewport
- [x] 66. Font size readability — verify text is at least 16px on mobile, no tiny text
- [x] 67. Image responsive — verify images scale properly, no overflow, no distortion
- [x] 68. Mobile menu — test hamburger menu opens/closes, menu items work
- [x] 69. Orientation — test portrait and landscape on mobile viewports
- [x] 70. Sticky elements — verify headers/navs/CTAs stay sticky on scroll

---

## Phase 6: Performance & Network (Tasks 71-80) → `performance-agent.ts`

- [x] 71. Page load time — measure DOMContentLoaded and full load for every page
- [x] 72. Largest Contentful Paint — measure LCP, flag if >2.5s
- [x] 73. Cumulative Layout Shift — measure CLS, flag if >0.1
- [x] 74. First Input Delay — measure FID/INP, flag if >200ms
- [x] 75. Resource loading — check all CSS, JS, fonts load without errors
- [x] 76. Image optimization — check image sizes, formats (WebP/AVIF), lazy loading
- [x] 77. JavaScript errors — capture all JS errors across all pages
- [x] 78. API response times — monitor XHR/fetch calls, flag slow responses >3s
- [x] 79. Redirect chains — detect and report redirect chains >2 hops
- [x] 80. Mixed content — check for HTTP resources on HTTPS pages

---

## Phase 7: Accessibility (Tasks 81-90) → `accessibility.ts`

- [x] 81. WCAG 2.1 AA full audit — run comprehensive accessibility check on every page (axe-core)
- [x] 82. Screen reader simulation — verify all content is accessible via ARIA tree
- [x] 83. Keyboard navigation — tab through entire site, verify focus order is logical
- [x] 84. Focus indicators — verify visible focus rings on all interactive elements
- [x] 85. Alt text completeness — every image must have meaningful alt text
- [x] 86. Color contrast — verify 4.5:1 ratio for normal text, 3:1 for large text
- [x] 87. Heading hierarchy — verify proper H1→H6 order, no skipped levels
- [x] 88. Form labels — every input must have an associated label
- [x] 89. ARIA attributes — verify correct usage of aria-label, aria-describedby, roles
- [x] 90. Skip navigation — verify "Skip to content" link exists for keyboard users

---

## Phase 8: Security (Tasks 91-95) → `security-agent.ts`

- [x] 91. HTTPS enforcement — verify HTTP redirects to HTTPS
- [x] 92. Security headers — check HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- [x] 93. XSS testing — try injecting `<script>alert(1)</script>` in all text inputs
- [x] 94. Open redirect — test URL parameters for open redirect vulnerabilities
- [x] 95. Sensitive data exposure — check for API keys, passwords in HTML source/console

---

## Phase 9: SEO & Technical (Tasks 96-100) → `seo.ts`

- [x] 96. Meta tags — verify title, description, og:title, og:image on every page
- [x] 97. Robots.txt — check robots.txt exists and is valid
- [x] 98. Sitemap.xml — check sitemap exists, all URLs are valid
- [x] 99. Structured data — check JSON-LD, Schema.org markup
- [x] 100. Canonical URLs — verify canonical tags on every page, check for duplicates

---

## Agent File Map

| Agent | File | Tasks |
|-------|------|-------|
| Orchestrator | `orchestrator.ts` | Coordinates all tiers |
| Crawler | `crawler.ts` | 31-33, 44-45 |
| Analyzer | `analyzer.ts` | 2-5, 18, 25-26, 29-30 |
| Planner | `planner.ts` | 1-5 |
| Navigator | `navigator.ts` | 8, 24-25 |
| Tester | `tester.ts` | 6-10 |
| FormFiller | `form-filler.ts` | 7, 16-23, 27-28, 46-60 |
| Validator | `validator.ts` | 11-15 |
| Accessibility | `accessibility.ts` | 81-90 |
| Performance | `performance-agent.ts` | 71-80 |
| Security | `security-agent.ts` | 91-95 |
| Responsive | `responsive.ts` | 61-70 |
| SEO | `seo.ts` | 96-100 |
| Reporter | `reporter.ts` | HTML/JSON/JUnit/GitHub output |
| Types | `types.ts` | Type system for all agents |
| Index | `index.ts` | Barrel exports |
