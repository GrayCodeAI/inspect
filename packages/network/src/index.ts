// ──────────────────────────────────────────────────────────────────────────────
// @inspect/network - Network utilities: proxies, security, tunnels
// ──────────────────────────────────────────────────────────────────────────────

// Proxy management
export { ProxyManager } from "./proxy/manager.js";
export type { ProxyEntry, GetProxyOptions } from "./proxy/manager.js";

export { Socks5Client } from "./proxy/socks5.js";
export type { Socks5ConnectResult } from "./proxy/socks5.js";

// Domain security
export { DomainSecurity, DEFAULT_BLOCKED } from "./security/domains.js";
export type { UrlValidationResult } from "./security/domains.js";

// Sensitive data masking
export { SensitiveDataMasker } from "./security/masking.js";
export type { MaskingPattern, MaskRegion } from "./security/masking.js";

// Cloudflare tunnel management
export { TunnelManager } from "./tunnel/cloudflare.js";
export type { TunnelInfo, TunnelOptions } from "./tunnel/cloudflare.js";
