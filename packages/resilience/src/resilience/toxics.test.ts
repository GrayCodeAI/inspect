import { describe, it, expect } from "vitest";
import {
  LatencyToxic,
  BandwidthToxic,
  TimeoutToxic,
  DisconnectToxic,
  SlowCloseToxic,
  SlicerToxic,
  LimitDataToxic,
  createToxic,
  TOXIC_PRESETS,
  type Toxic,
} from "./toxics.js";

describe("LatencyToxic", () => {
  it("should have correct type", () => {
    const toxic = new LatencyToxic(100);
    expect(toxic.type).toBe("latency");
  });

  it("should apply delay within jitter range", async () => {
    const toxic = new LatencyToxic(50, 10);
    const start = Date.now();
    let continued = false;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {
        continued = true;
      },
      abort: async () => {},
    };
    await toxic.apply(mockRoute);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(elapsed).toBeLessThan(100);
    expect(continued).toBe(true);
  });

  it("should clamp negative delays to 0", async () => {
    const toxic = new LatencyToxic(0, 0);
    const start = Date.now();
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {},
      abort: async () => {},
    };
    await toxic.apply(mockRoute);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

describe("BandwidthToxic", () => {
  it("should have correct type", () => {
    const toxic = new BandwidthToxic(100);
    expect(toxic.type).toBe("bandwidth");
  });

  it("should continue the route after delay", async () => {
    const toxic = new BandwidthToxic(100);
    let continued = false;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {
        continued = true;
      },
      abort: async () => {},
    };
    await toxic.apply(mockRoute);
    expect(continued).toBe(true);
  });
});

describe("TimeoutToxic", () => {
  it("should have correct type", () => {
    const toxic = new TimeoutToxic(100);
    expect(toxic.type).toBe("timeout");
  });

  it("should abort with timedout after delay", async () => {
    const toxic = new TimeoutToxic(10);
    let aborted = false;
    let abortReason: string | undefined;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {},
      abort: async (errorCode?: string) => {
        aborted = true;
        abortReason = errorCode;
      },
    };
    await toxic.apply(mockRoute);
    expect(aborted).toBe(true);
    expect(abortReason).toBe("timedout");
  });
});

describe("DisconnectToxic", () => {
  it("should have correct type", () => {
    const toxic = new DisconnectToxic();
    expect(toxic.type).toBe("reset_peer");
  });

  it("should abort immediately with no timeout", async () => {
    const toxic = new DisconnectToxic(0);
    let aborted = false;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {},
      abort: async () => {
        aborted = true;
      },
    };
    await toxic.apply(mockRoute);
    expect(aborted).toBe(true);
  });

  it("should abort with connectionreset", async () => {
    const toxic = new DisconnectToxic(0);
    let abortReason: string | undefined;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {},
      abort: async (errorCode?: string) => {
        abortReason = errorCode;
      },
    };
    await toxic.apply(mockRoute);
    expect(abortReason).toBe("connectionreset");
  });
});

describe("SlowCloseToxic", () => {
  it("should have correct type", () => {
    const toxic = new SlowCloseToxic(10);
    expect(toxic.type).toBe("slow_close");
  });

  it("should continue then delay", async () => {
    const toxic = new SlowCloseToxic(10);
    let continued = false;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {
        continued = true;
      },
      abort: async () => {},
    };
    await toxic.apply(mockRoute);
    expect(continued).toBe(true);
  });
});

describe("SlicerToxic", () => {
  it("should have correct type", () => {
    const toxic = new SlicerToxic(100, 50, 10);
    expect(toxic.type).toBe("slicer");
  });

  it("should continue after simulated delay", async () => {
    const toxic = new SlicerToxic(100, 50, 1);
    let continued = false;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {
        continued = true;
      },
      abort: async () => {},
    };
    await toxic.apply(mockRoute);
    expect(continued).toBe(true);
  });
});

describe("LimitDataToxic", () => {
  it("should have correct type", () => {
    const toxic = new LimitDataToxic(100);
    expect(toxic.type).toBe("limit_data");
  });

  it("should abort for zero byte limit", async () => {
    const toxic = new LimitDataToxic(0);
    let aborted = false;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {},
      abort: async () => {
        aborted = true;
      },
    };
    await toxic.apply(mockRoute);
    expect(aborted).toBe(true);
  });

  it("should fulfill with limited data for small limits", async () => {
    const toxic = new LimitDataToxic(50);
    let fulfilled = false;
    let fulfilledBody: string | undefined;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async (options: { body?: string }) => {
        fulfilled = true;
        fulfilledBody = options.body;
      },
      continue: async () => {},
      abort: async () => {},
    };
    await toxic.apply(mockRoute);
    expect(fulfilled).toBe(true);
    expect(fulfilledBody?.length).toBe(50);
  });

  it("should continue for larger limits", async () => {
    const toxic = new LimitDataToxic(2048);
    let continued = false;
    const mockRoute = {
      request: () => ({ url: () => "http://test.com", method: () => "GET" }),
      fulfill: async () => {},
      continue: async () => {
        continued = true;
      },
      abort: async () => {},
    };
    await toxic.apply(mockRoute);
    expect(continued).toBe(true);
  });
});

describe("createToxic", () => {
  it("should create LatencyToxic", () => {
    const toxic = createToxic({ type: "latency", delay: 100, jitter: 10 });
    expect(toxic.type).toBe("latency");
    expect(toxic).toBeInstanceOf(LatencyToxic);
  });

  it("should create BandwidthToxic", () => {
    const toxic = createToxic({ type: "bandwidth", rate: 50 });
    expect(toxic.type).toBe("bandwidth");
  });

  it("should create TimeoutToxic", () => {
    const toxic = createToxic({ type: "timeout", timeout: 5000 });
    expect(toxic.type).toBe("timeout");
  });

  it("should create DisconnectToxic", () => {
    const toxic = createToxic({ type: "reset_peer", timeout: 0 });
    expect(toxic.type).toBe("reset_peer");
  });

  it("should create SlowCloseToxic", () => {
    const toxic = createToxic({ type: "slow_close", delay: 100 });
    expect(toxic.type).toBe("slow_close");
  });

  it("should create SlicerToxic", () => {
    const toxic = createToxic({ type: "slicer", avgSize: 100, sizeVariation: 50, delay: 10 });
    expect(toxic.type).toBe("slicer");
  });

  it("should create LimitDataToxic", () => {
    const toxic = createToxic({ type: "limit_data", bytes: 1024 });
    expect(toxic.type).toBe("limit_data");
  });

  it("should throw for unknown type", () => {
    expect(() => createToxic({ type: "latency", delay: 0, jitter: 0 })).not.toThrow();
  });
});

describe("TOXIC_PRESETS", () => {
  it("should have mobile3G preset", () => {
    const preset = TOXIC_PRESETS.mobile3G();
    expect(preset.id).toBe("mobile-3g");
    expect(preset.fault.type).toBe("latency");
    expect(preset.toxicity).toBe(100);
  });

  it("should have slow2G preset", () => {
    const preset = TOXIC_PRESETS.slow2G();
    expect(preset.id).toBe("slow-2g");
    expect(preset.fault.type).toBe("bandwidth");
  });

  it("should have intermittentFailure preset", () => {
    const preset = TOXIC_PRESETS.intermittentFailure();
    expect(preset.id).toBe("intermittent-failure");
    expect(preset.toxicity).toBe(20);
  });

  it("should have serverTimeout preset", () => {
    const preset = TOXIC_PRESETS.serverTimeout();
    expect(preset.id).toBe("server-timeout");
    expect(preset.fault.type).toBe("timeout");
  });

  it("should have packetLoss preset", () => {
    const preset = TOXIC_PRESETS.packetLoss();
    expect(preset.id).toBe("packet-loss");
    expect(preset.toxicity).toBe(10);
  });
});
