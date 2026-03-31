// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/registry.ts - Service Registry for Microservice Architecture
// ──────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@inspect/core";

const logger = createLogger("services/registry");

/** Service health status */
export type ServiceHealth = "healthy" | "degraded" | "unhealthy" | "unknown";

/** Service definition */
export interface ServiceDefinition {
  name: string;
  version: string;
  description: string;
  endpoint: string;
  health: ServiceHealth;
  capabilities: string[];
  dependencies: string[];
  metadata: Record<string, unknown>;
  registeredAt: number;
  lastHealthCheck?: number;
}

/** Service event types */
export type ServiceEventType =
  | "service.registered"
  | "service.deregistered"
  | "service.health.changed"
  | "service.request"
  | "service.response"
  | "service.error";

/** Service event */
export interface ServiceEvent {
  type: ServiceEventType;
  service: string;
  data: unknown;
  timestamp: number;
  correlationId?: string;
}

/** Health check result */
export interface HealthCheckResult {
  service: string;
  status: ServiceHealth;
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

/** Message bus handler */
export type MessageHandler = (event: ServiceEvent) => void | Promise<void>;

/**
 * Central service registry for the microservice architecture.
 * Manages service discovery, health monitoring, and inter-service communication.
 */
export class ServiceRegistry {
  private services: Map<string, ServiceDefinition> = new Map();
  private handlers: Map<ServiceEventType, MessageHandler[]> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Register a service.
   */
  register(service: Omit<ServiceDefinition, "registeredAt">): ServiceDefinition {
    const full: ServiceDefinition = {
      ...service,
      registeredAt: Date.now(),
    };
    this.services.set(service.name, full);
    this.emit({
      type: "service.registered",
      service: service.name,
      data: full,
      timestamp: Date.now(),
    });
    return full;
  }

  /**
   * Deregister a service.
   */
  deregister(name: string): boolean {
    const service = this.services.get(name);
    if (!service) return false;
    this.services.delete(name);
    this.emit({
      type: "service.deregistered",
      service: name,
      data: null,
      timestamp: Date.now(),
    });
    return true;
  }

  /**
   * Get a service by name.
   */
  get(name: string): ServiceDefinition | undefined {
    return this.services.get(name);
  }

  /**
   * List all services.
   */
  list(): ServiceDefinition[] {
    return Array.from(this.services.values());
  }

  /**
   * Find services by capability.
   */
  findByCapability(capability: string): ServiceDefinition[] {
    return this.list().filter((s) => s.capabilities.includes(capability));
  }

  /**
   * Find healthy services.
   */
  findHealthy(): ServiceDefinition[] {
    return this.list().filter((s) => s.health === "healthy");
  }

  /**
   * Update service health.
   */
  updateHealth(name: string, health: ServiceHealth): void {
    const service = this.services.get(name);
    if (!service) return;
    const oldHealth = service.health;
    service.health = health;
    service.lastHealthCheck = Date.now();
    if (oldHealth !== health) {
      this.emit({
        type: "service.health.changed",
        service: name,
        data: { oldHealth, newHealth: health },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Subscribe to service events.
   */
  on(type: ServiceEventType, handler: MessageHandler): () => void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
    return () => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }

  /**
   * Emit a service event.
   */
  emit(event: ServiceEvent): void {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.warn("Service event handler threw an error", { eventType: event.type, error });
      }
    }
  }

  /**
   * Start periodic health checks.
   */
  startHealthChecks(intervalMs: number = 30_000): void {
    if (this.healthCheckInterval) return;
    this.healthCheckInterval = setInterval(() => {
      for (const service of this.services.values()) {
        service.lastHealthCheck = Date.now();
      }
    }, intervalMs);
  }

  /**
   * Stop health checks.
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get registry status.
   */
  getStatus(): { total: number; healthy: number; degraded: number; unhealthy: number } {
    const services = this.list();
    return {
      total: services.length,
      healthy: services.filter((s) => s.health === "healthy").length,
      degraded: services.filter((s) => s.health === "degraded").length,
      unhealthy: services.filter((s) => s.health === "unhealthy").length,
    };
  }
}

/** Global singleton registry */
export const globalRegistry = new ServiceRegistry();
