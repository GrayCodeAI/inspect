/**
 * SSO (Single Sign-On) integration.
 * Supports SAML 2.0, OIDC, Azure AD, and Okta configurations.
 */

import { randomBytes } from "node:crypto";
import { createLogger } from "@inspect/observability";

const logger = createLogger("enterprise/sso");

export type SSOProvider = "saml" | "oidc" | "azure-ad" | "okta";

export interface SSOConfig {
  provider: SSOProvider;
  entityId: string;
  ssoUrl: string;
  certificate?: string;
  callbackUrl: string;
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  scopes?: string[];
}

export interface SSOSession {
  sessionId: string;
  userId: string;
  email: string;
  displayName?: string;
  roles: string[];
  tenantId?: string;
  createdAt: number;
  expiresAt: number;
  provider: SSOProvider;
  attributes: Record<string, string>;
}

export interface SSOAuthRequest {
  requestId: string;
  redirectUrl: string;
  state: string;
  nonce?: string;
  provider: SSOProvider;
}

/**
 * SSOManager handles Single Sign-On authentication flows.
 * Supports SAML, OIDC, Azure AD, and Okta providers.
 */
export class SSOManager {
  private config: SSOConfig;
  private sessions = new Map<string, SSOSession>();
  private pendingRequests = new Map<string, SSOAuthRequest>();

  constructor(config: SSOConfig) {
    this.config = config;
  }

  /**
   * Initiate SSO authentication flow.
   * Returns the redirect URL and state for the client.
   */
  initiateAuth(): SSOAuthRequest {
    const requestId = randomBytes(16).toString("hex");
    const state = randomBytes(32).toString("hex");

    let redirectUrl: string;
    const nonce = randomBytes(16).toString("hex");

    switch (this.config.provider) {
      case "saml":
        redirectUrl = `${this.config.ssoUrl}?SAMLRequest=${encodeURIComponent(requestId)}&RelayState=${state}`;
        break;
      case "oidc":
      case "azure-ad":
      case "okta": {
        const params = new URLSearchParams({
          client_id: this.config.clientId ?? "",
          response_type: "code",
          scope: (this.config.scopes ?? ["openid", "profile", "email"]).join(" "),
          redirect_uri: this.config.callbackUrl,
          state,
          nonce,
        });
        redirectUrl = `${this.config.ssoUrl}?${params.toString()}`;
        break;
      }
    }

    const request: SSOAuthRequest = {
      requestId,
      redirectUrl,
      state,
      nonce,
      provider: this.config.provider,
    };

    this.pendingRequests.set(state, request);
    logger.debug("SSO auth initiated", { provider: this.config.provider, requestId });
    return request;
  }

  /**
   * Handle SSO callback and create a session.
   */
  handleCallback(
    state: string,
    userInfo: {
      userId: string;
      email: string;
      displayName?: string;
      roles?: string[];
      tenantId?: string;
    },
  ): SSOSession {
    const pending = this.pendingRequests.get(state);
    if (!pending) {
      throw new Error("Invalid or expired SSO state parameter");
    }
    this.pendingRequests.delete(state);

    const session: SSOSession = {
      sessionId: randomBytes(16).toString("hex"),
      userId: userInfo.userId,
      email: userInfo.email,
      displayName: userInfo.displayName,
      roles: userInfo.roles ?? [],
      tenantId: userInfo.tenantId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
      provider: this.config.provider,
      attributes: {},
    };

    this.sessions.set(session.sessionId, session);
    logger.info("SSO session created", { userId: session.userId, provider: this.config.provider });
    return session;
  }

  /**
   * Validate an existing session.
   */
  validateSession(sessionId: string): SSOSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  /**
   * Revoke a session.
   */
  revokeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get metadata URL for provider configuration.
   */
  getMetadataUrl(): string {
    switch (this.config.provider) {
      case "saml":
        return `${this.config.callbackUrl}/metadata`;
      case "oidc":
      case "azure-ad":
      case "okta":
        return `${this.config.issuer ?? this.config.ssoUrl}/.well-known/openid-configuration`;
    }
  }

  /**
   * Get the provider configuration.
   */
  getConfig(): Readonly<SSOConfig> {
    return { ...this.config };
  }

  /**
   * Generate a SAML metadata XML document.
   */
  static generateSAMLMetadata(entityId: string, callbackUrl: string): string {
    return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${callbackUrl}"
      index="1" />
  </SPSSODescriptor>
</EntityDescriptor>`;
  }

  /**
   * Active session count.
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
