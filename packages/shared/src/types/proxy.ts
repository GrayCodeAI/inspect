// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Proxy Server & Fault Injection Types
// ──────────────────────────────────────────────────────────────────────────────

/** Toxic type (fault injection) */
export type ToxicType =
  | "latency"
  | "bandwidth"
  | "timeout"
  | "slow_close"
  | "slicer"
  | "limit_data"
  | "reset_peer";

/** Toxicity level (0-1 probability) */
export type Toxicity = number;

/** Toxic configuration */
export interface ToxicConfig {
  /** Toxic type */
  type: ToxicType;
  /** Toxic name */
  name: string;
  /** Toxicity level (0-1, default 1.0) */
  toxicity?: Toxicity;
  /** Type-specific attributes */
  attributes: Record<string, unknown>;
}

/** Proxy server configuration */
export interface ProxyServerConfig {
  /** Server listen port */
  port: number;
  /** Upstream host to proxy */
  upstream: string;
  /** Name of the proxy */
  name?: string;
  /** Enable TLS */
  tls?: boolean;
  /** Initial toxics to apply */
  toxics?: ToxicConfig[];
}

/** Proxy server status */
export interface ProxyServerStatus {
  name: string;
  listen: string;
  upstream: string;
  enabled: boolean;
  toxics: ToxicConfig[];
}

/** Toxicity presets for common network conditions */
export interface ToxicityPreset {
  name: string;
  description: string;
  toxics: ToxicConfig[];
}

/** Proxy group for coordinated fault injection */
export interface ProxyGroup {
  name: string;
  proxies: string[];
  sharedToxics: ToxicConfig[];
}
