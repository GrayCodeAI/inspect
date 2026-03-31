// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Credential Management Types
// ──────────────────────────────────────────────────────────────────────────────

/** Supported credential provider types */
export type CredentialProviderType =
  | 'native' | 'bitwarden' | '1password' | 'azure-key-vault' | 'custom-http';

/** Credential type */
export type CredentialType = 'password' | 'api-key' | 'oauth' | 'totp' | 'certificate';

/** Credential configuration */
export interface CredentialConfig {
  id: string;
  provider: CredentialProviderType;
  type: CredentialType;
  data: Record<string, unknown>;
  label?: string;
  domain?: string;
  profileId?: string;
  totpSecret?: string;
  createdAt: number;
  updatedAt: number;
  lastTestedAt?: number;
  lastTestPassed?: boolean;
}
