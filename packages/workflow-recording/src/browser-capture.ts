import type { Page, Frame, Dialog } from "playwright";
import type {
  WorkflowEvent,
  ClickEvent,
  TypeEvent,
  NavigateEvent,
  ScrollEvent,
  HoverEvent,
  KeypressEvent,
  SelectEvent,
} from "./types.js";

interface CaptureSession {
  page: Page;
  pendingEvents: WorkflowEvent[];
  pollingInterval: ReturnType<typeof setInterval>;
  removeListeners: () => void;
}

const EVENT_INJECTION_SCRIPT = `
(() => {
  if (window.__workflowCaptureActive) return;
  window.__workflowCaptureActive = true;

  const workflowEvents = [];

  function generateId() {
    return 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  function getCurrentUrl() {
    return window.location.href;
  }

  function getCurrentTitle() {
    return document.title;
  }

  function getSelector(element) {
    if (element.id) return '#' + element.id;
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\\s+/).slice(0, 3).join('.');
      if (classes) return element.tagName.toLowerCase() + '.' + classes;
    }
    return element.tagName.toLowerCase();
  }

  function isPasswordField(element) {
    return element.tagName === 'INPUT' && element.type === 'password';
  }

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !target.tagName) return;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(target.tagName)) return;
    if (target.closest('.rr-block, .rr-ignore')) return;

    const rect = target.getBoundingClientRect();
    const event = {
      id: generateId(),
      type: 'click',
      timestamp: Date.now(),
      url: getCurrentUrl(),
      title: getCurrentTitle(),
      selector: getSelector(target),
      text: target.textContent?.trim().slice(0, 100) || undefined,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
    workflowEvents.push(event);
  }, true);

  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!target || !target.tagName) return;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT') return;
    if (target.closest('.rr-block, .rr-ignore')) return;

    if (target.tagName === 'SELECT') {
      const event = {
        id: generateId(),
        type: 'select',
        timestamp: Date.now(),
        url: getCurrentUrl(),
        title: getCurrentTitle(),
        selector: getSelector(target),
        value: target.value,
        text: target.options[target.selectedIndex]?.text || '',
      };
      workflowEvents.push(event);
    } else {
      const event = {
        id: generateId(),
        type: 'type',
        timestamp: Date.now(),
        url: getCurrentUrl(),
        title: getCurrentTitle(),
        selector: getSelector(target),
        value: target.value,
        isPassword: isPasswordField(target),
      };
      workflowEvents.push(event);
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return;

    const event = {
      id: generateId(),
      type: 'keypress',
      timestamp: Date.now(),
      url: getCurrentUrl(),
      title: getCurrentTitle(),
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    };
    workflowEvents.push(event);
  }, true);

  document.addEventListener('scroll', () => {
    const event = {
      id: generateId(),
      type: 'scroll',
      timestamp: Date.now(),
      url: getCurrentUrl(),
      title: getCurrentTitle(),
      x: window.scrollX,
      y: window.scrollY,
    };
    workflowEvents.push(event);
  }, true);

  document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (!target || !target.tagName) return;
    if (target.closest('.rr-block, .rr-ignore')) return;

    const event = {
      id: generateId(),
      type: 'hover',
      timestamp: Date.now(),
      url: getCurrentUrl(),
      title: getCurrentTitle(),
      selector: getSelector(target),
    };
    workflowEvents.push(event);
  }, true);

  window.__workflowGetEvents = () => {
    const events = [...workflowEvents];
    workflowEvents.length = 0;
    return events;
  };
})();
`;

export class WorkflowBrowserCapture {
  private sessions = new Map<string, CaptureSession>();

  isCapturing(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async startCapture(page: Page, sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} is already being captured`);
    }

    const pendingEvents: WorkflowEvent[] = [];

    const onFrameNavigated = (frame: Frame) => {
      if (frame === page.mainFrame()) {
        const navigateEvent: NavigateEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: "navigate",
          timestamp: Date.now(),
          url: frame.url(),
          title: "",
          targetUrl: frame.url(),
        };
        pendingEvents.push(navigateEvent);
      }
    };

    const onDialog = (dialog: Dialog) => {
      const waitEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "wait" as const,
        timestamp: Date.now(),
        url: page.url(),
        title: "",
        durationMs: 0,
        condition: `dialog:${dialog.type()}:${dialog.message()}`,
      };
      pendingEvents.push(waitEvent);
    };

    page.on("framenavigated", onFrameNavigated);
    page.on("dialog", onDialog);

    await page.evaluate(EVENT_INJECTION_SCRIPT);

    const pollingInterval = setInterval(async () => {
      try {
        const events = await page.evaluate(
          () => (window as { __workflowGetEvents?: () => unknown[] }).__workflowGetEvents?.() ?? [],
        );
        const session = this.sessions.get(sessionId);
        if (session) {
          for (const rawEvent of events) {
            const event = this.convertRawEvent(rawEvent);
            if (event) {
              session.pendingEvents.push(event);
            }
          }
        }
      } catch {
        // Page may have been closed
      }
    }, 500);

    const removeListeners = () => {
      page.off("framenavigated", onFrameNavigated);
      page.off("dialog", onDialog);
    };

    this.sessions.set(sessionId, {
      page,
      pendingEvents,
      pollingInterval,
      removeListeners,
    });
  }

  async stopCapture(sessionId: string): Promise<WorkflowEvent[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No active capture session for ${sessionId}`);
    }

    clearInterval(session.pollingInterval);
    session.removeListeners();

    try {
      const remainingEvents = await session.page.evaluate(
        () => (window as { __workflowGetEvents?: () => unknown[] }).__workflowGetEvents?.() ?? [],
      );
      for (const rawEvent of remainingEvents) {
        const event = this.convertRawEvent(rawEvent);
        if (event) {
          session.pendingEvents.push(event);
        }
      }
    } catch {
      // Page may have been closed
    }

    this.sessions.delete(sessionId);

    return session.pendingEvents;
  }

  private convertRawEvent(raw: unknown): WorkflowEvent | null {
    if (!raw || typeof raw !== "object") return null;

    const event = raw as Record<string, unknown>;
    const eventType = event.type as string;

    switch (eventType) {
      case "click":
        return {
          id: String(event.id),
          type: "click",
          timestamp: Number(event.timestamp),
          url: String(event.url),
          title: String(event.title),
          selector: String(event.selector),
          text: event.text ? String(event.text) : undefined,
          x: Number(event.x),
          y: Number(event.y),
        } as ClickEvent;

      case "type":
        return {
          id: String(event.id),
          type: "type",
          timestamp: Number(event.timestamp),
          url: String(event.url),
          title: String(event.title),
          selector: String(event.selector),
          value: String(event.value),
          isPassword: Boolean(event.isPassword),
        } as TypeEvent;

      case "select":
        return {
          id: String(event.id),
          type: "select",
          timestamp: Number(event.timestamp),
          url: String(event.url),
          title: String(event.title),
          selector: String(event.selector),
          value: String(event.value),
          text: String(event.text),
        } as SelectEvent;

      case "scroll":
        return {
          id: String(event.id),
          type: "scroll",
          timestamp: Number(event.timestamp),
          url: String(event.url),
          title: String(event.title),
          x: Number(event.x),
          y: Number(event.y),
        } as ScrollEvent;

      case "hover":
        return {
          id: String(event.id),
          type: "hover",
          timestamp: Number(event.timestamp),
          url: String(event.url),
          title: String(event.title),
          selector: String(event.selector),
        } as HoverEvent;

      case "keypress":
        return {
          id: String(event.id),
          type: "keypress",
          timestamp: Number(event.timestamp),
          url: String(event.url),
          title: String(event.title),
          key: String(event.key),
          code: String(event.code),
          ctrlKey: Boolean(event.ctrlKey),
          shiftKey: Boolean(event.shiftKey),
          altKey: Boolean(event.altKey),
          metaKey: Boolean(event.metaKey),
        } as KeypressEvent;

      case "navigate":
        return {
          id: String(event.id),
          type: "navigate",
          timestamp: Number(event.timestamp),
          url: String(event.url),
          title: String(event.title),
          targetUrl: String(event.targetUrl),
        };

      default:
        return null;
    }
  }
}
