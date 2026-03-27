/**
 * Simple telemetry wrapper — respects INSPECT_TELEMETRY=false.
 * In this implementation, telemetry is purely opt-in and does nothing
 * unless a telemetry endpoint is configured.
 */

export interface TelemetryEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}

const TELEMETRY_ENABLED = process.env.INSPECT_TELEMETRY !== "false";
const TELEMETRY_ENDPOINT = process.env.INSPECT_TELEMETRY_URL;

/**
 * Track a telemetry event (non-blocking, fire-and-forget).
 * Does nothing if telemetry is disabled or no endpoint is configured.
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!TELEMETRY_ENABLED || !TELEMETRY_ENDPOINT) return;

  const payload: TelemetryEvent = {
    event,
    properties: {
      ...properties,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cliVersion: "0.1.0",
    },
    timestamp: new Date().toISOString(),
  };

  // Fire and forget — never block the CLI
  fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    // Silently ignore telemetry failures
  });
}

/**
 * Check if telemetry is enabled.
 */
export function isTelemetryEnabled(): boolean {
  return TELEMETRY_ENABLED;
}

/**
 * Print telemetry status notice (for doctor command).
 */
export function getTelemetryStatus(): string {
  if (!TELEMETRY_ENABLED) return "Disabled (INSPECT_TELEMETRY=false)";
  if (!TELEMETRY_ENDPOINT) return "No endpoint configured (inactive)";
  return `Enabled → ${TELEMETRY_ENDPOINT}`;
}
