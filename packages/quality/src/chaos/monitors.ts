// ============================================================================
// @inspect/quality - Chaos Test Monitors
// ============================================================================

/**
 * FPS monitoring script to inject into the page.
 * Uses requestAnimationFrame to measure frame rate.
 */
export const FPS_MONITOR_SCRIPT = `
(function() {
  if (window.__inspectFPSMonitor) return;
  window.__inspectFPSMonitor = {
    frames: 0,
    lastTime: performance.now(),
    fps: 60,
    drops: [],
    history: [],
    running: true
  };

  var monitor = window.__inspectFPSMonitor;

  function measure(now) {
    if (!monitor.running) return;
    monitor.frames++;

    var elapsed = now - monitor.lastTime;
    if (elapsed >= 1000) {
      monitor.fps = Math.round((monitor.frames * 1000) / elapsed);
      monitor.history.push({ fps: monitor.fps, timestamp: Date.now() });

      // Keep last 300 entries (5 min at 1/sec)
      if (monitor.history.length > 300) monitor.history.shift();

      // Detect FPS drops below 30
      if (monitor.fps < 30) {
        monitor.drops.push({
          fps: monitor.fps,
          timestamp: Date.now(),
          duration: elapsed
        });
      }

      monitor.frames = 0;
      monitor.lastTime = now;
    }

    requestAnimationFrame(measure);
  }

  requestAnimationFrame(measure);
})()
`;

/**
 * Script to stop FPS monitoring and retrieve results.
 */
export const FPS_MONITOR_STOP_SCRIPT = `
(function() {
  if (!window.__inspectFPSMonitor) return { drops: [], history: [] };
  window.__inspectFPSMonitor.running = false;
  return {
    drops: window.__inspectFPSMonitor.drops,
    history: window.__inspectFPSMonitor.history,
    currentFps: window.__inspectFPSMonitor.fps
  };
})()
`;

/**
 * Error monitoring script to inject into the page.
 * Captures console.error, window.onerror, and unhandledrejection.
 */
export const ERROR_MONITOR_SCRIPT = `
(function() {
  if (window.__inspectErrorMonitor) return;
  window.__inspectErrorMonitor = {
    errors: [],
    consoleErrors: [],
    unhandledRejections: [],
    pageCrashed: false
  };

  var monitor = window.__inspectErrorMonitor;

  // Override console.error
  var origError = console.error;
  console.error = function() {
    var args = Array.from(arguments).map(function(a) {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
      catch(e) { return String(a); }
    });
    monitor.consoleErrors.push(args.join(' '));
    origError.apply(console, arguments);
  };

  // Window error handler
  window.addEventListener('error', function(event) {
    monitor.errors.push({
      message: event.message || 'Unknown error',
      stack: event.error ? event.error.stack : undefined,
      timestamp: Date.now(),
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var message = 'Unhandled rejection';
    if (reason instanceof Error) {
      message = reason.message;
    } else if (typeof reason === 'string') {
      message = reason;
    } else {
      try { message = JSON.stringify(reason); } catch(e) {}
    }
    monitor.unhandledRejections.push(message);
  });
})()
`;

/**
 * Script to retrieve error monitoring results.
 */
export const ERROR_MONITOR_RESULTS_SCRIPT = `
(function() {
  if (!window.__inspectErrorMonitor) {
    return { errors: [], consoleErrors: [], unhandledRejections: [], pageCrashed: false };
  }
  return {
    errors: window.__inspectErrorMonitor.errors,
    consoleErrors: window.__inspectErrorMonitor.consoleErrors,
    unhandledRejections: window.__inspectErrorMonitor.unhandledRejections,
    pageCrashed: window.__inspectErrorMonitor.pageCrashed
  };
})()
`;

/**
 * Alert monitoring script to inject into the page.
 * Intercepts alert, confirm, and prompt dialogs.
 */
export const ALERT_MONITOR_SCRIPT = `
(function() {
  if (window.__inspectAlertMonitor) return;
  window.__inspectAlertMonitor = {
    alerts: [],
    confirms: [],
    prompts: []
  };

  var monitor = window.__inspectAlertMonitor;

  // Override window.alert
  var origAlert = window.alert;
  window.alert = function(message) {
    monitor.alerts.push({ message: String(message), timestamp: Date.now() });
    // Do NOT call origAlert to prevent blocking
  };

  // Override window.confirm
  var origConfirm = window.confirm;
  window.confirm = function(message) {
    monitor.confirms.push({ message: String(message), timestamp: Date.now() });
    return Math.random() < 0.5; // Random response
  };

  // Override window.prompt
  var origPrompt = window.prompt;
  window.prompt = function(message, defaultValue) {
    monitor.prompts.push({ message: String(message), defaultValue: defaultValue, timestamp: Date.now() });
    return Math.random() < 0.5 ? 'gremlin_input' : null;
  };
})()
`;

/**
 * Script to retrieve alert monitoring results.
 */
export const ALERT_MONITOR_RESULTS_SCRIPT = `
(function() {
  if (!window.__inspectAlertMonitor) return { alerts: [], confirms: [], prompts: [] };
  return window.__inspectAlertMonitor;
})()
`;

/** FPS monitoring result interface */
export interface FPSMonitorResult {
  drops: Array<{ fps: number; timestamp: number; duration: number }>;
  history: Array<{ fps: number; timestamp: number }>;
  currentFps?: number;
}

/** Error monitoring result interface */
export interface ErrorMonitorResult {
  errors: Array<{ message: string; stack?: string; timestamp: number; filename?: string; lineno?: number; colno?: number }>;
  consoleErrors: string[];
  unhandledRejections: string[];
  pageCrashed: boolean;
}

/** Alert monitoring result interface */
export interface AlertMonitorResult {
  alerts: Array<{ message: string; timestamp: number }>;
  confirms: Array<{ message: string; timestamp: number }>;
  prompts: Array<{ message: string; defaultValue?: string; timestamp: number }>;
}
