// ============================================================================
// SPA Agent — Single Page Application support: framework detection,
// client-side route discovery, hydration, shadow DOM, virtual scroll
// ============================================================================

import { safeEvaluate } from "./evaluate.js";

// ---------------------------------------------------------------------------
// discoverSPARoutes — Discover client-side routes by inspecting routers,
// monkey-patching History API, and clicking internal links
// ---------------------------------------------------------------------------

export async function discoverSPARoutes(
  page: any,
  baseUrl: string,
): Promise<string[]> {
  const origin = new URL(baseUrl).origin;

  // Step 1: Install history/hashchange interceptors and collect routes from
  //         framework router objects (React Router, Vue Router, Angular Router)
  const staticRoutes = await safeEvaluate<string[]>(
    page,
    `(() => {
      const routes = new Set();

      // --- React Router ---
      // v6+ exposes __REACT_ROUTER__ on certain data-router elements
      try {
        const rr = window.__REACT_ROUTER__ || window.__reactRouterContext;
        if (rr && rr.router && rr.router.routes) {
          const walk = (list) => {
            for (const r of list) {
              if (r.path) routes.add(r.path);
              if (r.children) walk(r.children);
            }
          };
          walk(rr.router.routes);
        }
      } catch {}

      // Scan React DevTools fibre tree for Route path props
      try {
        const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook && hook.renderers) {
          for (const [, renderer] of hook.renderers) {
            if (renderer && renderer.findFiberByHostInstance) break;
          }
        }
      } catch {}

      // --- Vue Router ---
      try {
        const vr = window.$router || window.__VUE_ROUTER__;
        if (vr && vr.getRoutes) {
          for (const r of vr.getRoutes()) {
            if (r.path) routes.add(r.path);
          }
        } else if (vr && vr.options && vr.options.routes) {
          const walk = (list) => {
            for (const r of list) {
              if (r.path) routes.add(r.path);
              if (r.children) walk(r.children);
            }
          };
          walk(vr.options.routes);
        }
      } catch {}

      // --- Angular Router ---
      try {
        if (typeof window.ng !== "undefined" && window.ng.getComponent) {
          const appRoot = document.querySelector("app-root") || document.querySelector("[ng-version]");
          if (appRoot) {
            const cmp = window.ng.getComponent(appRoot);
            if (cmp && cmp.router && cmp.router.config) {
              const walk = (list) => {
                for (const r of list) {
                  if (r.path !== undefined) routes.add("/" + r.path);
                  if (r.children) walk(r.children);
                }
              };
              walk(cmp.router.config);
            }
          }
        }
        if (window.getAllAngularRootElements) {
          const roots = window.getAllAngularRootElements();
          for (const root of roots) {
            const injector = root.__ngContext__;
            if (injector) {
              // Best-effort Angular route extraction
            }
          }
        }
      } catch {}

      return Array.from(routes);
    })()`,
    [] as string[],
  );

  // Step 2: Monkey-patch History API to capture pushState / replaceState calls
  //         and listen for hashchange events
  await safeEvaluate<boolean>(
    page,
    `(() => {
      if (window.__inspectSPARouteCapture) return false;
      window.__inspectSPARouteCapture = [];

      const origPushState = history.pushState.bind(history);
      const origReplaceState = history.replaceState.bind(history);

      history.pushState = function(state, title, url) {
        if (url) window.__inspectSPARouteCapture.push(String(url));
        return origPushState(state, title, url);
      };

      history.replaceState = function(state, title, url) {
        if (url) window.__inspectSPARouteCapture.push(String(url));
        return origReplaceState(state, title, url);
      };

      window.addEventListener("hashchange", () => {
        window.__inspectSPARouteCapture.push(location.href);
      });

      window.addEventListener("popstate", () => {
        window.__inspectSPARouteCapture.push(location.href);
      });

      return true;
    })()`,
    false,
  );

  // Step 3: Click all internal links on the page to trigger SPA navigations
  const internalHrefs = await safeEvaluate<string[]>(
    page,
    `(() => {
      const origin = location.origin;
      const hrefs = [];
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      for (const a of anchors) {
        try {
          const url = new URL(a.href, location.href);
          if (url.origin === origin) {
            hrefs.push(a.href);
          }
        } catch {}
      }
      return hrefs;
    })()`,
    [] as string[],
  );

  // Click each internal link, wait briefly for SPA navigation
  const beforeUrl = page.url();
  for (const href of internalHrefs.slice(0, 30)) {
    try {
      await safeEvaluate<boolean>(
        page,
        `(() => {
          const a = document.querySelector('a[href="' + ${JSON.stringify(href)} + '"]');
          if (a) { a.click(); return true; }
          return false;
        })()`,
        false,
        3_000,
      );
      // Brief wait for SPA route change
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    } catch {
      // Link click failed — continue
    }
  }

  // Navigate back to the original URL
  try {
    await page.goto(beforeUrl, { waitUntil: "domcontentloaded", timeout: 10_000 });
  } catch {
    // Best effort
  }

  // Step 4: Collect all captured routes from the monkey-patched History API
  const capturedRoutes = await safeEvaluate<string[]>(
    page,
    `(() => {
      return window.__inspectSPARouteCapture || [];
    })()`,
    [] as string[],
  );

  // Step 5: Deduplicate and normalize all discovered routes
  const allRoutes = new Set<string>();

  for (const route of staticRoutes) {
    try {
      const resolved = new URL(route, origin).href;
      allRoutes.add(resolved);
    } catch {
      // Might be a path pattern like "/users/:id" — add as-is
      allRoutes.add(route);
    }
  }

  for (const href of internalHrefs) {
    try {
      const url = new URL(href, origin);
      if (url.origin === origin) {
        allRoutes.add(url.href);
      }
    } catch {}
  }

  for (const captured of capturedRoutes) {
    try {
      const url = new URL(captured, origin);
      if (url.origin === origin) {
        allRoutes.add(url.href);
      }
    } catch {
      allRoutes.add(captured);
    }
  }

  return Array.from(allRoutes);
}

// ---------------------------------------------------------------------------
// waitForHydration — Wait for framework hydration to complete
// ---------------------------------------------------------------------------

export async function waitForHydration(
  page: any,
  timeout: number = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeout;

  // Check for React hydration
  const hasReact = await safeEvaluate<boolean>(
    page,
    `(() => {
      return !!(
        document.querySelector("[data-reactroot]") ||
        document.querySelector("#__next") ||
        document.querySelector("#root[data-reactroot]") ||
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
        window.__NEXT_DATA__
      );
    })()`,
    false,
    3_000,
  );

  if (hasReact) {
    // Wait for React to finish hydrating: look for the root to have
    // _reactRootContainer or __reactFiber on its children
    const hydrated = await safeEvaluate<boolean>(
      page,
      `(() => {
        return new Promise((resolve) => {
          const check = () => {
            const root = document.querySelector("#root") ||
                         document.querySelector("#__next") ||
                         document.querySelector("[data-reactroot]");
            if (!root) { resolve(true); return; }

            // React 18+ concurrent root
            if (root._reactRootContainer || root.__reactFiber) {
              resolve(true);
              return;
            }

            // Check children for React fiber keys
            for (const child of root.children) {
              const keys = Object.keys(child);
              if (keys.some(k => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"))) {
                resolve(true);
                return;
              }
            }

            // Not yet hydrated
            resolve(false);
          };
          // Slight delay to let React finish
          setTimeout(check, 100);
        });
      })()`,
      false,
      Math.min(Math.max(deadline - Date.now(), 1_000), 5_000),
    );

    if (hydrated) return;

    // Fallback: poll until React DevTools hook signals readiness
    while (Date.now() < deadline) {
      const ready = await safeEvaluate<boolean>(
        page,
        `(() => {
          const root = document.querySelector("#root") ||
                       document.querySelector("#__next") ||
                       document.querySelector("[data-reactroot]");
          if (!root) return true;
          for (const child of root.children) {
            const keys = Object.keys(child);
            if (keys.some(k => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"))) {
              return true;
            }
          }
          return false;
        })()`,
        false,
        2_000,
      );
      if (ready) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
    }
    return;
  }

  // Check for Vue hydration
  const hasVue = await safeEvaluate<boolean>(
    page,
    `(() => {
      return !!(
        document.querySelector("[data-v-app]") ||
        document.querySelector("#__nuxt") ||
        window.__VUE__ ||
        window.__NUXT__
      );
    })()`,
    false,
    3_000,
  );

  if (hasVue) {
    while (Date.now() < deadline) {
      const ready = await safeEvaluate<boolean>(
        page,
        `(() => {
          // Vue 3: __vue_app__ on the root element
          const root = document.querySelector("#app") ||
                       document.querySelector("#__nuxt") ||
                       document.querySelector("[data-v-app]");
          if (!root) return true;
          if (root.__vue_app__) return true;
          // Vue 2: __vue__ on root
          if (root.__vue__) return true;
          return false;
        })()`,
        false,
        2_000,
      );
      if (ready) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
    }
    return;
  }

  // Check for Angular hydration
  const hasAngular = await safeEvaluate<boolean>(
    page,
    `(() => {
      return !!(
        document.querySelector("[ng-version]") ||
        document.querySelector("app-root") ||
        window.getAllAngularRootElements
      );
    })()`,
    false,
    3_000,
  );

  if (hasAngular) {
    while (Date.now() < deadline) {
      const ready = await safeEvaluate<boolean>(
        page,
        `(() => {
          const root = document.querySelector("[ng-version]") ||
                       document.querySelector("app-root");
          if (!root) return true;
          // Angular sets ng-version attribute and has __ngContext__
          if (root.getAttribute("ng-version") && root.__ngContext__) return true;
          // Also check getAllAngularRootElements
          if (window.getAllAngularRootElements) {
            const roots = window.getAllAngularRootElements();
            if (roots && roots.length > 0) return true;
          }
          return false;
        })()`,
        false,
        2_000,
      );
      if (ready) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
    }
    return;
  }

  // Generic hydration check: wait for no pending network requests
  // AND no DOM mutations for 500ms
  try {
    await page.waitForLoadState("networkidle", {
      timeout: Math.min(Math.max(deadline - Date.now(), 1_000), 5_000),
    });
  } catch {
    // Network still active — proceed with DOM stability check
  }

  // Wait for DOM to stabilise (no mutations for 500ms)
  if (Date.now() < deadline) {
    await safeEvaluate<boolean>(
      page,
      `(() => {
        return new Promise((resolve) => {
          let lastMutation = Date.now();
          const observer = new MutationObserver(() => {
            lastMutation = Date.now();
          });
          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
          });

          const check = () => {
            if (Date.now() - lastMutation >= 500) {
              observer.disconnect();
              resolve(true);
            } else {
              setTimeout(check, 100);
            }
          };
          setTimeout(check, 200);

          // Hard timeout
          setTimeout(() => {
            observer.disconnect();
            resolve(true);
          }, ${Math.min(Math.max(deadline - Date.now(), 1_000), 5_000)});
        });
      })()`,
      true,
      Math.min(Math.max(deadline - Date.now(), 2_000), 8_000),
    );
  }
}

// ---------------------------------------------------------------------------
// pierceShadowDOM — Recursively traverse shadow roots, collecting text content
// ---------------------------------------------------------------------------

export async function pierceShadowDOM(
  page: any,
  selector: string,
): Promise<string[]> {
  const results = await safeEvaluate<string[]>(
    page,
    `(() => {
      const texts = [];
      const selector = ${JSON.stringify(selector)};

      function traverseShadowRoots(root) {
        // Query elements in this root that match the selector
        try {
          const matches = root.querySelectorAll(selector);
          for (const el of matches) {
            const text = (el.textContent || "").trim();
            if (text) texts.push(text);
          }
        } catch {}

        // Also collect all text from shadow roots we find
        const allElements = root.querySelectorAll("*");
        for (const el of allElements) {
          if (el.shadowRoot) {
            traverseShadowRoots(el.shadowRoot);
          }
        }
      }

      // Start traversal from document
      traverseShadowRoots(document);

      // If no selector matches were found, fall back to collecting
      // all text content from inside shadow roots
      if (texts.length === 0) {
        function collectShadowText(root) {
          const elements = root.querySelectorAll("*");
          for (const el of elements) {
            if (el.shadowRoot) {
              const shadowText = (el.shadowRoot.textContent || "").trim();
              if (shadowText) texts.push(shadowText);
              // Recurse into nested shadow roots
              collectShadowText(el.shadowRoot);
            }
          }
        }
        collectShadowText(document);
      }

      return texts;
    })()`,
    [] as string[],
    15_000,
  );

  return results;
}

// ---------------------------------------------------------------------------
// handleVirtualScroll — Scroll through virtualized lists to materialise items
// ---------------------------------------------------------------------------

export async function handleVirtualScroll(page: any): Promise<number> {
  // Detect virtual scroll container and count items by scrolling incrementally
  const result = await safeEvaluate<number>(
    page,
    `(() => {
      return new Promise((resolve) => {
        // Known virtual scroll container selectors
        const containerSelectors = [
          "[class*='virtual']",
          "[class*='Virtual']",
          "[class*='react-window']",
          "[class*='ReactVirtualized']",
          "[class*='vue-virtual']",
          "[class*='cdk-virtual']",
          "[class*='virtual-scroller']",
          "[class*='infinite-scroll']",
          "[style*='overflow: auto']",
          "[style*='overflow-y: auto']",
          "[style*='overflow: scroll']",
          "[style*='overflow-y: scroll']",
        ];

        let container = null;
        for (const sel of containerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            // Verify it has scrollable content
            if (el.scrollHeight > el.clientHeight) {
              container = el;
              break;
            }
          }
        }

        // Fallback: find any element with significant scroll height
        if (!container) {
          const candidates = document.querySelectorAll("div, section, main, ul, ol");
          for (const el of candidates) {
            if (
              el.scrollHeight > el.clientHeight * 2 &&
              el.clientHeight > 100 &&
              el.children.length > 0
            ) {
              const style = getComputedStyle(el);
              if (style.overflow === "auto" || style.overflow === "scroll" ||
                  style.overflowY === "auto" || style.overflowY === "scroll") {
                container = el;
                break;
              }
            }
          }
        }

        if (!container) {
          resolve(0);
          return;
        }

        // Track unique items as we scroll
        const seenItems = new Set();

        function collectItems() {
          const children = container.children;
          for (const child of children) {
            // Use a combination of text content and position as key
            const key = (child.textContent || "").trim().slice(0, 100) +
                        "|" + child.getBoundingClientRect().top;
            if ((child.textContent || "").trim().length > 0) {
              seenItems.add((child.textContent || "").trim().slice(0, 200));
            }
          }
        }

        // Initial collection
        collectItems();

        // Scroll incrementally
        let scrollAttempts = 0;
        const maxScrollAttempts = 50;
        const scrollStep = container.clientHeight * 0.8;

        function scrollAndCollect() {
          if (scrollAttempts >= maxScrollAttempts) {
            resolve(seenItems.size);
            return;
          }

          const prevScrollTop = container.scrollTop;
          container.scrollTop += scrollStep;
          scrollAttempts++;

          // Wait for DOM to update after scroll
          requestAnimationFrame(() => {
            setTimeout(() => {
              collectItems();

              // Check if we've reached the bottom (scroll didn't change)
              if (container.scrollTop === prevScrollTop) {
                resolve(seenItems.size);
                return;
              }

              scrollAndCollect();
            }, 100);
          });
        }

        scrollAndCollect();

        // Hard timeout
        setTimeout(() => {
          resolve(seenItems.size);
        }, 15000);
      });
    })()`,
    0,
    20_000,
  );

  return result;
}

// ---------------------------------------------------------------------------
// detectFramework — Detect which frontend framework is in use
// ---------------------------------------------------------------------------

export async function detectFramework(page: any): Promise<string | null> {
  const framework = await safeEvaluate<string | null>(
    page,
    `(() => {
      // --- React / Next.js / Gatsby / Remix ---
      const hasReact = !!(
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
        document.querySelector("[data-reactroot]") ||
        document.querySelector("#__next") ||
        (() => {
          try {
            const root = document.querySelector("#root") || document.querySelector("#app");
            if (!root) return false;
            for (const child of root.children) {
              const keys = Object.keys(child);
              if (keys.some(k => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"))) {
                return true;
              }
            }
            return false;
          } catch { return false; }
        })()
      );

      // Next.js
      if (window.__NEXT_DATA__ || document.querySelector("#__next")) {
        return "Next.js";
      }

      // Remix
      if (window.__remixContext || window.__REMIX_DEV_TOOLS) {
        return "Remix";
      }

      // Gatsby
      if (window.___gatsby || document.querySelector("#___gatsby")) {
        return "Gatsby";
      }

      if (hasReact) return "React";

      // --- Vue / Nuxt ---
      if (window.__NUXT__ || window.__NUXT_DATA__ || document.querySelector("#__nuxt")) {
        return "Nuxt";
      }

      const hasVue = !!(
        window.__VUE__ ||
        (() => {
          try {
            const root = document.querySelector("#app") || document.querySelector("[data-v-app]");
            if (!root) return false;
            return !!(root.__vue_app__ || root.__vue__);
          } catch { return false; }
        })()
      );

      if (hasVue) return "Vue";

      // --- Angular ---
      const hasAngular = !!(
        document.querySelector("[ng-version]") ||
        window.getAllAngularRootElements ||
        window.ng
      );
      if (hasAngular) return "Angular";

      // --- Svelte / SvelteKit ---
      if (window.__sveltekit || document.querySelector("[data-sveltekit-hydrate]") ||
          document.querySelector("[data-svelte-h]")) {
        return "SvelteKit";
      }

      const hasSvelte = !!(
        (() => {
          try {
            const allEls = document.querySelectorAll("*");
            for (const el of allEls) {
              const keys = Object.keys(el);
              if (keys.some(k => k.startsWith("__svelte"))) return true;
            }
            return false;
          } catch { return false; }
        })()
      );
      if (hasSvelte) return "Svelte";

      // --- Solid ---
      if (window._$HY || window.Solid || document.querySelector("[data-hk]")) {
        return "Solid";
      }

      // --- Qwik ---
      if (document.querySelector("[q\\\\:container]") ||
          document.querySelector("[on\\\\:qvisible]") ||
          window.qwikevents) {
        return "Qwik";
      }

      // --- Astro ---
      if (document.querySelector("astro-island") ||
          document.querySelector("[data-astro-cid]") ||
          document.querySelector("script[data-astro-rerun]")) {
        return "Astro";
      }

      // --- htmx ---
      if (window.htmx || document.querySelector("[hx-get]") ||
          document.querySelector("[hx-post]") ||
          document.querySelector("[data-hx-get]")) {
        return "htmx";
      }

      // --- Alpine.js ---
      if (window.Alpine || document.querySelector("[x-data]") ||
          document.querySelector("[x-init]")) {
        return "Alpine";
      }

      return null;
    })()`,
    null,
    10_000,
  );

  return framework;
}

// ---------------------------------------------------------------------------
// waitForSPANavigation — Execute an action and wait for SPA navigation
// ---------------------------------------------------------------------------

export async function waitForSPANavigation(
  page: any,
  action: () => Promise<void>,
): Promise<string> {
  // Record current URL and set up mutation observer
  const urlBefore = page.url();

  // Install a DOM mutation watcher that resolves when significant changes happen
  await safeEvaluate<boolean>(
    page,
    `(() => {
      window.__inspectSPANavDone = false;
      window.__inspectSPANavMutations = 0;

      const observer = new MutationObserver((mutations) => {
        let significantChange = false;
        for (const mutation of mutations) {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1 && node.offsetHeight > 50) {
                significantChange = true;
                break;
              }
            }
          }
          if (significantChange) break;
        }
        if (significantChange) {
          window.__inspectSPANavMutations++;
          if (window.__inspectSPANavMutations >= 1) {
            window.__inspectSPANavDone = true;
            observer.disconnect();
          }
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });

      // Auto-disconnect after 10 seconds
      setTimeout(() => {
        observer.disconnect();
        window.__inspectSPANavDone = true;
      }, 10000);

      return true;
    })()`,
    false,
    5_000,
  );

  // Execute the action (e.g., a click)
  try {
    await action();
  } catch {
    // Action may throw if navigation occurs during it
  }

  // Wait for either URL change or significant DOM mutation
  const maxWait = Date.now() + 10_000;
  while (Date.now() < maxWait) {
    const currentUrl = page.url();
    if (currentUrl !== urlBefore) {
      return currentUrl;
    }

    const domChanged = await safeEvaluate<boolean>(
      page,
      `(() => {
        return !!window.__inspectSPANavDone;
      })()`,
      false,
      2_000,
    );

    if (domChanged) {
      // DOM changed but URL may be the same (e.g., hash-based or no URL change)
      return page.url();
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }

  // Timed out — return whatever the current URL is
  return page.url();
}

// ---------------------------------------------------------------------------
// testBackForward — Test browser back/forward navigation with SPA routing
// ---------------------------------------------------------------------------

export async function testBackForward(
  page: any,
  urls: string[],
): Promise<{ passed: boolean; issues: string[] }> {
  const issues: string[] = [];

  if (urls.length < 2) {
    return { passed: true, issues: [] };
  }

  // Step 1: Navigate to each URL in sequence to build history
  const visitedUrls: string[] = [];
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      // Wait for SPA hydration
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      const actualUrl = page.url();
      visitedUrls.push(actualUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push(`Failed to navigate to ${url}: ${message}`);
    }
  }

  if (visitedUrls.length < 2) {
    return {
      passed: issues.length === 0,
      issues: issues.length > 0 ? issues : ["Not enough pages loaded to test back/forward"],
    };
  }

  // Step 2: Press back button and verify we return to previous URLs
  for (let i = visitedUrls.length - 1; i > 0; i--) {
    const expectedUrl = visitedUrls[i - 1];
    try {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 });
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      const actualUrl = page.url();

      // Normalise for comparison (strip trailing slashes, ignore hash differences)
      const normExpected = normalizeForComparison(expectedUrl);
      const normActual = normalizeForComparison(actualUrl);

      if (normActual !== normExpected) {
        issues.push(
          `Back navigation from ${visitedUrls[i]}: expected ${expectedUrl}, got ${actualUrl}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push(`Back navigation failed at step ${i}: ${message}`);
    }
  }

  // Step 3: Press forward button and verify we go forward through history
  for (let i = 0; i < visitedUrls.length - 1; i++) {
    const expectedUrl = visitedUrls[i + 1];
    try {
      await page.goForward({ waitUntil: "domcontentloaded", timeout: 10_000 });
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      const actualUrl = page.url();

      const normExpected = normalizeForComparison(expectedUrl);
      const normActual = normalizeForComparison(actualUrl);

      if (normActual !== normExpected) {
        issues.push(
          `Forward navigation from ${visitedUrls[i]}: expected ${expectedUrl}, got ${actualUrl}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push(`Forward navigation failed at step ${i}: ${message}`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash (keep root /)
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    parsed.pathname = path;
    // Remove hash for comparison
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}
