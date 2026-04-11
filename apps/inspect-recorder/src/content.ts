// ──────────────────────────────────────────────────────────────────────────────
// Inspect Recorder — Content Script
// Injected into all pages to capture user interactions
// ──────────────────────────────────────────────────────────────────────────────

let contentRecording = false;

/** Generate CSS selector for an element */
function getSelector(element: Element): string {
  if (element.id) return `#${element.id}`;
  if (element.tagName === "BODY") return "body";

  // Try class-based selector
  if (element.className && typeof element.className === "string") {
    const classes = element.className.trim().split(/\s+/).slice(0, 2).join(".");
    if (classes) return `${element.tagName.toLowerCase()}.${classes}`;
  }

  // Fall back to tag + parent context
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(
      (s) => s.tagName === element.tagName,
    );
    const index = siblings.indexOf(element);
    const parentSelector = getSelector(parent);
    if (siblings.length === 1) {
      return `${parentSelector} > ${element.tagName.toLowerCase()}`;
    }
    return `${parentSelector} > ${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
  }

  return element.tagName.toLowerCase();
}

/** Send event to background script */
function sendEvent(event: {
  type: string;
  timestamp: number;
  url: string;
  selector?: string;
  text?: string;
  value?: string;
}): void {
  chrome.runtime.sendMessage({ action: "addEvent", event });
}

/** Listen for recording state changes */
chrome.runtime.onMessage.addListener(
  (message: { action: string; state?: { contentRecording: boolean } }) => {
    if (message.action === "updateRecordingState" && message.state) {
      contentRecording = message.state.contentRecording;
      if (contentRecording) {
        setupListeners();
      } else {
        removeListeners();
      }
    }
  },
);

/** Set up event listeners for capturing interactions */
function setupListeners(): void {
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("change", handleChange, true);
  document.addEventListener("submit", handleSubmit, true);
  window.addEventListener("scroll", handleScroll, { passive: true });

  // Observe navigation via popstate and hashchange
  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("hashchange", handleNavigation);

  // Intercept pushState/replaceState for SPA navigation
  patchHistoryAPI();
}

/** Remove event listeners */
function removeListeners(): void {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
  document.removeEventListener("change", handleChange, true);
  document.removeEventListener("submit", handleSubmit, true);
  window.removeEventListener("scroll", handleScroll);
  window.removeEventListener("popstate", handleNavigation);
  window.removeEventListener("hashchange", handleNavigation);
}

function handleClick(event: MouseEvent): void {
  if (!contentRecording) return;
  const target = event.target as Element | null;
  if (!target) return;

  sendEvent({
    type: "click",
    timestamp: Date.now(),
    url: window.location.href,
    selector: getSelector(target),
  });
}

function handleInput(event: Event): void {
  if (!contentRecording) return;
  const target = event.target as HTMLInputElement | null;
  if (!target) return;

  // Only record for meaningful input elements
  const tag = target.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea" && tag !== "select") return;

  sendEvent({
    type: "type",
    timestamp: Date.now(),
    url: window.location.href,
    selector: getSelector(target),
    text: target.value,
  });
}

function handleChange(event: Event): void {
  if (!contentRecording) return;
  const target = event.target as HTMLSelectElement | null;
  if (!target || target.tagName.toLowerCase() !== "select") return;

  sendEvent({
    type: "select",
    timestamp: Date.now(),
    url: window.location.href,
    selector: getSelector(target),
    value: target.value,
  });
}

function handleSubmit(event: Event): void {
  if (!contentRecording) return;
  const target = event.target as HTMLFormElement | null;
  if (!target) return;

  sendEvent({
    type: "submit",
    timestamp: Date.now(),
    url: window.location.href,
    selector: target.id ? `#${target.id}` : "form",
  });
}

let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
function handleScroll(): void {
  if (!contentRecording) return;
  // Debounce scroll events
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    sendEvent({
      type: "scroll",
      timestamp: Date.now(),
      url: window.location.href,
    });
  }, 500);
}

function handleNavigation(): void {
  if (!contentRecording) return;
  sendEvent({
    type: "navigation",
    timestamp: Date.now(),
    url: window.location.href,
  });
}

/** Patch History API to detect SPA navigation */
function patchHistoryAPI(): void {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    if (contentRecording) {
      sendEvent({
        type: "navigation",
        timestamp: Date.now(),
        url: window.location.href,
      });
    }
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    if (contentRecording) {
      sendEvent({
        type: "navigation",
        timestamp: Date.now(),
        url: window.location.href,
      });
    }
  };
}

// Check initial recording state
chrome.runtime.sendMessage({ action: "getState" }, (response) => {
  if (response?.contentRecording) {
    contentRecording = true;
    setupListeners();
  }
});
