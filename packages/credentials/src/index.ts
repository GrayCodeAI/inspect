// ============================================================================
// @inspect/credentials - Credential Management Package
// ============================================================================

// Vault
export { CredentialVault } from "./vault.js";
export type {
  CreateCredentialOptions,
  UpdateCredentialOptions,
  CredentialTestResult,
} from "./vault.js";

// Providers
export { NativeCredentialStore } from "./providers/native.js";
export type { NativeCredentialEntry } from "./providers/native.js";
export { BitwardenIntegration } from "./providers/bitwarden.js";
export type { BitwardenItem, BitwardenStatus } from "./providers/bitwarden.js";
export { OnePasswordIntegration } from "./providers/onepassword.js";
export type {
  OnePasswordItem,
  OnePasswordField,
  OnePasswordVault,
} from "./providers/onepassword.js";
export { AzureKeyVaultIntegration } from "./providers/azure-keyvault.js";
export type { AzureSecret, AzureSecretMetadata } from "./providers/azure-keyvault.js";
export { CustomHTTPProvider } from "./providers/custom-http.js";
export type {
  CustomHTTPProviderConfig,
  HTTPCredentialResponse,
} from "./providers/custom-http.js";

// OTP
export { TOTPGenerator } from "./otp/totp.js";
export type { TOTPOptions, TOTPVerifyResult } from "./otp/totp.js";
export { EmailPoller } from "./otp/email-poll.js";
export type { EmailPollerConfig, OTPResult } from "./otp/email-poll.js";
export { SMSPoller } from "./otp/sms-poll.js";
export type { SMSPollerConfig, SMSOTPResult } from "./otp/sms-poll.js";
