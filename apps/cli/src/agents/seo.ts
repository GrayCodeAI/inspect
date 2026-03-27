import type {
  SEOReport, SEOIssue, MetaTagAudit, RobotsTxtAudit, SitemapAudit,
  StructuredDataAudit, CanonicalAudit, ProgressCallback
} from "./types.js";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runSEOAudit(
  page: any,
  url: string,
  onProgress: ProgressCallback,
): Promise<SEOReport> {
  onProgress("info", "Running SEO audit...");

  const issues: SEOIssue[] = [];

  // Navigate to the target URL
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  onProgress("step", "  Page loaded, starting checks...");

  // Derive the base URL (origin) for robots/sitemap fetches
  const parsed = new URL(url);
  const baseUrl = parsed.origin;

  // 1. Meta tags
  onProgress("step", "  Checking meta tags...");
  const meta = await auditMetaTags(page);
  issues.push(...metaTagIssues(meta, url));

  // 2. Robots.txt
  onProgress("step", "  Checking robots.txt...");
  const robotsTxt = await auditRobotsTxt(page, baseUrl);
  issues.push(...robotsTxtIssues(robotsTxt, url));

  // 3. Sitemap
  onProgress("step", "  Checking sitemap.xml...");
  const sitemap = await auditSitemap(page, baseUrl);
  issues.push(...sitemapIssues(sitemap, url));

  // 4. Structured data
  onProgress("step", "  Checking structured data...");
  const structuredData = await auditStructuredData(page);
  issues.push(...structuredDataIssues(structuredData, url));

  // 5. Canonicals
  onProgress("step", "  Checking canonical URLs...");
  const canonicals = await auditCanonicals(page, url);
  issues.push(...canonicalIssues(canonicals));

  // Score: 100 minus weighted penalties
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const seriousCount = issues.filter(i => i.severity === "serious").length;
  const moderateCount = issues.filter(i => i.severity === "moderate").length;
  const minorCount = issues.filter(i => i.severity === "minor").length;

  const score = Math.max(
    0,
    100 - (criticalCount * 15 + seriousCount * 10 + moderateCount * 5 + minorCount * 2),
  );

  const report: SEOReport = {
    url,
    issues,
    meta,
    robotsTxt,
    sitemap,
    structuredData,
    canonicals,
    score,
  };

  if (issues.length === 0) {
    onProgress("pass", `  SEO: No issues found (100/100)`);
  } else {
    onProgress("warn", `  SEO: ${issues.length} issue(s) (${score}/100)`);
    for (const issue of issues.slice(0, 8)) {
      onProgress("warn", `    ${issue.severity}: ${issue.description}`);
    }
  }

  onProgress("done", "SEO audit complete.");
  return report;
}

// ---------------------------------------------------------------------------
// Meta tags
// ---------------------------------------------------------------------------

export async function auditMetaTags(page: any): Promise<MetaTagAudit> {
  const data = await page.evaluate(`
    (() => {
      const getMeta = (name) => {
        const el = document.querySelector('meta[name="' + name + '"]')
          || document.querySelector('meta[property="' + name + '"]');
        return el ? el.getAttribute("content") : null;
      };

      const charsetEl = document.querySelector("meta[charset]");
      let charset = charsetEl ? charsetEl.getAttribute("charset") : null;
      if (!charset) {
        const httpEquiv = document.querySelector('meta[http-equiv="Content-Type"]');
        if (httpEquiv) {
          const match = (httpEquiv.getAttribute("content") || "").match(/charset=([\\w-]+)/i);
          charset = match ? match[1] : null;
        }
      }

      return {
        title: document.title || null,
        description: getMeta("description"),
        ogTitle: getMeta("og:title"),
        ogDescription: getMeta("og:description"),
        ogImage: getMeta("og:image"),
        twitterCard: getMeta("twitter:card"),
        viewport: getMeta("viewport"),
        charset,
      };
    })()
  `) as MetaTagAudit;

  return data;
}

function metaTagIssues(meta: MetaTagAudit, url: string): SEOIssue[] {
  const issues: SEOIssue[] = [];

  // Title checks
  if (!meta.title) {
    issues.push({
      severity: "critical",
      rule: "title-missing",
      description: "Page has no <title> element",
      url,
      fix: "Add a unique, descriptive <title> tag to the <head>.",
    });
  } else {
    if (meta.title.length > 60) {
      issues.push({
        severity: "moderate",
        rule: "title-too-long",
        description: `Title is ${meta.title.length} chars (recommended: ≤60)`,
        url,
        fix: "Shorten the title to 60 characters or fewer so it displays fully in search results.",
      });
    }
    if (meta.title.length < 10) {
      issues.push({
        severity: "moderate",
        rule: "title-too-short",
        description: `Title is only ${meta.title.length} chars (recommended: ≥10)`,
        url,
        fix: "Use a more descriptive title with at least 10 characters.",
      });
    }
  }

  // Description
  if (!meta.description) {
    issues.push({
      severity: "serious",
      rule: "description-missing",
      description: "Page has no meta description",
      url,
      fix: 'Add <meta name="description" content="..."> with a summary of the page.',
    });
  } else {
    if (meta.description.length > 160) {
      issues.push({
        severity: "moderate",
        rule: "description-too-long",
        description: `Meta description is ${meta.description.length} chars (recommended: ≤160)`,
        url,
        fix: "Trim the meta description to 160 characters so it isn't truncated in search results.",
      });
    }
    if (meta.description.length < 50) {
      issues.push({
        severity: "moderate",
        rule: "description-too-short",
        description: `Meta description is only ${meta.description.length} chars (recommended: ≥50)`,
        url,
        fix: "Expand the meta description to at least 50 characters for better search snippets.",
      });
    }
  }

  // Open Graph
  if (!meta.ogTitle) {
    issues.push({
      severity: "moderate",
      rule: "og-title-missing",
      description: "Missing og:title meta tag",
      url,
      fix: 'Add <meta property="og:title" content="..."> for better social sharing.',
    });
  }
  if (!meta.ogImage) {
    issues.push({
      severity: "moderate",
      rule: "og-image-missing",
      description: "Missing og:image meta tag",
      url,
      fix: 'Add <meta property="og:image" content="..."> for rich link previews on social media.',
    });
  }

  // Viewport
  if (!meta.viewport) {
    issues.push({
      severity: "serious",
      rule: "viewport-missing",
      description: "Missing viewport meta tag",
      url,
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Robots.txt
// ---------------------------------------------------------------------------

export async function auditRobotsTxt(page: any, baseUrl: string): Promise<RobotsTxtAudit> {
  const robotsUrl = `${baseUrl}/robots.txt`;
  const result: RobotsTxtAudit = {
    exists: false,
    valid: false,
    disallowed: [],
  };

  try {
    const response = await page.goto(robotsUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const status: number = response?.status?.() ?? 0;

    if (status !== 200) {
      return result;
    }

    result.exists = true;

    const body: string = await page.evaluate(`document.body?.innerText ?? ""`) as string;

    if (!body || body.trim().length === 0) {
      return result;
    }

    const lines = body.split("\n").map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith("#"));

    const disallowed: string[] = [];
    let sitemapUrl: string | undefined;

    for (const line of lines) {
      const disallowMatch = line.match(/^Disallow:\s*(.+)/i);
      if (disallowMatch) {
        disallowed.push(disallowMatch[1].trim());
      }

      const sitemapMatch = line.match(/^Sitemap:\s*(.+)/i);
      if (sitemapMatch) {
        sitemapUrl = sitemapMatch[1].trim();
      }
    }

    result.valid = true;
    result.disallowed = disallowed;
    if (sitemapUrl) {
      result.sitemapUrl = sitemapUrl;
    }
  } catch {
    // Navigation failed — robots.txt is unreachable, leave defaults
  }

  return result;
}

function robotsTxtIssues(audit: RobotsTxtAudit, url: string): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!audit.exists) {
    issues.push({
      severity: "moderate",
      rule: "robots-missing",
      description: "No robots.txt file found",
      url,
      fix: "Create a robots.txt at the site root to guide search engine crawlers.",
    });
    return issues;
  }

  // Check for overly broad disallow (blocking everything)
  if (audit.disallowed.includes("/")) {
    issues.push({
      severity: "serious",
      rule: "robots-disallow-all",
      description: 'robots.txt contains "Disallow: /" which blocks all crawlers',
      url,
      fix: "Remove the blanket Disallow: / rule unless you intentionally want to block indexing.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

export async function auditSitemap(page: any, baseUrl: string): Promise<SitemapAudit> {
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  const result: SitemapAudit = {
    exists: false,
    valid: false,
    urlCount: 0,
    invalidUrls: [],
  };

  try {
    const response = await page.goto(sitemapUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const status: number = response?.status?.() ?? 0;

    if (status !== 200) {
      return result;
    }

    result.exists = true;

    // Grab the raw page content (may be XML rendered as text)
    const content: string = await page.evaluate(`
      document.querySelector("pre")?.textContent
        ?? document.body?.innerText
        ?? ""
    `) as string;

    if (!content || content.trim().length === 0) {
      return result;
    }

    // Extract <loc> URLs via regex (avoid pulling in an XML parser)
    const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
    const urls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(content)) !== null) {
      urls.push(match[1]);
    }

    result.urlCount = urls.length;

    if (urls.length === 0) {
      // Could be a sitemap index or invalid
      return result;
    }

    result.valid = true;

    // Validate a sample of URLs (up to 10)
    const sample = urls.slice(0, 10);
    for (const sampleUrl of sample) {
      try {
        const checkResponse = await page.goto(sampleUrl, {
          waitUntil: "domcontentloaded",
          timeout: 10_000,
        });
        const sampleStatus: number = checkResponse?.status?.() ?? 0;
        if (sampleStatus < 200 || sampleStatus >= 400) {
          result.invalidUrls.push(sampleUrl);
        }
      } catch {
        result.invalidUrls.push(sampleUrl);
      }
    }
  } catch {
    // Navigation failed — sitemap is unreachable, leave defaults
  }

  return result;
}

function sitemapIssues(audit: SitemapAudit, url: string): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!audit.exists) {
    issues.push({
      severity: "moderate",
      rule: "sitemap-missing",
      description: "No sitemap.xml file found",
      url,
      fix: "Create a sitemap.xml listing all important pages to help search engines discover content.",
    });
    return issues;
  }

  if (!audit.valid) {
    issues.push({
      severity: "serious",
      rule: "sitemap-invalid",
      description: "sitemap.xml exists but contains no valid <loc> entries",
      url,
      fix: "Ensure the sitemap is well-formed XML with <loc> elements for each URL.",
    });
  }

  for (const invalidUrl of audit.invalidUrls) {
    issues.push({
      severity: "serious",
      rule: "sitemap-broken-url",
      description: `Sitemap URL returns an error: ${invalidUrl}`,
      url: invalidUrl,
      fix: "Remove the URL from the sitemap or fix the target page so it returns a 200 status.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Structured data (JSON-LD & microdata)
// ---------------------------------------------------------------------------

export async function auditStructuredData(page: any): Promise<StructuredDataAudit> {
  // Navigate back is not needed — we'll re-evaluate on the current page.
  // The caller is responsible for ensuring the page is on the target URL.

  const data = await page.evaluate(`
    (() => {
      const result = {
        jsonLdTypes: [],
        jsonLdErrors: [],
        microdataTypes: [],
      };

      // JSON-LD
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent || "");
          const extract = (obj) => {
            if (obj && obj["@type"]) {
              if (Array.isArray(obj["@type"])) {
                result.jsonLdTypes.push(...obj["@type"]);
              } else {
                result.jsonLdTypes.push(obj["@type"]);
              }
            }
            if (obj && obj["@graph"] && Array.isArray(obj["@graph"])) {
              for (const item of obj["@graph"]) {
                extract(item);
              }
            }
          };
          if (Array.isArray(parsed)) {
            for (const item of parsed) extract(item);
          } else {
            extract(parsed);
          }
        } catch (e) {
          result.jsonLdErrors.push("Invalid JSON-LD: " + (e.message || "parse error"));
        }
      }

      // Microdata
      const microdataEls = Array.from(document.querySelectorAll("[itemscope][itemtype]"));
      for (const el of microdataEls) {
        const itemtype = el.getAttribute("itemtype") || "";
        // Extract the type name from the schema URL, e.g. https://schema.org/Organization -> Organization
        const typeParts = itemtype.split("/");
        result.microdataTypes.push(typeParts[typeParts.length - 1] || itemtype);
      }

      return result;
    })()
  `) as { jsonLdTypes: string[]; jsonLdErrors: string[]; microdataTypes: string[] };

  const allTypes = [...new Set([...data.jsonLdTypes, ...data.microdataTypes])];

  return {
    hasJsonLd: data.jsonLdTypes.length > 0,
    hasSchemaOrg: allTypes.length > 0,
    types: allTypes,
    errors: data.jsonLdErrors,
  };
}

function structuredDataIssues(audit: StructuredDataAudit, url: string): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (!audit.hasSchemaOrg) {
    issues.push({
      severity: "moderate",
      rule: "structured-data-missing",
      description: "No structured data (JSON-LD or microdata) found on the page",
      url,
      fix: "Add JSON-LD structured data (e.g. Organization, WebSite) to improve rich search results.",
    });
  }

  for (const error of audit.errors) {
    issues.push({
      severity: "serious",
      rule: "structured-data-parse-error",
      description: error,
      url,
      fix: "Fix the JSON syntax inside the <script type=\"application/ld+json\"> block.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Canonical URLs
// ---------------------------------------------------------------------------

export async function auditCanonicals(page: any, url: string): Promise<CanonicalAudit> {
  const canonicalData = await page.evaluate(`
    (() => {
      const link = document.querySelector('link[rel="canonical"]');
      return link ? link.getAttribute("href") : null;
    })()
  `) as string | null;

  const pages: CanonicalAudit["pages"] = [];

  if (!canonicalData) {
    pages.push({ url, canonical: null, issue: "Missing canonical tag" });
  } else {
    let resolvedCanonical: string;
    try {
      // Resolve relative canonical to absolute
      resolvedCanonical = new URL(canonicalData, url).href;
    } catch {
      pages.push({
        url,
        canonical: canonicalData,
        issue: "Canonical URL is malformed and cannot be parsed",
      });
      return { pages };
    }

    // Check if canonical is on a different domain
    const pageHost = new URL(url).hostname;
    let canonicalHost: string;
    try {
      canonicalHost = new URL(resolvedCanonical).hostname;
    } catch {
      pages.push({
        url,
        canonical: resolvedCanonical,
        issue: "Canonical URL has an invalid hostname",
      });
      return { pages };
    }

    if (canonicalHost !== pageHost) {
      pages.push({
        url,
        canonical: resolvedCanonical,
        issue: `Canonical points to a different domain (${canonicalHost})`,
      });
    } else {
      // Normalize trailing slashes for comparison
      const normalize = (u: string) => u.replace(/\/+$/, "").toLowerCase();
      const isSelfReferencing = normalize(resolvedCanonical) === normalize(url);

      if (!isSelfReferencing) {
        pages.push({
          url,
          canonical: resolvedCanonical,
          issue: "Canonical points to a different page (potential duplicate content signal)",
        });
      } else {
        // Self-referencing canonical — good practice, no issue
        pages.push({ url, canonical: resolvedCanonical });
      }
    }
  }

  return { pages };
}

function canonicalIssues(audit: CanonicalAudit): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const entry of audit.pages) {
    if (!entry.issue) continue;

    if (entry.canonical === null) {
      issues.push({
        severity: "moderate",
        rule: "canonical-missing",
        description: "Page has no canonical link tag",
        url: entry.url,
        fix: 'Add <link rel="canonical" href="..."> pointing to the preferred URL for this page.',
      });
    } else if (entry.issue.includes("different domain")) {
      issues.push({
        severity: "serious",
        rule: "canonical-cross-domain",
        description: entry.issue,
        url: entry.url,
        fix: "Ensure the canonical URL points to the correct domain unless cross-domain canonicalization is intentional.",
      });
    } else if (entry.issue.includes("different page")) {
      issues.push({
        severity: "serious",
        rule: "canonical-not-self",
        description: `Canonical URL (${entry.canonical}) differs from page URL — ${entry.issue}`,
        url: entry.url,
        fix: "Verify this is intentional. If not, update the canonical to be self-referencing.",
      });
    } else {
      // Malformed or invalid
      issues.push({
        severity: "serious",
        rule: "canonical-invalid",
        description: entry.issue,
        url: entry.url,
        fix: "Fix the canonical URL so it is a valid, absolute URL.",
      });
    }
  }

  return issues;
}
