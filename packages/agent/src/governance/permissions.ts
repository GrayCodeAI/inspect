/**
 * PermissionManager — controls agent permissions for domains and actions.
 * Stub implementation for CLI compilation.
 */

export interface PermissionConfig {
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowedActions?: string[];
  blockedActions?: string[];
}

export interface Permissions {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedActions: string[];
  blockedActions: string[];
  maxFileUploadSize: number;
  allowFormSubmission: boolean;
  allowNavigation: boolean;
  allowJavaScript: boolean;
  allowDownloads: boolean;
  allowCookies: boolean;
}

export class PermissionManager {
  private permissions: Permissions;

  constructor(config?: PermissionConfig) {
    this.permissions = {
      allowedDomains: config?.allowedDomains ?? ["*"],
      blockedDomains: config?.blockedDomains ?? [],
      allowedActions: config?.allowedActions ?? ["*"],
      blockedActions: config?.blockedActions ?? [],
      maxFileUploadSize: 10 * 1024 * 1024,
      allowFormSubmission: true,
      allowNavigation: true,
      allowJavaScript: true,
      allowDownloads: true,
      allowCookies: true,
    };
  }

  getPermissions(): Permissions {
    return this.permissions;
  }
}
