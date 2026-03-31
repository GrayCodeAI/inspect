// ============================================================================
// k6 Load Test — Inspect API Server
// ============================================================================
//
// Usage:
//   k6 run tests/load/api-load-test.js
//   k6 run --vus 50 --duration 2m tests/load/api-load-test.js
//   k6 run --vus 10 --duration 30s --stage 30s:50 --stage 1m:100 tests/load/api-load-test.js
//

/* global __ENV */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Configuration ───────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:4100";

export const options = {
  stages: [
    { duration: "10s", target: 10 }, // Ramp up to 10 users
    { duration: "30s", target: 50 }, // Ramp up to 50 users
    { duration: "1m", target: 50 }, // Hold at 50 users
    { duration: "10s", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<5000"], // 95% < 2s, 99% < 5s
    http_req_failed: ["rate<0.05"], // < 5% failure rate
    health_check: ["p(99)<500"], // Health check < 500ms
  },
};

// ── Custom Metrics ──────────────────────────────────────────────────────────

const _errorRate = new Rate("http_req_failed");
const healthDuration = new Trend("health_check", true);
const taskCreateDuration = new Trend("task_create", true);
const taskGetDuration = new Trend("task_get", true);

// ── Helpers ─────────────────────────────────────────────────────────────────

function headers() {
  return {
    "Content-Type": "application/json",
    // Add JWT token if auth is enabled:
    // "Authorization": `Bearer ${__ENV.API_TOKEN}`,
  };
}

// ── Scenarios ───────────────────────────────────────────────────────────────

export function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);
  healthDuration.add(res.timings.duration);

  check(res, {
    "health status 200": (r) => r.status === 200,
    "health is healthy": (r) => {
      try {
        return JSON.parse(r.body).status === "healthy";
      } catch {
        return false;
      }
    },
  });
}

export function versionCheck() {
  const res = http.get(`${BASE_URL}/api/version`);
  check(res, { "version status 200": (r) => r.status === 200 });
}

export function listDevices() {
  const res = http.get(`${BASE_URL}/api/devices`);
  check(res, {
    "devices status 200": (r) => r.status === 200,
    "devices has list": (r) => {
      try {
        return JSON.parse(r.body).total > 0;
      } catch {
        return false;
      }
    },
  });
}

export function listModels() {
  const res = http.get(`${BASE_URL}/api/models`);
  check(res, { "models status 200": (r) => r.status === 200 });
}

export function createTask() {
  const payload = JSON.stringify({
    prompt: "Verify the page loads correctly",
    url: "https://example.com",
    maxSteps: 5,
    maxIterations: 3,
  });

  const res = http.post(`${BASE_URL}/api/tasks`, payload, { headers: headers() });
  taskCreateDuration.add(res.timings.duration);

  check(res, {
    "task create status 201": (r) => r.status === 201,
    "task has id": (r) => {
      try {
        return !!JSON.parse(r.body).id;
      } catch {
        return false;
      }
    },
  });

  // Follow up with GET
  if (res.status === 201) {
    try {
      const taskId = JSON.parse(res.body).id;
      sleep(0.1);
      const getRes = http.get(`${BASE_URL}/api/tasks/${taskId}`);
      taskGetDuration.add(getRes.timings.duration);
      check(getRes, { "task get status 200": (r) => r.status === 200 });
    } catch {
      /* intentionally empty */
    }
  }
}

export function listWorkflows() {
  const res = http.get(`${BASE_URL}/api/workflows`);
  check(res, { "workflows status 200": (r) => r.status === 200 });
}

export function createWorkflow() {
  const payload = JSON.stringify({
    name: `Load Test Workflow ${Date.now()}`,
    status: "draft",
    tags: ["load-test"],
  });

  const res = http.post(`${BASE_URL}/api/workflows`, payload, { headers: headers() });
  check(res, { "workflow create status 201": (r) => r.status === 201 });
}

export function dashboardSnapshot() {
  const res = http.get(`${BASE_URL}/api/dashboard`);
  check(res, { "dashboard status 200": (r) => r.status === 200 });
}

export function getMetrics() {
  const res = http.get(`${BASE_URL}/api/metrics`);
  check(res, {
    "metrics status 200": (r) => r.status === 200,
    "metrics is text": (r) => r.headers["Content-Type"]?.includes("text/plain"),
  });
}

export function getDocs() {
  const res = http.get(`${BASE_URL}/api/docs`);
  check(res, {
    "docs status 200": (r) => r.status === 200,
    "docs has openapi": (r) => {
      try {
        return JSON.parse(r.body).openapi === "3.1.0";
      } catch {
        return false;
      }
    },
  });
}

// ── Main Test Function ──────────────────────────────────────────────────────

export default function () {
  // Weighted scenario distribution
  const rand = Math.random();

  if (rand < 0.25) {
    healthCheck();
  } else if (rand < 0.35) {
    versionCheck();
  } else if (rand < 0.45) {
    listDevices();
  } else if (rand < 0.5) {
    listModels();
  } else if (rand < 0.65) {
    createTask();
  } else if (rand < 0.75) {
    listWorkflows();
  } else if (rand < 0.8) {
    createWorkflow();
  } else if (rand < 0.9) {
    dashboardSnapshot();
  } else if (rand < 0.95) {
    getMetrics();
  } else {
    getDocs();
  }

  sleep(Math.random() * 0.5 + 0.1); // 100-600ms think time
}
