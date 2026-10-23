/**
 * Post-write confirmation for the side panel (design §4.2 step 7.c).
 *
 * `chrome.storage.local.set` resolving is not proof that the record reached
 * disk. Every successful vault write is confirmed through the shared core's
 * read-only primitive before the in-memory result is adopted. The guard owns
 * only that policy; the hook supplies the consequence of a failed check
 * (lock, reload, notice) and stops adopting the result.
 *
 * No browser API, no React: the module runs under plain vitest with injected
 * `VaultDeps`.
 */
import {
  verifyRecordHash,
  verifyWalletAbsent,
  type VaultDeps,
} from '@limccn/longstone-wallet';

export interface WriteGuard {
  /** `true` only when the record on disk hashes to `recordHash`. */
  confirmRecordHash(recordHash: string): Promise<boolean>;
  /** `true` only when both wallet keys are confirmed absent. */
  confirmAbsent(): Promise<boolean>;
}

export interface WriteGuardOptions {
  deps: VaultDeps;
  /** Called exactly once per failed confirmation. */
  onUnverified: () => void;
}

export function createWriteGuard({ deps, onUnverified }: WriteGuardOptions): WriteGuard {
  return {
    async confirmRecordHash(recordHash) {
      if (await verifyRecordHash(deps, recordHash)) return true;
      onUnverified();
      return false;
    },
    async confirmAbsent() {
      if (await verifyWalletAbsent(deps)) return true;
      onUnverified();
      return false;
    },
  };
}
