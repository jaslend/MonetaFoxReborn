/**
 * Phase 2 local auth vault — public API.
 *
 * The hidden contract test pins these signatures; do not drift.
 */
export type { SetupInput, AuthResult, VaultInfo } from './vault';
export {
  VERIFIER_PLAINTEXT,
  getVaultInfo,
  getStoredVault,
  setupVault,
  authenticate,
  deleteVault,
} from './vault';
export { AuthDB, AUTH_DB_NAME, type VaultRecord } from './vaultDb';
