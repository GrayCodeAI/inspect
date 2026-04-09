// ──────────────────────────────────────────────────────────────────────────────
// Login Redirect Watchdog
// Detects and handles authentication redirects
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";

export interface LoginRedirectConfig {
  /** URLs that indicate login page */
  loginUrlPatterns?: RegExp[];
  /** Check for redirect (default: true) */
  checkRedirect?: boolean;
  /** Callback when login redirect detected */
  onLoginRedirect?: (info: LoginRedirectInfo) => Promise<boolean>;
  /** Credentials provider */
  credentials?: {
    username: string;
    password: string;
  };
  /** Custom login handler */
  customLoginHandler?: (
    page: Page,
    credentials: { username: string; password: string },
  ) => Promise<boolean>;
  /** Timeout for login (ms) */
  loginTimeout?: number;
}

export interface LoginRedirectInfo {
  /** Original URL before redirect */
  originalUrl: string;
  /** Current URL (login page) */
  currentUrl: string;
  /** Type of redirect detected */
  type: "oauth" | "saml" | "basic" | "custom" | "unknown";
  /** Whether credentials are available */
  hasCredentials: boolean;
  /** Login form detected */
  loginForm?: {
    usernameField?: string;
    passwordField?: string;
    submitButton?: string;
  };
  /** OAuth provider (if OAuth) */
  oauthProvider?: string;
}

const DEFAULT_LOGIN_PATTERNS = [
  /\/login/i,
  /\/signin/i,
  /\/auth/i,
  /\/authenticate/i,
  /\/oauth/i,
  /\/sso/i,
  /accounts\.google\.com/i,
  /login\.microsoftonline\.com/i,
  /auth0\.com/i,
  /okta\.com/i,
  /onelogin\.com/i,
  /github\.com\/login/i,
  /gitlab\.com\/users\/sign_in/i,
];

const OAUTH_PROVIDERS = [
  { pattern: /accounts\.google\.com/, name: "Google" },
  { pattern: /login\.microsoftonline\.com/, name: "Microsoft" },
  { pattern: /facebook\.com\/login/, name: "Facebook" },
  { pattern: /github\.com\/login/, name: "GitHub" },
  { pattern: /gitlab\.com/, name: "GitLab" },
  { pattern: /auth0\.com/, name: "Auth0" },
  { pattern: /okta\.com/, name: "Okta" },
  { pattern: /onelogin\.com/, name: "OneLogin" },
  { pattern: /appleid\.apple\.com/, name: "Apple" },
  { pattern: /linkedin\.com\/oauth/, name: "LinkedIn" },
];

/**
 * Login Redirect Watchdog
 */
export class LoginRedirectWatchdog {
  private page: Page;
  private config: LoginRedirectConfig;
  private originalUrl?: string;

  constructor(page: Page, config: LoginRedirectConfig = {}) {
    this.page = page;
    this.config = config;
  }

  /**
   * Monitor for login redirects
   */
  async monitor<T>(action: () => Promise<T>): Promise<T> {
    this.originalUrl = this.page.url();

    try {
      const result = await action();

      // Check if we were redirected
      const redirectInfo = await this.checkForRedirect();
      if (redirectInfo) {
        const handled = await this.handleRedirect(redirectInfo);
        if (!handled) {
          throw new Error(
            `Login redirect detected but not handled. Current URL: ${redirectInfo.currentUrl}`,
          );
        }
      }

      return result;
    } catch (error) {
      // Check if error is due to login redirect
      const redirectInfo = await this.checkForRedirect();
      if (redirectInfo) {
        const handled = await this.handleRedirect(redirectInfo);
        if (handled) {
          // Retry the action
          return action();
        }
        throw new Error(
          `Login redirect detected but not handled. Current URL: ${redirectInfo.currentUrl}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * Check if we were redirected to a login page
   */
  async checkForRedirect(): Promise<LoginRedirectInfo | undefined> {
    const currentUrl = this.page.url();
    const originalUrl = this.originalUrl ?? currentUrl;

    // Don't consider it a redirect if URL hasn't changed
    if (currentUrl === originalUrl) return undefined;

    // Check if current URL matches login patterns
    const patterns = [...(this.config.loginUrlPatterns ?? []), ...DEFAULT_LOGIN_PATTERNS];

    const isLoginPage = patterns.some((pattern) => pattern.test(currentUrl));
    if (!isLoginPage) return undefined;

    // Detect login type
    const type = await this.detectLoginType();

    // Detect OAuth provider
    const oauthProvider = OAUTH_PROVIDERS.find((p) => p.pattern.test(currentUrl))?.name;

    // Try to find login form
    const loginForm = await this.detectLoginForm();

    return {
      originalUrl,
      currentUrl,
      type,
      hasCredentials: !!this.config.credentials,
      loginForm,
      oauthProvider,
    };
  }

  /**
   * Detect login type
   */
  private async detectLoginType(): Promise<LoginRedirectInfo["type"]> {
    const url = this.page.url().toLowerCase();

    if (url.includes("oauth") || url.includes("oauth2")) {
      return "oauth";
    }
    if (url.includes("saml")) {
      return "saml";
    }

    // Check for basic auth form
    const hasBasicForm = await this.page
      .locator('input[type="password"]')
      .count()
      .then((c) => c > 0);

    if (hasBasicForm) {
      return "basic";
    }

    return "unknown";
  }

  /**
   * Detect login form fields
   */
  private async detectLoginForm(): Promise<LoginRedirectInfo["loginForm"]> {
    const form: LoginRedirectInfo["loginForm"] = {};

    // Common username field selectors
    const usernameSelectors = [
      'input[type="email"]',
      'input[type="text"]',
      'input[name="username"]',
      'input[name="email"]',
      'input[id="username"]',
      'input[id="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="username" i]',
    ];

    for (const selector of usernameSelectors) {
      try {
        const visible = await this.page.locator(selector).first().isVisible();
        if (visible) {
          form.usernameField = selector;
          break;
        }
      } catch {
        // Continue
      }
    }

    // Password field
    const passwordSelector = 'input[type="password"]';
    try {
      const visible = await this.page.locator(passwordSelector).first().isVisible();
      if (visible) {
        form.passwordField = passwordSelector;
      }
    } catch {
      // No password field
    }

    // Submit button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Login")',
    ];

    for (const selector of submitSelectors) {
      try {
        const visible = await this.page.locator(selector).first().isVisible();
        if (visible) {
          form.submitButton = selector;
          break;
        }
      } catch {
        // Continue
      }
    }

    return form;
  }

  /**
   * Handle login redirect
   */
  private async handleRedirect(info: LoginRedirectInfo): Promise<boolean> {
    // Call custom handler if provided
    if (this.config.onLoginRedirect) {
      return this.config.onLoginRedirect(info);
    }

    // Handle based on type
    switch (info.type) {
      case "oauth":
        return this.handleOAuth(info);
      case "saml":
        return this.handleSAML(info);
      case "basic":
        return this.handleBasicAuth(info);
      default:
        return this.handleUnknown(info);
    }
  }

  /**
   * Handle OAuth redirect
   */
  private async handleOAuth(info: LoginRedirectInfo): Promise<boolean> {
    // OAuth typically requires manual intervention
    // Log the OAuth provider for debugging
    console.log(
      `[LoginRedirectWatchdog] OAuth redirect detected: ${info.oauthProvider ?? "Unknown"}`,
    );

    if (!this.config.credentials) {
      console.log("[LoginRedirectWatchdog] No credentials provided for OAuth");
      return false;
    }

    // Some OAuth flows have username/password on the same page
    if (info.loginForm?.usernameField && info.loginForm?.passwordField) {
      return this.performLogin(info);
    }

    return false;
  }

  /**
   * Handle SAML redirect
   */
  private async handleSAML(info: LoginRedirectInfo): Promise<boolean> {
    console.log("[LoginRedirectWatchdog] SAML redirect detected");

    if (!this.config.credentials) {
      return false;
    }

    return this.performLogin(info);
  }

  /**
   * Handle basic auth
   */
  private async handleBasicAuth(info: LoginRedirectInfo): Promise<boolean> {
    if (!this.config.credentials) {
      console.log("[LoginRedirectWatchdog] Basic auth detected but no credentials provided");
      return false;
    }

    return this.performLogin(info);
  }

  /**
   * Handle unknown login type
   */
  private async handleUnknown(info: LoginRedirectInfo): Promise<boolean> {
    console.log(`[LoginRedirectWatchdog] Unknown login type at: ${info.currentUrl}`);

    if (info.loginForm?.usernameField && info.loginForm?.passwordField) {
      return this.performLogin(info);
    }

    return false;
  }

  /**
   * Perform login with credentials
   */
  private async performLogin(info: LoginRedirectInfo): Promise<boolean> {
    if (!this.config.credentials || !info.loginForm) {
      return false;
    }

    // Use custom handler if provided
    if (this.config.customLoginHandler) {
      return this.config.customLoginHandler(this.page, this.config.credentials);
    }

    try {
      // Fill username
      if (info.loginForm.usernameField) {
        await this.page.fill(info.loginForm.usernameField, this.config.credentials.username);
      }

      // Fill password
      if (info.loginForm.passwordField) {
        await this.page.fill(info.loginForm.passwordField, this.config.credentials.password);
      }

      // Submit
      if (info.loginForm.submitButton) {
        await this.page.click(info.loginForm.submitButton);
      } else {
        // Press enter on password field
        await this.page.press(info.loginForm.passwordField!, "Enter");
      }

      // Wait for navigation
      await this.page.waitForLoadState("networkidle", {
        timeout: this.config.loginTimeout ?? 30000,
      });

      // Check if login succeeded
      const currentUrl = this.page.url();
      const stillOnLoginPage = DEFAULT_LOGIN_PATTERNS.some((p) => p.test(currentUrl));

      if (stillOnLoginPage) {
        // Check for error message
        const errorVisible = await this.page
          .locator('[role="alert"], .error, .alert, .notification')
          .isVisible()
          .catch(() => false);

        if (errorVisible) {
          console.log("[LoginRedirectWatchdog] Login failed - error message visible");
          return false;
        }

        // Might be MFA or additional steps
        console.log("[LoginRedirectWatchdog] Login might require additional steps (MFA?)");
        return false;
      }

      return true;
    } catch (error) {
      console.error("[LoginRedirectWatchdog] Login failed:", error);
      return false;
    }
  }
}

/** Create login redirect watchdog */
export function createLoginRedirectWatchdog(
  page: Page,
  config?: LoginRedirectConfig,
): LoginRedirectWatchdog {
  return new LoginRedirectWatchdog(page, config);
}
