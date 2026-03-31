// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Browser Configuration Types
// ──────────────────────────────────────────────────────────────────────────────

/** Proxy configuration */
export interface ProxyConfig {
  server: string;
  bypass?: string;
  username?: string;
  password?: string;
  type?: 'http' | 'https' | 'socks5';
}

/** Geolocation configuration */
export interface GeolocationConfig {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/** Cookie parameter for injection */
export interface CookieParam {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  url?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** Browser cookie data (full extraction) */
export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  source?: string;
}

/** Viewport dimensions */
export interface ViewportConfig {
  width: number;
  height: number;
}

/** Full browser launch configuration */
export interface BrowserConfig {
  headless: boolean;
  executablePath?: string;
  viewport: ViewportConfig;
  proxy?: ProxyConfig;
  locale?: string;
  timezone?: string;
  stealth: boolean;
  extensions?: string[];
  userAgent?: string;
  deviceScaleFactor?: number;
  hasTouch?: boolean;
  isMobile?: boolean;
  channel?: 'stable' | 'dev' | 'canary' | 'beta';
  args?: string[];
  geolocation?: GeolocationConfig;
  permissions?: string[];
  disableCORS?: boolean;
  disableCSP?: boolean;
  deterministicRendering?: boolean;
  disableSandbox?: boolean;
  navigationTimeout?: number;
  actionTimeout?: number;
  userDataDir?: string;
  cdpEndpoint?: string;
  downloadsPath?: string;
  maxDownloadSize?: number;
  chromiumPoliciesPath?: string;
  backend?: 'chromium' | 'lightpanda';
  extraHTTPHeaders?: Record<string, string>;
  initScripts?: string[];
  ignoreHTTPSErrors?: boolean;
  recordVideo?: boolean;
  recordHar?: boolean;
  colorScheme?: 'light' | 'dark' | 'no-preference';
  reducedMotion?: 'reduce' | 'no-preference';
  cookies?: CookieParam[];
  storageStatePath?: string;
  slowMo?: number;
  defaultTimeout?: number;
  includedDomAttributes?: string[];
  clickableTextLengthLimit?: number;
}

/** Browser cookie extraction config */
export interface BrowserCookieConfig {
  name: string;
  paths: {
    darwin?: string[];
    linux?: string[];
    win32?: string[];
  };
  cookieFile: string;
  encryption: 'chromium' | 'firefox' | 'safari' | 'none';
  profilePattern?: string;
}

/** Docker environment configuration */
export interface DockerConfig {
  isDocker: boolean;
  gpuEnabled: boolean;
  devShmSize: string;
  chromeFlags: string[];
}

/** Device emulation preset */
export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  dpr: number;
  userAgent: string;
  touch: boolean;
  mobile: boolean;
  platform?: string;
}
