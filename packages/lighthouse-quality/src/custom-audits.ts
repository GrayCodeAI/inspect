type PageEvaluateFn<T> = () => Promise<T> | T;

export interface Page {
  evaluate: <T>(fn: PageEvaluateFn<T>) => Promise<T>;
}

export interface CustomAudit {
  id: string;
  title: string;
  description: string;
  gatherFn: (page: Page) => Promise<unknown>;
  auditFn: (artifact: unknown) => {
    score: number;
    displayValue?: string;
    details?: string;
  };
}

export interface CustomAuditResult {
  id: string;
  title: string;
  score: number;
  displayValue: string;
  details: string;
  timestamp: Date;
}

export class CustomAuditRunner {
  private audits: Map<string, CustomAudit> = new Map();

  register = (audit: CustomAudit): void => {
    this.audits.set(audit.id, audit);
  };

  unregister = (id: string): void => {
    this.audits.delete(id);
  };

  runAll = async (page: Page): Promise<CustomAuditResult[]> => {
    const results: CustomAuditResult[] = [];
    for (const audit of this.audits.values()) {
      const result = await this.run(audit.id, page);
      results.push(result);
    }
    return results;
  };

  run = async (id: string, page: Page): Promise<CustomAuditResult> => {
    const audit = this.audits.get(id);
    if (!audit) {
      throw new Error(`Custom audit not found: ${id}`);
    }
    const artifact = await audit.gatherFn(page);
    const auditResult = audit.auditFn(artifact);
    return {
      id: audit.id,
      title: audit.title,
      score: auditResult.score,
      displayValue: auditResult.displayValue ?? "",
      details: auditResult.details ?? "",
      timestamp: new Date(),
    };
  };

  list = (): CustomAudit[] => {
    return Array.from(this.audits.values());
  };
}

const gatherFormSubmissionLatency = async (page: Page): Promise<unknown> => {
  return await page.evaluate(async () => {
    const navigationEntries = performance.getEntriesByType(
      "navigation" as never,
    ) as unknown as Array<{
      domContentLoadedEventEnd: number;
      loadEventEnd: number;
      responseEnd: number;
    }>;
    const allEntries = performance.getEntries();
    const formEntries = allEntries.filter((entry) => {
      return entry.name.includes("submit") || entry.name.includes("form");
    });
    return {
      navigationEntries: navigationEntries.map((entry) => ({
        domContentLoadedEventEnd: entry.domContentLoadedEventEnd,
        loadEventEnd: entry.loadEventEnd,
        responseEnd: entry.responseEnd,
      })),
      formEntries: formEntries.map((entry) => ({
        name: entry.name,
        responseEnd: (entry as unknown as { responseEnd: number }).responseEnd,
        startTime: entry.startTime,
      })),
    };
  });
};

const auditFormSubmissionLatency = (
  artifact: unknown,
): {
  score: number;
  displayValue?: string;
  details?: string;
} => {
  const data = artifact as {
    navigationEntries: Array<{
      domContentLoadedEventEnd: number;
      loadEventEnd: number;
      responseEnd: number;
    }>;
    formEntries: Array<{ name: string; responseEnd: number; startTime: number }>;
  };
  const totalLatency = data.formEntries.reduce((sum, entry) => {
    return sum + (entry.responseEnd - entry.startTime);
  }, 0);
  const averageLatency = data.formEntries.length > 0 ? totalLatency / data.formEntries.length : 0;
  const score =
    averageLatency < 200 ? 1 : averageLatency < 500 ? 0.7 : averageLatency < 1000 ? 0.4 : 0;
  return {
    score,
    displayValue: `${Math.round(averageLatency)} ms`,
    details: `Average form submission latency: ${Math.round(averageLatency)} ms across ${data.formEntries.length} submissions`,
  };
};

export const formSubmissionLatencyAudit: CustomAudit = {
  id: "form-submission-latency",
  title: "Form Submission Latency",
  description: "Measures time from form submit to navigation/response",
  gatherFn: gatherFormSubmissionLatency,
  auditFn: auditFormSubmissionLatency,
};

const gatherAnimationSmoothness = async (page: Page): Promise<unknown> => {
  return await page.evaluate(async () => {
    const jankEvents: Array<{ timestamp: number; duration: number }> = [];
    let observerSupported = true;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === ("longtask" as never)) {
            jankEvents.push({
              timestamp: entry.startTime,
              duration: entry.duration,
            });
          }
        }
      });
      observer.observe({
        type: "longtask" as never,
        buffered: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      observer.disconnect();
    } catch {
      observerSupported = false;
    }
    return { jankEvents, observerSupported };
  });
};

const auditAnimationSmoothness = (
  artifact: unknown,
): {
  score: number;
  displayValue?: string;
  details?: string;
} => {
  const data = artifact as {
    jankEvents: Array<{ timestamp: number; duration: number }>;
    observerSupported: boolean;
  };
  if (!data.observerSupported) {
    return {
      score: 0,
      displayValue: "Not supported",
      details: "PerformanceObserver for longtask is not supported in this browser",
    };
  }
  const totalJank = data.jankEvents.length;
  const totalJankDuration = data.jankEvents.reduce((sum, event) => sum + event.duration, 0);
  const score =
    totalJank === 0 ? 1 : totalJank < 5 ? 0.8 : totalJank < 15 ? 0.5 : totalJank < 30 ? 0.3 : 0;
  return {
    score,
    displayValue: `${totalJank} jank events`,
    details: `Detected ${totalJank} long tasks totaling ${Math.round(totalJankDuration)} ms`,
  };
};

export const animationSmoothnessAudit: CustomAudit = {
  id: "animation-smoothness",
  title: "Animation Smoothness",
  description: "Detects jank during page interactions via PerformanceObserver",
  gatherFn: gatherAnimationSmoothness,
  auditFn: auditAnimationSmoothness,
};

const gatherMemoryLeakDetection = async (page: Page): Promise<unknown> => {
  const beforeMemory = await page.evaluate(async () => {
    const perf = performance as { memory?: { usedJSHeapSize: number } };
    return perf.memory?.usedJSHeapSize ?? 0;
  });
  await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });
  const afterMemory = await page.evaluate(async () => {
    const perf = performance as { memory?: { usedJSHeapSize: number } };
    return perf.memory?.usedJSHeapSize ?? 0;
  });
  return { beforeMemory, afterMemory };
};

const auditMemoryLeakDetection = (
  artifact: unknown,
): {
  score: number;
  displayValue?: string;
  details?: string;
} => {
  const data = artifact as { beforeMemory: number; afterMemory: number };
  if (data.beforeMemory === 0 || data.afterMemory === 0) {
    return {
      score: 0,
      displayValue: "Not available",
      details: "Heap size measurement is not available in this browser",
    };
  }
  const memoryDelta = data.afterMemory - data.beforeMemory;
  const memoryDeltaPercent = (memoryDelta / data.beforeMemory) * 100;
  const score =
    memoryDeltaPercent < 5 ? 1 : memoryDeltaPercent < 15 ? 0.7 : memoryDeltaPercent < 30 ? 0.4 : 0;
  return {
    score,
    displayValue: `${Math.round(memoryDelta / 1024 / 1024)} MB change`,
    details: `Heap size changed from ${Math.round(data.beforeMemory / 1024 / 1024)} MB to ${Math.round(data.afterMemory / 1024 / 1024)} MB (${memoryDeltaPercent.toFixed(1)}% change)`,
  };
};

export const memoryLeakDetectionAudit: CustomAudit = {
  id: "memory-leak-detection",
  title: "Memory Leak Detection",
  description: "Compares heap size before/after page interaction",
  gatherFn: gatherMemoryLeakDetection,
  auditFn: auditMemoryLeakDetection,
};

export const BUILTIN_CUSTOM_AUDITS: CustomAudit[] = [
  formSubmissionLatencyAudit,
  animationSmoothnessAudit,
  memoryLeakDetectionAudit,
];
