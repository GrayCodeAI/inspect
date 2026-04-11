// ──────────────────────────────────────────────────────────────────────────────
// PWA Checks Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";
import { PWAAuditError } from "./errors.js";

export class CheckResult extends Schema.Class<CheckResult>("CheckResult")({
  name: Schema.String,
  passed: Schema.Boolean,
  score: Schema.Number,
  details: Schema.String,
  category: Schema.Literals(["manifest", "service-worker", "offline", "performance", "security"] as const),
}) {}

export class ManifestCheckResult extends Schema.Class<ManifestCheckResult>(
  "ManifestCheckResult",
)({
  hasManifest: Schema.Boolean,
  name: Schema.optional(Schema.String),
  shortName: Schema.optional(Schema.String),
  startUrl: Schema.optional(Schema.String),
  display: Schema.optional(Schema.String),
  icons: Schema.Array(
    Schema.Struct({
      src: Schema.String,
      sizes: Schema.String,
      type: Schema.String,
    }),
  ),
  themeColor: Schema.optional(Schema.String),
  backgroundColor: Schema.optional(Schema.String),
}) {}

export class ServiceWorkerCheckResult extends Schema.Class<ServiceWorkerCheckResult>(
  "ServiceWorkerCheckResult",
)({
  hasServiceWorker: Schema.Boolean,
  registrationScope: Schema.optional(Schema.String),
  isActive: Schema.Boolean,
  updateFound: Schema.Boolean,
}) {}

export class OfflineCheckResult extends Schema.Class<OfflineCheckResult>(
  "OfflineCheckResult",
)({
  worksOffline: Schema.Boolean,
  hasOfflineFallback: Schema.Boolean,
  cachedAssets: Schema.Number,
}) {}

export const checkManifest = (pageContent: string) =>
  Effect.sync(() => {
    const manifestLinkMatch = pageContent.match(
      /<link[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/i,
    );

    if (!manifestLinkMatch) {
      return new CheckResult({
        name: "manifest-exists",
        passed: false,
        score: 0,
        details: "No web app manifest link found",
        category: "manifest",
      });
    }

    return new CheckResult({
      name: "manifest-exists",
      passed: true,
      score: 1,
      details: `Manifest found at ${manifestLinkMatch[1]}`,
      category: "manifest",
    });
  }).pipe(Effect.withSpan("PwaChecks.checkManifest"));

export const checkServiceWorker = (pageContent: string) =>
  Effect.sync(() => {
    const hasServiceWorkerRegistration =
      pageContent.includes("navigator.serviceWorker.register") ||
      pageContent.includes("serviceWorker") && pageContent.includes("register");

    return new CheckResult({
      name: "service-worker-registered",
      passed: hasServiceWorkerRegistration,
      score: hasServiceWorkerRegistration ? 1 : 0,
      details: hasServiceWorkerRegistration
        ? "Service worker registration found"
        : "No service worker registration found",
      category: "service-worker",
    });
  }).pipe(Effect.withSpan("PwaChecks.checkServiceWorker"));

export const checkOfflineCapability = (pageContent: string) =>
  Effect.sync(() => {
    const hasCacheApi = pageContent.includes("caches.open") || pageContent.includes("CacheStorage");
    const hasFetchHandler = pageContent.includes("fetch") && pageContent.includes("event.respondWith");
    const hasInstallHandler = pageContent.includes("install") && pageContent.includes("waitUntil");

    const worksOffline = hasCacheApi && hasFetchHandler;

    return new CheckResult({
      name: "offline-capability",
      passed: worksOffline,
      score: worksOffline ? 1 : 0.5,
      details: `Cache API: ${hasCacheApi}, Fetch handler: ${hasFetchHandler}, Install handler: ${hasInstallHandler}`,
      category: "offline",
    });
  }).pipe(Effect.withSpan("PwaChecks.checkOfflineCapability"));

export const checkHttps = (pageUrl: string) =>
  Effect.sync(() => {
    const isHttps = pageUrl.startsWith("https://") || pageUrl.startsWith("localhost");

    return new CheckResult({
      name: "https-required",
      passed: isHttps,
      score: isHttps ? 1 : 0,
      details: isHttps ? "Served over HTTPS or localhost" : "Not served over HTTPS",
      category: "security",
    });
  }).pipe(Effect.withSpan("PwaChecks.checkHttps"));
